// pages/life/index.js —— 校园导览：四岭分区 / 食堂档口 / 出行 / 电话
// 数据全部来自 utils/campus.js（与 RAG 知识库同源），不写推测值。
const { ZONES, CANTEENS, SHUTTLE, BIKE, PHONES, HOTLINES, TIMETABLE, LIBRARY, BUILDINGS } = require('../../utils/campus')

const IB = { 食堂: '🍚', 超市: '🛒', 医疗: '🏥', 快递: '📦', 洗衣: '🧺', 安保: '🛡️', 咖啡: '☕', 茶饮: '🧋' }

Page({
  data: {
    tab: 'zone',
    tabs: [
      { k: 'zone', n: '分区' },
      { k: 'food', n: '食堂' },
      { k: 'go', n: '出行' },
      { k: 'tel', n: '电话' },
    ],
    zones: ZONES.map((z) => Object.assign({}, z, {
      items: z.items.map((it) => Object.assign({ icon: IB[it.c] || '•' }, it)),
    })),
    buildings: BUILDINGS,
    canteens: CANTEENS.map((c) => Object.assign({}, c, { open: false, show: c.stalls.slice(0, 8) })),
    shuttle: SHUTTLE,
    bike: BIKE,
    phones: PHONES,
    hotlines: HOTLINES,
    timetable: TIMETABLE,
    library: LIBRARY,
    openLib: false,
  },
  pickTab(e) { this.setData({ tab: e.currentTarget.dataset.k }) },
  // 档口多的一屏放不下：默认 8 个，展开看全部
  toggleStalls(e) {
    const i = Number(e.currentTarget.dataset.i)
    const list = this.data.canteens.slice()
    list[i] = Object.assign({}, list[i], { open: !list[i].open })
    this.setData({ canteens: list })
  },
  // 档口点一下：给小栖一个现成问题，直接跳过去问
  askStall(e) {
    const { c, s } = e.currentTarget.dataset
    getApp().pendingQuestion = c + '的' + s + '好吃吗？'
    wx.switchTab({ url: '/pages/chat/index' })
  },
  dial(e) {
    const tel = e.currentTarget.dataset.tel
    if (!tel) return
    wx.makePhoneCall({ phoneNumber: String(tel), fail: () => {} })
  },
  toggleLib() { this.setData({ openLib: !this.data.openLib }) },
})
