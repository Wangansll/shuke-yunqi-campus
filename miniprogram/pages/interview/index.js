// pages/interview/index.js —— 模拟面试（普通 / 专业 / 压力 三档）
//
// 一句话说清这页怎么分工：
// - 题目由 utils/interview-rag 按档位生成，专业面落在某条吉利机会的岗位方向上；
// - 面试官的追问与点评由模型写（它擅长这个）；
// - 分数由本地算（可解释、断网也有分），模型只写人话复盘，不改分数。
const { cloud, pickModel, modelLabel } = require('../../utils/biz')
const { LEVELS, buildSys, feedbackSys } = require('../../utils/interview')
const RAG = require('../../utils/interview-rag')
const C = require('../../utils/career')
const ASR = require('../../utils/asr')
const Probe = require('../../utils/audio-probe')

// 专业面只落在吉利系的机会上：岗位方向与流程来自官网原文，asJob 把它们拼成 JD 形态
const PRO_OPPS = C.OPP

// 标题里已经带公司名时不再重复（如「吉利百矿集团 2025 年春季校园招聘」）
const labelOf = (o) => (o.title.indexOf(o.org) === 0 ? o.title : o.org + ' · ' + o.title)

let seq = 0
let recorder = null

function clean(t) {
  if (!t) return ''
  return String(t)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
}

function flip(cur) { return cur === 'btA' ? 'btB' : 'btA' }

