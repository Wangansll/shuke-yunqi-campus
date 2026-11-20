// pages/home/index.js
const { cloud, SYS, pickModel, modelLabel } = require('../../utils/biz')
const { KB_SIZE, KB_SCHOOL_SIZE, KB_ASEAN_SIZE } = require('../../utils/rag')
const { syncTabBar } = require('../../utils/tabbar')
const TT = require('../../utils/timetable')
const K = require('../../utils/klass')
const FOOD = require('../../data/foodstat')
// 办事指南件数从数据实时算：指南加条目后首页角标自动跟着变，不再写死
const { DAILY: GUIDE_DAILY, CATS: GUIDE_CATS } = require('../../data/guide')


// 站外入口（天猫/教务/易校园）已移到「服务」页，首页只留在站内能办的事
// 「点外卖」不再放这里的示例问题里——它不是一个能问的问题，而是出口，
// 已移到「校园美食鉴赏」页头（开饭），逻辑统一走 utils/meituan.js

Page({
  data: {
    foodStat: {
      dishes: FOOD.dishes,
      shops: FOOD.shops,
      reviews: FOOD.reviews,
    },
    question: '',
    chips: ['学校有多少个学院', '王牌专业是哪些', '泰国用什么货币', '去马来西亚要签证吗'],
    modelReady: false,
    modelName: '',
    // 对外显示名（玩梗）：小栖自称 Claude Opus 4.5，点开才说实话
    modelShow: 'Claude Opus 4.5',
    kbSize: KB_SIZE,
    kbSchool: KB_SCHOOL_SIZE,
    kbAsean: KB_ASEAN_SIZE,
    // 课表卡：第几周、这周几节（进页面前先有数，onShow 再校准）
    ttWeek: 11,
    ttCnt: 0,
    // 办事指南：件数 + 分类数，都从数据算
    guideN: GUIDE_DAILY.length,
    guideCatN: GUIDE_CATS.length,
  },
  async onLoad() {
    // 课表数字进页面就算，不等 onShow：首帧就是真实值，不从占位闪到真实值
    this.syncTimetable()
    try {
      const m = await pickModel()
      if (m) this.setData({ modelReady: true, modelName: modelLabel(m) })
    } catch (e) {
      this.setData({ modelReady: false })
    }
  },
  onShow() { syncTabBar(this, 0); this.syncTimetable() },
  // 首页课表卡上的「第 N 周 · X 节」要跟课表页一致：没开过课表的按示例算
  syncTimetable() {
    try {
      const week = TT.readWeek()
      const ck = K.current()
      const list = TT.inited(ck) ? TT.read(ck) : TT.DEMO
      this.setData({ ttWeek: week, ttCnt: TT.layout(list, week).length })
    } catch (e) {
      this.setData({ ttCnt: 0 })
    }
  },
  tapModel() {
    if (!this.data.modelReady) {
      wx.showToast({ title: '小栖还在连接模型', icon: 'none' })
      return
    }
    const real = this.data.modelName && this.data.modelName !== '云端模型'
      ? this.data.modelName : 'DeepSeek 系（云端自动调度）'
    wx.showModal({
      title: '小栖的真实身份',
      content: `对外名号 ${this.data.modelShow}，实际后端 ${real}。别声张，辅导员不知道。`,
      showCancel: false, confirmText: '知道了',
    })
  },
  onInput(e) { this.setData({ question: e.detail.value }) },
  useChip(e) { this.setData({ question: e.currentTarget.dataset.q }) },
  askHub() {
    const q = (this.data.question || '').trim()
    if (!q) { wx.showToast({ title: '先输入问题', icon: 'none' }); return }
    // 带到小栖页并自动提问
    const app = getApp()
    app.pendingQuestion = q
    wx.switchTab({ url: '/pages/chat/index' })
  },
  goService(e) {
    const d = e.currentTarget.dataset.d
    // 快递直接进查询页，不用先落到服务页再弹详情
    if (d === 'express') { wx.navigateTo({ url: '/pages/express/index' }); return }
    wx.setStorageSync('serviceFocus', d)
    wx.switchTab({ url: '/pages/service/index' })
  },
  goTab(e) { wx.switchTab({ url: '/pages/' + e.currentTarget.dataset.tab + '/index' }) },
  goGeely() { wx.navigateTo({ url: '/pages/geely/index' }) },
  // 盒子里的面试条：直接进面试，不让冒泡到整卡的 goGeely
  goInterviewAi() { wx.navigateTo({ url: '/pages/interview/index?track=normal' }) },
  goReport() { wx.navigateTo({ url: '/pages/guide/index' }) },
  goFood() { wx.navigateTo({ url: '/pkgFood/pages/food/index' }) },

  goGuide() { wx.navigateTo({ url: '/pages/guide/index' }) },
  goTimetable() { wx.navigateTo({ url: '/pages/timetable/index' }) },
  goLife() { wx.navigateTo({ url: '/pages/life/index' }) },
  goExpress() { wx.navigateTo({ url: '/pages/express/index' }) },
  goBoard() { wx.navigateTo({ url: '/pages/board/index' }) },
  goWiki() { wx.navigateTo({ url: '/pages/wiki/index' }) },
})
