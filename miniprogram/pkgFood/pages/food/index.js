// pkgFood/pages/food/index.js —— 校园美食鉴赏（分包）
//
// 三个视角：图鉴（按品类看菜）/ 销量榜（按月售排）/ 口碑（按店看评价）。
// 不代下单：没有购物车、没有菜品价格，只记录「有什么菜、卖得怎样、同学怎么说」；
// 真要下单时，页头「开饭」把人送去美团（utils/meituan.js），价格与配送费以美团内为准。
// 数据全在 data/food.js 的只读快照里；配图在 pkgFood/images/dish，按归一菜名命名。
const { SOURCE, SHOPS, DISHES, CATS, BOARD, STATS } = require('../../data/food')
const { openMeituan } = require('../../../utils/meituan')

// 没配图的菜用「首字 + 品类底色」占位，别拿同一张图糊一屏
const TINT = {
  '招牌主食': ['#FFF1E0', '#FFDDB8'],
  '主食': ['#FFF5E9', '#FFE3C4'],
  '配菜/加料': ['#EEF7EC', '#D6EBD2'],
  '饮品': ['#EAF4FF', '#D3E6FF'],
  '小食': ['#FFF0F3', '#FFD8E2'],
  '烤串': ['#FDEDE6', '#F9CFBC'],
  '套餐': ['#F3EEFE', '#E1D6FD'],
}
const FALLBACK_TINT = ['#F7F2EA', '#EBE2D5']

function firstChar(n) {
  const s = String(n || '').replace(/^[^0-9A-Za-z\u4e00-\u9fa5]+/, '').trim()
  return s.slice(0, 1) || '菜'
}

// 给菜品补上模板要用的展示字段（图片、首字、底色）
function view(d) {
  const t = TINT[d.cat] || FALLBACK_TINT
  return Object.assign({}, d, { ch: firstChar(d.n), c1: t[0], c2: t[1] })
}

const SCOPE_N = {
  all: DISHES.length,
  in: DISHES.filter((d) => d.inside).length,
  out: DISHES.filter((d) => !d.inside).length,
}

// 口碑：只留有评价的店，先校内后校门口，各自按菜品数排
// 排序：先有平台标签的（能看出好评率），再按评价条数。没有标签的店排后面，
// 否则一屏全是「没有平台标签」，看着像数据坏了
const VOICE = SHOPS.filter((s) => s.reviews.length)
  .sort((a, b) => (a.inside === b.inside
    ? ((b.goodPct ? 1 : 0) - (a.goodPct ? 1 : 0)) || (b.reviews.length - a.reviews.length) || (b.n - a.n)
    : (a.inside ? -1 : 1)))
  .map((s) => {
    const r = s.rc || { good: 0, mid: 0, bad: 0 }
    const rated = r.good + r.mid + r.bad
    const w = (v) => (rated ? (v / rated) * 100 : 0)
    return {
      i: s.i,
      name: s.name,
      zone: s.zone,
      inside: s.inside,
      n: s.n,
      revN: s.reviews.length,
      good: r.good,
      mid: r.mid,
      bad: r.bad,
      goodPct: s.goodPct || 0,
      rated: rated > 0,
      wg: w(r.good),
      wm: w(r.mid),
      wb: w(r.bad),
      // 没有评分就不写「评分未显示」，空字段直接跳过
      meta: [s.score ? s.score + ' 分' : '', s.dist, s.n + ' 道菜'].filter(Boolean).join(' · '),
      reviews: s.reviews,
    }
  })

// 顶部总体分布：三段占比先在 JS 里算好，WXML 不支持方法
const RATED = STATS.revGood + STATS.revMid + STATS.revBad
const pctOf = (v) => (RATED ? Math.round((v / RATED) * 100) : 0)
const VSTAT = {
  good: STATS.revGood,
  mid: STATS.revMid,
  bad: STATS.revBad,
  rec: STATS.revRec,
  pg: pctOf(STATS.revGood),
  pm: pctOf(STATS.revMid),
  pb: 100 - pctOf(STATS.revGood) - pctOf(STATS.revMid),
}

