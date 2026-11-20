// pages/timetable/index.js —— 课表：看、加、导、识别、手动输入
//
// 四种录入都落到同一份数据（本地 timetable），页面只有一条渲染路径：
//   添加 / 手动输入 → 同一个表单（点空格子会带出星期与大节）
//   导入 → 粘贴教务课表文本，逐行解析
//   识别 → 选一张课表截图，交给云端模型读，读不出来就明说，改用导入
const cloud = require('../../utils/cloud')
const TT = require('../../utils/timetable')
const K = require('../../utils/klass')
const C = require('../../utils/contribute')

const SHARE_ASK = 'timetable_share_ask'   // 每份课表只问一次要不要分享

const TIME_W = 104
const COL_W = 132
const ROW_H = 184
const NOTE_H = 72
const HEAD_H = 56

// 让模型只吐可解析的行，别写解释
const OCR_PROMPT = [
  '你是教务课表识别器。看这张课表截图，把每一门课变成一行 JSON，不要输出任何解释。',
  '字段：{"n":"课程名","t":"教师","r":"地点","day":1-7 的整数（周一=1）,"s":起始大节 1-5,"span":占几个大节,"w":"周次，如 1-16 或 11"}',
  '大节对应：第一大节=01,02 小节；第二大节=03,04；第三大节=05,06；第四大节=07,08；第五大节=09,10,11。',
  '跨两个大节的课（如 05-06-07-08 小节）请写 s=3、span=2，一行即可，不要拆成两行。',
  '地点统一用学校改版后的楼名：2 号教学楼=吉贤楼，3 号教学楼=吉智楼，6 号教学楼=吉芯楼，7 号教学楼=吉思楼，综合楼=吉美楼，图书馆=吉星楼；楼名后面只跟房间号，写成「吉芯楼103」，不要写成「吉芯楼-吉芯楼103」。不是教室的地点（如实践基地）照原文写。',
  '看不出教师或地点就留空字符串，看不出周次写 1-16。',
].join('\n')

const readB64 = (path) => new Promise((resolve, reject) => {
  wx.getFileSystemManager().readFile({
    filePath: path,
    encoding: 'base64',
    success: (r) => resolve(r.data),
    fail: reject,
  })
})

const pickModel = async () => {
  try {
    const models = await cloud.llm.models.list()
    return models.find((m) => m.disabled !== true) || null
  } catch (e) {
    return null
  }
}

