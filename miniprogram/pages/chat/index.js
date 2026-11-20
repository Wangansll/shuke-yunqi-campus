// pages/chat/index.js —— 小栖流式对话（带校内知识库检索）
const { cloud, SYS, pickModel, modelLabel } = require('../../utils/biz')
const { retrieve, buildContext, KB_SIZE, KB_SCHOOL_SIZE, KB_ASEAN_SIZE, KB_GEELY_SIZE } = require('../../utils/rag')
const { syncTabBar } = require('../../utils/tabbar')
const { actsFor } = require('../../utils/acts')

let seq = 0

// 轻量清洗：模型偶尔仍会输出 Markdown 符号，WXML 不渲染 MD，直接转成纯文本
function clean(t) {
  if (!t) return ''
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1')      // **粗体**
    .replace(/__(.+?)__/g, '$1')          // __粗体__
    .replace(/`([^`]*)`/g, '$1')          // `代码`
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')   // # 标题
    .replace(/^\s*[-*+]\s+/gm, '· ')      // - 列表
}

// 交替锚点 id：scroll-into-view 绑定值不变时不会再次滚动，
// 所以每次要"跟到底部"就换成另一个 id，强制触发一次滚动。
function flipAnchor(cur) {
  return cur === 'btA' ? 'btB' : 'btA'
}

// 检索 + 组装系统提示：命中才注入，闲聊不打扰
function buildSys(q) {
  let hits = []
  try {
    hits = retrieve(q, { topK: 3 })
  } catch (e) {
    hits = []
  }
  if (!hits.length) {
    // 没检索到就别让它自由发挥：不注入资料，但要明确告诉它"这条资料里没有"，
    // 免得它用常识把开放时间、电话、分数线编出来
    const sys = SYS + '\n\n【本轮没有检索到校内资料】这次问题在校内资料里没有对应条目。涉及校内具体数字（时间、价格、电话、分数线、人数）时，直接说「公开资料里没有这一条」，并告诉他去哪里查（学校官网、易校园、辅导员）；只有通识问题可以正常作答。不要编造校内细节。'
    return { sys, hits: [] }
  }
  const sys = SYS + `\n\n【校内资料 · 本轮检索结果】以下内容摘自学校官网与平台说明，是回答校内问题的唯一事实来源：
${buildContext(hits)}