// 榜单与口碑也要跟着范围走，否则点了「校内」只有图鉴变、另外两个 tab 没反应
function boardOf(scope) {
  const list = scope === 'all' ? BOARD : BOARD.filter((d) => d.inside === (scope === 'in'))
  return list.map(view)
}
function voiceOf(scope) {
  return scope === 'all' ? VOICE : VOICE.filter((s) => s.inside === (scope === 'in'))
}

const PAGE = 24

Page({
  data: {
    source: SOURCE,
    stats: STATS,
    vstat: VSTAT,
    scopeN: SCOPE_N,
    tab: 'atlas',
    scope: 'all',
    q: '',
    cats: CATS,
    cat: '',
    list: [],
    shown: PAGE,
    total: 0,
    matched: 0,
    board: boardOf('all'),
    shops: VOICE.slice(0, 20),
    shopShown: 20,
    voiceTotal: VOICE.length,
    openShop: -1,
    sheet: null,
    sheetShop: null,
  },

  onLoad() {
    this.apply()
  },

  // 图鉴：scope ∧ 品类 ∧ 搜索，三者同时生效
  apply() {
    const { scope, cat, q } = this.data
    const kw = q.trim().toLowerCase()
    let list = DISHES
    if (scope !== 'all') list = list.filter((d) => d.inside === (scope === 'in'))
    if (cat) list = list.filter((d) => d.cat === cat)
    if (kw) list = list.filter((d) => d.n.toLowerCase().indexOf(kw) >= 0 || d.shopName.toLowerCase().indexOf(kw) >= 0)
    // 有实拍图的排前面（首屏不该全是占位块），再按招牌、月售、菜名，保证顺序稳定
    list = list.slice().sort((a, b) => ((b.img ? 1 : 0) - (a.img ? 1 : 0))
      || (b.sig - a.sig) || (b.sv - a.sv) || (a.n > b.n ? 1 : -1))
    this._list = list
    this.setData({
      list: list.slice(0, PAGE).map(view),
      shown: PAGE,
      total: list.length,
      matched: list.length,
    })
  },

  pickScope(e) {
    const scope = e.currentTarget.dataset.s
    const voice = voiceOf(scope)
    this.setData({
      scope,
      board: boardOf(scope),
      shops: voice.slice(0, 20),
      shopShown: 20,
      voiceTotal: voice.length,
      openShop: -1,
    }, () => this.apply())
  },

  pickCat(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ cat: this.data.cat === k ? '' : k }, () => this.apply())
  },

  onSearch(e) {
    this.setData({ q: e.detail.value }, () => this.apply())
  },

  clearSearch() {
    this.setData({ q: '' }, () => this.apply())
  },

  more() {
    const shown = this.data.shown + PAGE
    this.setData({ shown, list: (this._list || []).slice(0, shown).map(view) })
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t, openShop: -1, sheet: null })
  },

  // 点菜品 → 底部详情（带这家店的评价）
  openDish(e) {
    const d = e.currentTarget.dataset.d
    const shop = SHOPS[d.shop]
    this.setData({
      sheet: view(d),
      sheetShop: shop ? {
        name: shop.name,
        zone: shop.zone,
        score: shop.score,
        dist: shop.dist,
        n: shop.n,
        revN: shop.revN,
        reviews: shop.reviews.slice(0, 5),
      } : null,
    })
  },

  closeSheet() { this.setData({ sheet: null }) },

  toggleShop(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.setData({ openShop: this.data.openShop === i ? -1 : i })
  },

  moreShops() {
    const shopShown = this.data.shopShown + 20
    this.setData({ shopShown, shops: voiceOf(this.data.scope).slice(0, shopShown) })
  },

  stop() {},

  // 开饭：把人送去美团。本页只负责「有什么菜、卖得怎样、同学怎么说」，
  // 下单、起送价、配送费一律以美团内为准，站内不代下单也不编价格。
  goMeituan() {
    openMeituan({
      title: '去美团点单',
      content: '美团外卖链接已复制。小程序里打不开美团 App，也嵌不了它的页面，请到浏览器粘贴打开；收货地址填「南宁数字科技学院」。这一页只摊菜单，价格与配送费以美团内为准。',
    })
  },

  onShareAppMessage() {
    return { title: '校园美食鉴赏 · 数科云栖校园', path: '/pkgFood/pages/food/index' }
  },
})
