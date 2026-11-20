// pages/wiki/index.js —— 校园百科：整站语料检索 + 官方图册
const wiki = require('../../utils/wiki')

const HOT = ['校历', '开学时间', '奖学金', '转专业', '宿舍', '食堂', '图书馆', '招聘', '比赛', '放假']

// 官方图（已下载到本地包，原图来自学校官网）
const GALLERY = [
  { k: 'niaokan', n: '新校区鸟瞰图', d: '学校官网「校园地图」页原图', src: '/images/wiki/niaokan.jpg' },
  { k: 'xiaoli', n: '2026-2027 学年校历', d: '含作息时间、开学、放假、节假日', src: '/images/wiki/xiaoli.jpg' },
  { k: 'xiaohui', n: '校徽', d: '篆体「相思湖」+ 建校 2002', src: '/images/wiki/xiaohui.jpg' },
  { k: 'xiaohui-zuhe', n: '校徽组合规范', d: '官网「标识文化」页', src: '/images/wiki/xiaohui-zuhe.jpg' },
]

Page({
  data: {
    q: '',
    hot: HOT,
    items: [],
    total: 0,
    built: '',
    loading: false,
    tip: '',
    gallery: GALLERY,
    galleryView: GALLERY,
    wide: '',          // 当前铺满整行的那张图
    openIdx: -1,       // 展开的搜索结果
  },

  onLoad(q) {
    this.loadStats()
    // 从办事指南"没找到，去百科搜"带着词过来，直接出结果，不用再输一遍
    if (q && q.q) {
      this.setData({ q: String(q.q) }, () => this.doSearch())
    }
  },

  async loadStats() {
    const s = await wiki.stats()
    if (s.ok) this.setData({ total: s.total, built: s.built })
    else this.setData({ tip: '检索服务暂时不可用：' + s.why })
  },

  onInput(e) { this.setData({ q: e.detail.value }) },

  pickHot(e) {
    const w = e.currentTarget.dataset.w
    this.setData({ q: w })
    this.doSearch()
  },

  async doSearch() {
    const q = (this.data.q || '').trim()
    if (!q) { this.setData({ tip: '输入关键词再搜' }); return }
    this.setData({ loading: true, tip: '', openIdx: -1 })
    const r = await wiki.search(q, 8)
    if (r.ok) {
      this.setData({ loading: false, items: r.items, total: r.total, built: r.built })
      if (!r.items.length) this.setData({ tip: '没搜到与「' + q + '」相关的内容' })
    } else {
      this.setData({ loading: false, items: [], tip: '检索失败：' + r.why })
    }
  },

  toggle(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.setData({ openIdx: this.data.openIdx === i ? -1 : i })
  },

  copyLink(e) {
    const u = e.currentTarget.dataset.u
    if (!u) { wx.showToast({ title: '这条没有原文链接', icon: 'none' }); return }
    wx.setClipboardData({
      data: u,
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' }),
    })
  },

  // 图册：点一张 → 这张横排铺满整行；再点同一张 → 收回 2×2
  tapCard(e) {
    const k = e.currentTarget.dataset.k
    const wide = this.data.wide === k ? '' : k
    this.setData({ wide, galleryView: this.orderOf(wide) })
  },
  // 铺满的那张提到最前，免得它在中间撑开一行、上面留半格空白
  orderOf(k) {
    if (!k) return GALLERY
    const i = GALLERY.findIndex((g) => g.k === k)
    if (i < 0) return GALLERY
    return [GALLERY[i]].concat(GALLERY.filter((g, idx) => idx !== i))
  },
  // 放大看原图：走原生 previewImage，能双指缩放、能存相册
  zoom(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({
      current: src,
      urls: this.data.gallery.map((g) => g.src),
    })
  },

  onShareAppMessage() {
    return { title: '数科云栖校园 · 校园百科', path: '/pages/wiki/index' }
  },
})