引用上述资料作答时：优先依据资料，可以概括但不要照抄；资料里没写的细节（具体开馆时间、菜价、电话、分数线数值、宿舍条件）直接说明「公开资料里没有这一条」，并指出去官网或易校园查看；不要用常识推测补齐数字。`
  return { sys, hits }
}
Page({
  data: {
    messages: [], input: '', generating: false,
    modelReady: false, modelName: '',
    // 对外名（玩梗）：小栖自称 Claude Opus 4.5，点一下才说实话
    modelShow: 'Claude Opus 4.5',
    model: null,
    // 跟随锚点：scroll-into-view 值不变不会重新滚动，所以用两个 id 交替触发
    endAnchor: 'btA',
    // 快捷问题按组轮播，一屏一组，避免四组堆在一个屏幕里显得乱
    chipGroups: [
      {
        title: '学院',
        list: ['学校有多少个学院', '王牌专业是哪些', '能转专业吗', '图书馆有多少书', '学费多少钱一年'],
      },
      {
        title: '校园生活',
        list: ['三食堂有什么好吃的', '宿舍几人间', '几点有热水', '怎么借书', '医务室在哪'],
      },
      {
        title: '学习与教务',
        list: ['教务系统在哪', '智圩怎么交项目', '项目制教学是什么', '学校有几个学部', '跨学科专业是什么意思'],
      },
      {
        title: '东盟',
        list: ['东盟有几个国家', '泰国用什么货币', '去马来西亚要签证吗', '从广西怎么去越南', '印尼和北京时间差多少'],
      },
      {
        title: '吉利',
        list: ['吉利和学校什么关系', '吉利校招在哪投', '吉利有哪些品牌', '繁星项目是什么', '吉利的社招入口'],
      },
    ],
    kbSize: KB_SIZE,
    kbSchool: KB_SCHOOL_SIZE,
    kbAsean: KB_ASEAN_SIZE,
    kbGeely: KB_GEELY_SIZE,
    // 上下文（含 system 之后的对话历史，应用自己维护，有上限）
    context: [],
  },
  async onLoad() {
    try {
      const m = await pickModel()
      this.setData({ model: m, modelReady: !!m, modelName: modelLabel(m) })
    } catch (e) {
      wx.showToast({ title: '模型连接失败', icon: 'none' })
    }
  },
  async onShow() {
    syncTabBar(this, 2)
    const app = getApp()
    if (app.pendingQuestion) {
      const q = app.pendingQuestion
      app.pendingQuestion = null
      this.setData({ input: q })
      // 等模型加载完成
      if (!this.data.model) {
        const m = await pickModel().catch(() => null)
        if (m) this.setData({ model: m, modelReady: true, modelName: modelLabel(m) })
      }
      this.send()
    }
  },
  onInput(e) { this.setData({ input: e.detail.value }) },
  useChip(e) { this.setData({ input: e.currentTarget.dataset.q }) },

  async send() {
    const q = (this.data.input || '').trim()
    if (!q || this.data.generating) return
    const model = this.data.model
    if (!model) { wx.showToast({ title: '模型未就绪，请稍后', icon: 'none' }); return }

    const uid = ++seq
    const aid = ++seq

    // 先检索再上屏：命中时气泡会带"参考 N 条"，source 可展开
    const { sys, hits } = buildSys(q)
    const refs = hits.map(h => ({
      id: h.id,
      t: h.t,
      src: h.s && h.s.title ? `${h.s.ch || '学校官网'} · ${h.s.title}` : '本应用说明',
    }))

    const messages = this.data.messages.concat([
      { id: uid, role: 'user', content: q },
      // acts 先留空：回答还没出来就先摆按钮会让人以为是已经办好了
      { id: aid, role: 'assistant', content: '', disp: '', streaming: true, refs, open: false, acts: [] },
    ])
    this.setData({ messages, input: '', generating: true, endAnchor: flipAnchor(this.data.endAnchor) })

    // 组装上下文：system（含检索资料） + 历史(有上限) + 当前问题
    const history = this.data.context.slice(-12)
    const apiMessages = [{ role: 'system', content: sys }, ...history, { role: 'user', content: q }]

    let full = ''
    try {
      // 小程序 appservice 可能没有 AbortController，做防御：拿不到就传 undefined，SDK 可无 signal 运行
      try {
        this.controller = (typeof AbortController === 'function') ? new AbortController() : null
      } catch (e) {
        this.controller = null
      }
      const opts = {
        model: model.id,
        messages: apiMessages,
        stream: true,
      }
      if (this.controller && this.controller.signal) opts.signal = this.controller.signal
      for await (const chunk of cloud.llm.chat.completions.create(opts)) {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (delta && delta.content) {
          full += delta.content
          const idx = this.data.messages.findIndex(m => m.id === aid)
          if (idx >= 0) this.setData({
            ['messages[' + idx + '].content']: full,
            ['messages[' + idx + '].disp']: clean(full),
            // 流式输出时持续跟到底部，长回答不会只停在开头
            endAnchor: flipAnchor(this.data.endAnchor),
          })
        }
      }
      // 完成：落定内容，写入上下文，同时给出"接着办"的入口
      const idx = this.data.messages.findIndex(m => m.id === aid)
      if (idx >= 0) this.setData({
        ['messages[' + idx + '].streaming']: false,
        ['messages[' + idx + '].disp']: clean(full),
        ['messages[' + idx + '].acts']: actsFor(q),
        endAnchor: flipAnchor(this.data.endAnchor),
      })
      const ctx = this.data.context.concat([
        { role: 'user', content: q }, { role: 'assistant', content: full },
      ]).slice(-16)
      this.setData({ context: ctx })
    } catch (e) {
      const idx = this.data.messages.findIndex(m => m.id === aid)
      const msg = full ? '\n\n（回答中断）' : '抱歉，连接出现问题，请重试。'
      if (idx >= 0) this.setData({
        ['messages[' + idx + '].content']: (full || '') + msg,
        ['messages[' + idx + '].disp']: clean((full || '') + msg),
        ['messages[' + idx + '].streaming']: false,
        ['messages[' + idx + '].acts']: full ? actsFor(q) : [],
      })
    } finally {
      this.setData({ generating: false })
    }
  },
  onSendOrStop() {
    if (this.data.generating) this.stop()
    else this.send()
  },
  stop() {
    if (this.controller && typeof this.controller.abort === 'function') {
      try { this.controller.abort() } catch (e) {}
    }
    this.setData({ generating: false })
  },
  // 展开/收起某条回答的参考来源
  toggleRefs(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (!(idx >= 0) || idx >= this.data.messages.length) return
    const open = !this.data.messages[idx].open
    const patch = { ['messages[' + idx + '].open']: open }
    // 展开会把列表撑到折叠线以下，跟到底部才能看见内容
    if (open) patch.endAnchor = flipAnchor(this.data.endAnchor)
    this.setData(patch)
  },
  tapModel() {
    if (!this.data.modelReady) { wx.showToast({ title: '小栖还在连接模型', icon: 'none' }); return }
    const real = this.data.modelName && this.data.modelName !== '云端模型'
      ? this.data.modelName : 'DeepSeek 系（云端自动调度）'
    wx.showModal({
      title: '小栖的真实身份',
      content: `对外名号 ${this.data.modelShow}，实际后端 ${real}。信号是从山上飘下来的。`,
      showCancel: false, confirmText: '知道了',
    })
  },
  // 回答下面的"接着办"按钮：能进站内页面就直接进，tab 页要先存一下焦点
  goAct(e) {
    const u = e.currentTarget.dataset.u || ''
    if (!u) return
    const tab = /^\/pages\/(home|service|chat|asean|me)\/index/.exec(u)
    if (tab) {
      const focus = /[?&]focus=([A-Za-z0-9_]+)/.exec(u)
      if (focus) {
        try { wx.setStorageSync('serviceFocus', focus[1]) } catch (err) {}
      }
      wx.switchTab({ url: '/pages/' + tab[1] + '/index' })
      return
    }
    wx.navigateTo({
      url: u,
      fail: () => wx.showToast({ title: '页面打开失败', icon: 'none' }),
    })
  },
  clearChat() {
    this.setData({ messages: [], context: [], endAnchor: 'btA' })
  },
})
