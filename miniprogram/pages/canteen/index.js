// pages/canteen/index.js —— 五个食堂站内对比 + 学生评价
//
// 数据分两层，边界必须清楚：
//   1) 档口清单 / 门店均分：来自校内美团门店快照，写死在 data/canteen.js，可溯源；
//   2) 学生评价：真人自己写的（本机 + 云端尽力同步），没有人写就显示「还没有评价」，
//      绝不用编造的评分把页面填满。两个均分在页面上分开写，不混成一个数。
const db = require('../../utils/db')
const { SOURCE, CARDS, ROWS, MAX_HALL } = require('../../data/canteen')
const { SOURCE: OUT_SRC, SHOPS, GROUPS } = require('../../data/shops')
const FOOD = require('../../data/foodstat')

// 去美团：实现统一在 utils/meituan.js（跳小程序，拉不起则复制链接兜底）
const { openMeituan } = require('../../utils/meituan')

const HALL_OF = {}
CARDS.forEach((c) => { HALL_OF[c.id] = c.name })

function pad(n) { return n < 10 ? '0' + n : '' + n }
function when(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 后端集合字段有限，评分和文本打在一起存，避免丢星
function encode(score, text) { return score + '|' + text }
function decode(desc, scoreField) {
  const s = String(desc || '')
  const i = s.indexOf('|')
  if (i > 0 && /^[1-5]$/.test(s.slice(0, i))) {
    return { score: Number(s.slice(0, i)), text: s.slice(i + 1) }
  }
  return { score: Number(scoreField) || 0, text: s }
}

Page({
  data: {
    source: SOURCE,
    cards: CARDS,
    rows: ROWS,
    cur: 0,
    curCard: CARDS[0],
    maxHall: MAX_HALL.name + '（' + MAX_HALL.total + ' 家）',
    myScore: 0,
    draft: '',
    submitting: false,
    reviews: [],
    // 校外外卖（美团真实抓取的一次性快照）
    view: 'hall',
    food: FOOD,
    outSource: OUT_SRC,
    outGroups: GROUPS,
    outShops: SHOPS,
    outCount: SHOPS.length,
  },

  switchView(e) {
    this.setData({ view: e.currentTarget.dataset.v })
  },

  // 校外店铺：小程序内下不了单，只能把店名复制给他去美团搜
  openShop(e) {
    const id = e.currentTarget.dataset.i
    const s = (this.data.outShops || []).find((x) => x.id === id)
    if (!s) return
    wx.setClipboardData({
      data: s.name,
      success: () => {
        wx.showModal({
          title: '店名已复制',
          content: '在美团外卖里粘贴搜索“' + s.name + '”即可下单。小程序内不能直接下单，这一步只能跳过去。',
          showCancel: false,
          confirmText: '知道了',
        })
      },
    })
  },

  onLoad() {
    this.setData({ curCard: this.decorate(0) })
    this.loadReviews()
  },

  // 把当前选中食堂的评分算出来（只有有人评过才有值）
  decorate(idx) {
    const c = this.data.cards[idx]
    const list = this.data.reviews.filter((r) => r.hallId === c.id)
    if (!list.length) return Object.assign({}, c, { avg: '', cnt: 0 })
    const sum = list.reduce((a, b) => a + (b.score || 0), 0)
    return Object.assign({}, c, { avg: (sum / list.length).toFixed(1), cnt: list.length })
  },

  pick(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.setData({ cur: i, curCard: this.decorate(i), myScore: 0, draft: '' })
  },

  setScore(e) {
    this.setData({ myScore: Number(e.currentTarget.dataset.s) })
  },

  onDraft(e) {
    this.setData({ draft: e.detail.value })
  },

  async loadReviews() {
    let items = []
    let why = ''
    try {
      const r = await db.feed(db.CANTEEN, 60)
      items = r.items || []
      why = r.why || ''
    } catch (e) {
      why = db.reason(e)
    }
    const list = items
      .filter((it) => it && (it.cat === 'canteen' || it.hall))
      .map((it) => {
        const d = decode(it.desc, it.score)
        const hid = it.title || it.hall || ''
        return {
          k: (it._id || it.id || it.no || '') + '_' + (it.ts || 0),
          hallId: hid,
          hall: HALL_OF[hid] || hid || '食堂',
          score: d.score,
          stars: d.score ? '★★★★★'.slice(0, d.score) : '',
          text: d.text,
          when: when(it.ts),
          local: !!it._local,
        }
      })
      .sort((a, b) => (String(b.k) > String(a.k) ? 1 : -1))

    const cards = CARDS.map((c) => {
      const rel = list.filter((r) => r.hallId === c.id)
      if (!rel.length) return Object.assign({}, c, { avg: '', cnt: 0 })
      const sum = rel.reduce((a, b) => a + (b.score || 0), 0)
      return Object.assign({}, c, { avg: (sum / rel.length).toFixed(1), cnt: rel.length })
    })

    // 学生均分只挂在当前食堂卡上，没有评价就留空，不用 0 分充数
    this.setData({
      reviews: list, cards, curCard: cards[this.data.cur], cloudWhy: why,
    })
  },

  async submit() {
    if (this.data.submitting) return
    const text = (this.data.draft || '').trim()
    if (!text) { wx.showToast({ title: '写一句再发', icon: 'none' }); return }
    if (!this.data.myScore) { wx.showToast({ title: '先点个星', icon: 'none' }); return }
    const hall = this.data.cards[this.data.cur]
    this.setData({ submitting: true })
    try {
      const r = await db.add(db.CANTEEN, {
        cat: 'canteen',
        title: hall.id,
        desc: encode(this.data.myScore, text),
        score: this.data.myScore,
        ts: Date.now(),
      })
      this.setData({ submitting: false, draft: '', myScore: 0 })
      wx.showToast({
        title: r && r.synced ? '评价已发布' : '已存本机，联网后同步',
        icon: 'none',
      })
      this.loadReviews()
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: '没发出去，再试一次', icon: 'none' })
    }
  },

  askErrand() {
    wx.navigateTo({ url: '/pages/board/index?cat=help' })
  },

  goFood() { wx.navigateTo({ url: '/pkgFood/pages/food/index' }) },

  goMeituan() {
    wx.setClipboardData({
      data: '南宁数字科技学院 校内（友谊路55号）',
      success: () => {
        wx.showModal({
          title: '地址已复制',
          content: '在美团外卖里粘贴这个地址设为收货点，食堂档口本身不接线上单，外卖走的是校外商家。',
          showCancel: false,
          confirmText: '知道了',
        })
      },
    })
  },

  goWaimao() { wx.navigateTo({ url: '/pkgFood/pages/food/index' }) },

  // 去美团：小程序不能直接拉起外部 App，只能跳美团小程序，拉不起则复制链接
  goMeituanApp() {
    openMeituan({ title: '美团外卖链接已复制' })
  },
})