Page({
  data: {
    levels: LEVELS,
    level: 'normal',
    jobs: PRO_OPPS.map((o) => ({ id: o.id, co: o.org, pos: o.title, d: o.d, kind: o.kindName })),
    jobUrl: '',
    jobName: '',
    profile: '',
    mode: 'text', // 作答方式：文字 / 语音（语音未接 ASR 时降级文字）

    step: 'setup', // setup | chat | report
    messages: [],
    input: '',
    generating: false,
    modelReady: false,
    modelName: '',

    queue: [],
    totalQ: 0,
    qIndex: 0,
    answers: [],
    awaitFollow: false,
    isLast: false,
    answered: false,

    summary: null,
    review: '',

    recording: false,
    asrReady: false,
    asrBusy: false,      // 录音已停、正在上传转写
    probing: false,      // 正在探测模型是否支持音频输入
    endAnchor: 'btA',
  },

  async onLoad(options) {
    const o = options || {}
    const patch = {}
    if (o.track && LEVELS.some((l) => l.k === o.track)) patch.level = o.track
    if (o.job) {
      const id = decodeURIComponent(o.job)
      const opp = C.findById(id)
      if (opp) {
        patch.level = 'pro'
        patch.jobUrl = id
        patch.jobName = labelOf(opp)
      }
    }
    // 语音作答只在专业档开放：从别处带 track/job 进来时，非专业档一律用文字
    if (patch.level && patch.level !== 'pro') patch.mode = 'text'
    this.setData(patch)
    try {
      const m = await pickModel()
      this.setData({ model: m, modelReady: !!m, modelName: modelLabel(m) })
    } catch (e) {
      wx.showToast({ title: '模型连接失败，仍可本地评分', icon: 'none' })
    }
  },

  pickLevel(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    // 语音作答只在专业档：切到普通/压力档自动落回文字
    const patch = { level: k }
    if (k !== 'pro') patch.mode = 'text'
    this.setData(patch)
  },

  pickJob(e) {
    const id = e.currentTarget.dataset.id
    const opp = C.findById(id)
    if (!opp) return
    this.setData({ jobUrl: id, jobName: labelOf(opp) })
  },

  onProfile(e) { this.setData({ profile: e.detail.value }) },
  pickMode(e) {
    const m = e.currentTarget.dataset.mode
    // 语音仅在专业面试档开放；其它档点了也只给文字
    if (m === 'voice' && this.data.level !== 'pro') {
      wx.showToast({ title: '语音作答仅专业面试档开放', icon: 'none' })
      return
    }
    if (m) this.setData({ mode: m })
  },
  onInput(e) { this.setData({ input: e.detail.value }) },

  // 探测当前模型能不能直接吃音频（input_audio）：发一段测试音，看回话还是报错。
  // 这一步只验证能力，不改任何作答数据；确认支持后才会把语音作答改成音频直入。
  async probeVoice() {
    if (this.data.probing) return
    this.setData({ probing: true })
    wx.showLoading({ title: '正在检测', mask: true })
    let r
    try {
      r = await Probe.probe(this.data.model)
    } catch (e) {
      r = { ok: false, supported: null, detail: String((e && e.message) || e || '检测失败') }
    }
    wx.hideLoading()
    this.setData({ probing: false })
    if (r.supported === true) {
      wx.showModal({
        title: '模型接受音频输入',
        content: '当前模型（' + (r.model || '云端模型') + '）没拒绝音频。它听到的是：「' + (r.heard || '（无文字回复）') + '」\n\n若上面确实描述了那个音调，就可以做「语音直入、不转文字」；若它说没收到音频，说明只是没报错、并没真听，需要换支持音频的模型。',
        showCancel: false, confirmText: '知道了',
      })
    } else if (r.supported === false) {
      const why = r.reason === 'http400'
        ? '云端接口直接拒绝了音频输入（HTTP 400），说明当前模型不接受语音直入。'
        : ('模型拒绝了音频输入（' + (r.detail || 'unknown content type') + '）。')
      wx.showModal({
        title: '当前模型不支持语音直入',
        content: why + '\n\n「说话不转文字直接进 AI」这条路在当前模型上做不到，请用文字作答。结论已确定，不用重复点检测。',
        showCancel: false, confirmText: '知道了',
      })
    } else {
      wx.showModal({
        title: '暂时无法确认',
        content: '检测没跑完：' + (r.detail || '模型可能还没连上') + '。这多半是网络或模型连接问题，不是音频能力问题，可稍后再试。',
        showCancel: false, confirmText: '知道了',
      })
    }
  },

  // ---------- 开始 ----------
  start() {
    const level = this.data.level
    const opp = C.findById(this.data.jobUrl)
    const job = opp ? C.asJob(opp.id) : null
    if (level === 'pro' && !job) {
      wx.showToast({ title: '先选一条岗位', icon: 'none' })
      return
    }
    const queue = RAG.buildQuestions(level, job)
    this.points = RAG.pointsOf(job)
    this.ctx = RAG.contextOf(job, level)
    this.job = job
    this.setData({
      step: 'chat',
      queue,
      totalQ: queue.length,
      qIndex: 1,
      answers: [],
      messages: [],
      context: [],
      input: '',
      summary: null,
      review: '',
      awaitFollow: false,
      isLast: queue.length <= 1,
      answered: false,
      endAnchor: 'btA',
    })
    this.askQuestion(0)
  },

  // ---------- 出题 ----------
  async askQuestion(i) {
    const q = this.data.queue[i]
    if (!q) { this.finish(); return }
    this.setData({ qIndex: i + 1, awaitFollow: false, isLast: i + 1 >= this.data.totalQ, answered: false })
    const sys = buildSys(this.data.level, this.ctx, { job: this.job, profile: this.data.profile.trim() })
    const api = [
      { role: 'system', content: sys },
      ...(this.data.context || []).slice(-10),
      { role: 'user', content: '（评委提示，不要念给候选人）请向候选人提出这道题，只问这一题：' + q },
    ]
    await this.say(api)
  },

  // ---------- 作答 ----------
  async send() {
    const text = (this.data.input || '').trim()
    if (!text || this.data.generating) return
    const i = this.data.qIndex - 1
    const q = this.data.queue[i]
    if (!q) return

    // 压力面第二次作答算同一题的追问，合并后再评分
    const prev = this.data.answers[i]
    const merged = prev ? prev.a + ' ' + text : text
    const sc = RAG.scoreAnswer(merged, this.points, this.data.level)
    const rec = {
      q,
      a: merged,
      aShort: merged.length > 160 ? merged.slice(0, 160) + '…' : merged,
      pt: sc.pt,
      dims: sc.dims,
      hit: sc.hit,
      // 缺失要点只摆前三个：一屏列出五六个"缺什么"，看着像判卷，实际用不上
      miss: sc.miss.slice(0, 3),
      missRest: Math.max(0, sc.miss.length - 3),
      tip: sc.tip,
      len: sc.len,
      followed: !!prev,
    }
    const answers = this.data.answers.slice()
    answers[i] = rec
    this.setData({ answers, input: '', answered: true })

    // 压力面每答必追；其余档只在答得太短时追一句
    const need = this.data.level === 'stress' ? !prev : sc.len < 30
    const sys = buildSys(this.data.level, this.ctx, { job: this.job, profile: this.data.profile.trim() })
    const ask = need
      ? '（评委提示，不要念给候选人）就候选人刚才的回答，指出一个含糊的地方并追问一层，只问一个问题；不要给建议，不要说“下一题”。'
      : '（评委提示，不要念给候选人）用一两句话点评刚才的回答：一个优点、一个可改进点。不要提出新问题。'
    const api = [
      { role: 'system', content: sys },
      ...(this.data.context || []).slice(-10),
      { role: 'user', content: text },
      { role: 'user', content: ask },
    ]
    this.setData({ awaitFollow: need })
    await this.say(api)
  },

  // 下一题 / 结束
  next() {
    if (this.data.generating) return
    const i = this.data.qIndex
    if (i < this.data.totalQ) this.askQuestion(i)
    else this.finish()
  },

  // ---------- 复盘 ----------
  async finish() {
    if (this.data.generating) return
    if (!this.data.answers.length) {
      wx.showToast({ title: '先回答一题', icon: 'none' })
      return
    }
    const sum = RAG.summarize(this.data.answers)
    this.setData({ step: 'report', summary: sum, review: '', generating: true, awaitFollow: false })

    if (!this.data.modelReady) {
      this.setData({ review: sum.advice, generating: false })
      return
    }

    const sys = feedbackSys(this.data.level, sum, this.data.answers)
    const api = [
      { role: 'system', content: sys },
      ...(this.data.context || []).slice(-12),
      { role: 'user', content: '面试到这里结束，请按四段写复盘。' },
    ]
    let full = ''
    try {
      for await (const chunk of cloud.llm.chat.completions.create({
        model: this.data.model.id, messages: api, stream: true,
      })) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (d && d.content) {
          full += d.content
          this.setData({ review: clean(full) })
        }
      }
      if (!full) this.setData({ review: sum.advice })
    } catch (e) {
      this.setData({ review: (full ? clean(full) + '\n\n' : '') + sum.advice })
    } finally {
      this.setData({ generating: false })
    }
  },

  // ---------- 与模型对话 ----------
  async say(apiMessages) {
    const aid = ++seq
    const messages = this.data.messages.concat([
      { id: aid, role: 'assistant', disp: '', streaming: true },
    ])
    this.setData({ messages, generating: true, endAnchor: flip(this.data.endAnchor) })

    let full = ''
    let last = 0
    try {
      const controller = (typeof AbortController === 'function') ? new AbortController() : null
      this.controller = controller
      const opts = { model: this.data.model.id, messages: apiMessages, stream: true }
      if (controller && controller.signal) opts.signal = controller.signal
      for await (const chunk of cloud.llm.chat.completions.create(opts)) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (d && d.content) {
          full += d.content
          const now = Date.now()
          if (now - last > 80) { last = now; this.paint(aid, full, true) }
        }
      }
      this.paint(aid, full, false)
    } catch (e) {
      const idx = this.data.messages.findIndex((m) => m.id === aid)
      const txt = full ? full + '\n\n（回答中断）' : '连接出现问题，可以继续作答，分数仍会本地计算。'
      if (idx >= 0) this.setData({
        ['messages[' + idx + '].disp']: clean(txt),
        ['messages[' + idx + '].streaming']: false,
      })
    } finally {
      this.setData({ generating: false })
    }

    // 上下文：只收候选人的真实发言 + 面试官回复，导演提示不进历史
    const cand = apiMessages[apiMessages.length - 2]
    const fromUser = cand && cand.role === 'user' && String(cand.content).indexOf('（评委提示') < 0
    const ctx = (this.data.context || [])
      .concat(fromUser ? [{ role: 'user', content: cand.content }] : [])
      .concat(full ? [{ role: 'assistant', content: full }] : [])
      .slice(-14)
    this.setData({ context: ctx })
    return full
  },

  paint(aid, text, streaming) {
    const idx = this.data.messages.findIndex((m) => m.id === aid)
    if (idx < 0) return
    this.setData({
      ['messages[' + idx + '].disp']: clean(text),
      ['messages[' + idx + '].streaming']: streaming,
      endAnchor: flip(this.data.endAnchor),
    })
  },

  onSendOrStop() {
    if (this.data.generating) {
      if (this.controller && typeof this.controller.abort === 'function') {
        try { this.controller.abort() } catch (e) {}
      }
      this.setData({ generating: false })
    } else {
      this.send()
    }
  },

  // ---------- 语音（ASR 未接入时降级为文字） ----------
  ensureRecorder() {
    if (recorder) return recorder
    recorder = wx.getRecorderManager()
    recorder.onStop((res) => {
      this.setData({ recording: false })
      if (res && res.tempFilePath) this.transcribeAudio(res.tempFilePath)
    })
    recorder.onError(() => {
      this.setData({ recording: false })
      wx.showToast({ title: '录音失败，请重试', icon: 'none' })
    })
    return recorder
  },

  toggleRecord() {
    if (this.data.generating || this.data.asrBusy) return
    if (this.data.level !== 'pro') {
      wx.showToast({ title: '语音作答仅专业面试档开放', icon: 'none' })
      return
    }
    if (this.data.recording) { this.ensureRecorder().stop(); return }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.ensureRecorder().start({
          duration: 60000, format: 'mp3', sampleRate: 16000,
          numberOfChannels: 1, encodeBitRate: 48000,
        })
        this.setData({ recording: true })
      },
      fail: () => wx.showToast({ title: '未获得麦克风权限', icon: 'none' }),
    })
  },

  // 录完 → 上传云托管转写 → 文字填进作答框（可改后再提交）。
  // 失败一律如实降级：不冒充识别成功，也不清空用户已经打的字。
  async transcribeAudio(filePath) {
    this.setData({ asrBusy: true })
    wx.showLoading({ title: '正在转文字', mask: true })
    let r
    try {
      r = await ASR.transcribe(filePath)
    } catch (e) {
      r = { ok: false, error: (e && e.message) || '转写失败' }
    }
    wx.hideLoading()
    this.setData({ asrBusy: false })
    if (!r.ok) {
      const msg = r.hint ? (r.error + '，' + r.hint) : (r.error || '没听出内容')
      wx.showModal({ title: '没转成文字', content: msg + '。你可以直接在下面的框里打字作答。', showCancel: false, confirmText: '知道了' })
      return
    }
    // 识别结果接在已有文字后面，别覆盖候选人先打的内容
    const prev = (this.data.input || '').trim()
    const text = prev ? prev + ' ' + r.text : r.text
    this.setData({ input: text.slice(0, 3000) })
    wx.showToast({ title: '已转成文字，核对后提交', icon: 'none', duration: 1800 })
  },

  // ---------- 收尾 ----------
  restart() {
    this.setData({
      step: 'setup', messages: [], queue: [], answers: [], qIndex: 0, totalQ: 0,
      input: '', summary: null, review: '', awaitFollow: false, recording: false,
      asrBusy: false,
    })
  },

  backToSetup() { this.restart() },

  // 复盘页没有详情页可跳了（招聘都折叠在吉利专区里），改为把这条机会的原文链接复制走
  openJob() {
    const opp = C.findById(this.data.jobUrl)
    if (!opp || !opp.url) return
    wx.setClipboardData({
      data: opp.url,
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'none', duration: 2000 }),
    })
  },

  onUnload() {
    if (recorder) { try { recorder.stop() } catch (e) {} }
  },
})