Page({
  data: {
    slots: TT.SLOTS,
    days: TT.DAYS,
    dayShort: TT.DAY_S,
    colors: TT.COLORS,

    week: 11,
    weekList: TT.range(1, 20),

    list: [],
    blocks: [],
    cells: [],
    cnt: 0,
    todayCnt: 0,
    todayCol: 0,
    isDemo: false,
    ck: '',              // 当前班级 key（空=不设班级，存公共那份）
    klassText: '',

    // 网格尺寸（rpx）
    timeW: TIME_W,
    colW: COL_W,
    rowH: ROW_H,
    noteH: NOTE_H,
    headH: HEAD_H,
    gridW: TIME_W + COL_W * 7,
    bodyH: ROW_H * 5,

    // 表单
    showForm: false,
    buildings: TT.BUILDINGS,
    bNames: TT.B_ALL,
    bOther: TT.BUILDINGS.length,
    form: { id: '', n: '', t: '', bi: 2, room: '', day: 1, s: 1, span: 1, wtxt: '1-16' },
    spanList: [1, 2, 3, 4, 5],

    // 导入
    showImport: false,
    importText: '',
    preview: [],
    previewBad: 0,
    parsed: false,

    // 识别
    ocrBusy: false,
    ocrTip: '',
  },

  onLoad() {
    this.reload()
  },

  // 从「我的」页切了班级再回来，要换对应那份课表
  onShow() {
    const ck = K.current()
    if (ck !== this.data.ck) this.reload()
  },

  // 首次进来本地还没开过课表，摆一份示例（照用户给的格式），标注可清空
  reload() {
    const ck = K.current()
    // 老版本示例只有第 11 周有课，首次进来自动补成全周（只认原示例，只补一次）
    TT.fillOldDemoWeeks(ck)
    let list = TT.read(ck)
    let isDemo = false
    if (!TT.inited(ck)) {
      list = TT.DEMO.map((x) => Object.assign({}, x, { id: TT.uid() }))
      TT.write(list, ck)
      isDemo = true
    }
    const week = TT.readWeek()
    this.setData({ list, week, isDemo, ck, klassText: K.snapshot().curText })
    this.paint(list, week)
  },

  // 把课程算成网格坐标
  paint(list, week) {
    const laid = TT.layout(list, week)
    const blocks = laid.map((c) => ({
      id: c.id,
      n: c.n,
      t: c.t,
      r: c.r,
      c: c.c,
      wTxt: c.wTxt,
      sgTxt: c.sgTxt,
      // 注意：blocks / cells 都放在 .gc 容器里，.gc 本身已经从时间列之后开始，
      // 所以横坐标相对 .gc 算，不能再加 TIME_W（加了会整体右偏一列，和表头对不上）
      left: c.col * COL_W + 3,
      top: c.row * ROW_H + 4,
      h: c.span * ROW_H - 8,
    }))
    const cells = []
    for (let s = 1; s <= 5; s++) {
      for (let d = 1; d <= 7; d++) {
        cells.push({ k: s + '-' + d, day: d, s, left: (d - 1) * COL_W, top: (s - 1) * ROW_H })
      }
    }
    const todayCol = TT.todayCol()
    const todayDay = todayCol + 1
    this.setData({
      blocks,
      cells,
      cnt: laid.length,
      todayCol,
      todayCnt: laid.filter((c) => c.col + 1 === todayDay).length,
    })
  },

  // ---------- 周次 ----------
  prevWeek() {
    const w = Math.max(1, this.data.week - 1)
    TT.writeWeek(w)
    this.setData({ week: w })
    this.paint(this.data.list, w)
  },
  nextWeek() {
    const w = Math.min(30, this.data.week + 1)
    TT.writeWeek(w)
    this.setData({ week: w })
    this.paint(this.data.list, w)
  },
  onWeekPick(e) {
    const w = Number(this.data.weekList[e.detail.value]) || this.data.week
    TT.writeWeek(w)
    this.setData({ week: w })
    this.paint(this.data.list, w)
  },

  // ---------- 表单（添加 / 手动输入 / 点空格） ----------
  openForm(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const day = Number(ds.day) || TT.todayCol() + 1
    const s = Number(ds.s) || 1
    this.setData({
      showForm: true,
      form: { id: '', n: '', t: '', bi: TT.readBld(), room: '', day, s, span: 1, wtxt: '1-16' },
    })
  },
  editCourse(e) {
    const id = e.currentTarget.dataset.id
    const c = this.data.list.find((x) => x.id === id)
    if (!c) return
    const sp = TT.splitRoom(c.r)
    this.setData({
      showForm: true,
      form: {
        id: c.id, n: c.n, t: c.t || '', bi: sp.bi, room: sp.room,
        day: c.day, s: c.s, span: c.span || 1,
        wtxt: c.w && c.w.length ? TT.weeksText(c.w).replace(/周$/, '') : '1-16',
      },
    })
  },
  closeForm() { this.setData({ showForm: false }) },
  // 不用 'form.n' 这种路径写法：整体替换更直观，也不依赖 setData 的路径解析
  patchForm(k, v) {
    const form = Object.assign({}, this.data.form)
    form[k] = v
    this.setData({ form })
  },
  fName(e) { this.patchForm('n', e.detail.value) },
  fTeacher(e) { this.patchForm('t', e.detail.value) },
  fBuilding(e) {
    const bi = Number(e.detail.value)
    this.patchForm('bi', isNaN(bi) ? this.data.bOther : bi)
    // 换楼就把房间号清掉：旧教室号跟新楼对不上，留着更容易错
    this.patchForm('room', '')
  },
  fRoom(e) { this.patchForm('room', e.detail.value) },
  fDay(e) { this.patchForm('day', Number(e.detail.value) + 1) },
  fSlot(e) { this.patchForm('s', Number(e.detail.value) + 1) },
  fSpan(e) { this.patchForm('span', Number(e.detail.value) + 1) },
  fWeeks(e) { this.patchForm('wtxt', e.detail.value) },

  saveForm() {
    const f = this.data.form
    const n = String(f.n || '').trim()
    if (!n) { wx.showToast({ title: '先写课程名', icon: 'none' }); return }
    const w = TT.parseWeeks(f.wtxt)
    const s = Math.max(1, Math.min(5, Number(f.s) || 1))
    const bi = f.bi === this.data.bOther ? -1 : Number(f.bi)
    const room = String(f.room || '').trim()
    if (bi >= 0 && room && !/^\d{2,5}$/.test(room)) {
      wx.showToast({ title: '房间号填数字，如 103', icon: 'none' })
      return
    }
    const item = {
      id: f.id || TT.uid(),
      n,
      t: String(f.t || '').trim(),
      r: TT.joinRoom(bi, room),
      day: Math.max(1, Math.min(7, Number(f.day) || 1)),
      s,
      // 从第 s 节起最多还能占几节，不然会溢出表格
      span: Math.max(1, Math.min(6 - s, Number(f.span) || 1)),
      w: w.length ? w : TT.range(1, 16),
      c: TT.colorOf(n),
    }
    if (bi >= 0) TT.writeBld(bi)
    const list = this.data.list.slice()
    const i = list.findIndex((x) => x.id === item.id)
    if (i >= 0) list[i] = item
    else list.push(item)
    TT.write(list, this.data.ck)
    this.setData({ showForm: false, isDemo: false })
    this.setData({ list })
    this.paint(list, this.data.week)
    wx.showToast({ title: i >= 0 ? '改好了' : '加上了', icon: 'none' })
    if (i < 0) this.maybeAskShare()
  },

  delCourse() {
    const id = this.data.form.id
    if (!id) return
    wx.showModal({
      title: '删掉这门课',
      content: '只删本机这份课表里的这一条。',
      confirmText: '删掉',
      confirmColor: '#D9433B',
      success: (r) => {
        if (!r.confirm) return
        const list = this.data.list.filter((x) => x.id !== id)
        TT.write(list, this.data.ck)
        this.setData({ list, showForm: false, isDemo: false })
        this.paint(list, this.data.week)
      },
    })
  },

  // ---------- 导入：粘贴文本 ----------
  openImport() {
    this.setData({ showImport: true, importText: '', preview: [], previewBad: 0, parsed: false, ocrTip: '' })
  },
  closeImport() { this.setData({ showImport: false }) },
  onImportInput(e) { this.setData({ importText: e.detail.value, parsed: false }) },
  pasteClip() {
    wx.getClipboardData({
      success: (r) => {
        const t = (r && r.data) || ''
        if (!t) { wx.showToast({ title: '剪贴板是空的', icon: 'none' }); return }
        this.setData({ importText: t, parsed: false })
        wx.showToast({ title: '已粘贴 ' + t.length + ' 字', icon: 'none' })
      },
    })
  },
  doParse() {
    const text = String(this.data.importText || '').trim()
    if (!text) { wx.showToast({ title: '先粘一段课表文本', icon: 'none' }); return }
    const r = TT.parseText(text)
    this.setData({ preview: this.decorate(r.list), previewBad: r.bad.length, parsed: true })
    if (!r.list.length) wx.showToast({ title: '这一行都没认出来', icon: 'none' })
  },
  // 预览行要显示「第11周」这种人话，不在 wxml 里现算
  decorate(list) {
    return (list || []).map((x) => Object.assign({}, x, { wTxt: TT.weeksText(x.w) }))
  },
  confirmImport() {
    const add = this.data.preview || []
    if (!add.length) { wx.showToast({ title: '没有可导入的课', icon: 'none' }); return }
    const list = this.data.list.slice()
    add.forEach((a) => {
      // wTxt 只是预览用的，别写进存储
      const item = { id: a.id, n: a.n, t: a.t, r: a.r, day: a.day, s: a.s, span: a.span, w: a.w, c: a.c }
      // 同一天同一大节同一门课算重复，直接覆盖，别叠两层
      const i = list.findIndex((x) => x.day === item.day && x.s === item.s && x.n === item.n)
      if (i >= 0) list[i] = Object.assign({}, item, { id: list[i].id })
      else list.push(item)
    })
    TT.write(list, this.data.ck)
    this.setData({ list, showImport: false, isDemo: false })
    this.paint(list, this.data.week)
    wx.showToast({ title: '导入 ' + add.length + ' 门', icon: 'none' })
    this.maybeAskShare()
  },

  // ---------- 识别：截图交给云端模型 ----------
  async doOcr() {
    if (this.data.ocrBusy) return
    let path = ''
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      path = res.tempFiles[0].tempFilePath
    } catch (e) {
      this.setData({ ocrTip: '' })
      return
    }
    this.setData({ ocrBusy: true, ocrTip: '' })
    try {
      const b64 = await readB64(path)
      const model = await pickModel()
      if (!model) throw new Error('no-model')
      let out = ''
      for await (const chunk of cloud.llm.chat.completions.create({
        model: model.id,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
          ],
        }],
        stream: true,
      })) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (d && d.content) out += d.content
      }
      const r = TT.parseJsonLines(out)
      if (!r.list.length) throw new Error('no-course')
      this.setData({
        ocrBusy: false,
        showImport: true,
        importText: out,
        preview: this.decorate(r.list),
        previewBad: r.bad.length,
        parsed: true,
        ocrTip: '识别到 ' + r.list.length + ' 门，核对一下再导入',
      })
    } catch (e) {
      const msg = String((e && e.message) || '')
      this.setData({
        ocrBusy: false,
        ocrTip: msg === 'no-model'
          ? '云端模型还没连上，先点「导入」粘贴教务课表文本'
          : '这张图没读出来。换个清楚点的截图，或用「导入」粘文本',
      })
    }
  },

  // ---------- 新建课表后：问要不要提交分享，说明可获「资料补充者」头衔 ----------
  // 每份课表只问一次，避免每次加点东西都弹；确认后作为「资料补充」反馈进统一后台
  askedKey(k) { return SHARE_ASK + (k ? '::' + k : '') },
  shareAsked() {
    try { return !!wx.getStorageSync(this.askedKey(this.data.ck)) } catch (e) { return false }
  },
  markAsked() {
    try { wx.setStorageSync(this.askedKey(this.data.ck), 1) } catch (e) {}
  },
  maybeAskShare() {
    if (this.shareAsked()) return
    this.markAsked()
    const cnt = (this.data.list || []).length
    if (!cnt) return
    wx.showModal({
      title: '把这份课表分享出去？',
      content: '你刚建好了课表（' + cnt + ' 门课）。提交给管理员可以做资料补充，你会获得「资料补充者」头衔。课表内容会作为一条资料补充反馈提交，只发课程信息，不含你的私人信息。',
      confirmText: '提交分享',
      cancelText: '暂不',
      success: (r) => {
        if (r.confirm) this.submitShare()
      },
    })
  },
  async submitShare() {
    const list = this.data.list || []
    if (!list.length) return
    const klass = this.data.klassText || '公共课表'
    const lines = list.map((c) => '周' + (TT.DAY_S[c.day - 1] || '') + ' 第' + c.s + '大节 ' + c.n + (c.t ? '（' + c.t + '）' : '') + (c.r ? ' ' + c.r : ''))
    const text = '【' + klass + '分享的课表 · ' + list.length + ' 门】\n' + lines.join('\n')
    const r = await C.submit({ type: 'docs', text: text.slice(0, 2000), where: '课表分享 · ' + klass })
    C.clearCache()
    wx.showToast({
      title: r.synced ? '已提交 · 记一次资料补充' : '已存本机（云端未通）',
      icon: 'none',
      duration: 2200,
    })
  },

  // ---------- 其它 ----------
  clearAll() {
    wx.showModal({
      title: '清空课表',
      content: '本机这份课表会被清空，清完可以从「导入」重新加。',
      confirmText: '清空',
      confirmColor: '#D9433B',
      success: (r) => {
        if (!r.confirm) return
        TT.write([], this.data.ck)
        this.setData({ list: [], isDemo: false })
        this.paint([], this.data.week)
      },
    })
  },
  noop() {},
})
