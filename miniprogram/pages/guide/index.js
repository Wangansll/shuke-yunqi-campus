// pages/guide/index.js —— 办事指南
//
// 一条事项 = 一件要办的事，拆成学生真正会问的五件事：
//   带什么（材料清单，可勾选，进度存本地） / 怎么办（步骤） /
//   去哪办（地点 + 电话可拨 + 线上入口） / 容易卡住（tips） / 出处（可复制）
// 顶部支持 搜索（标题·材料·步骤·地点·别名）+ 分类筛选 + 我的办事（收藏）
const { DAILY, CATS } = require('../../data/guide')
const { HOTLINES } = require('../../utils/campus')
const { buildRoute, routeText } = require('../../utils/route')

const IC = '/images/guide/'
const META = {
  出行: { ic: IC + 'bus-c.png', icOn: IC + 'bus.png', c: '#2B6FE8', l: '#E9F0FE' },
  快递: { ic: IC + 'box-c.png', icOn: IC + 'box.png', c: '#E97611', l: '#FFF1E2' },
  医疗: { ic: IC + 'hospital-c.png', icOn: IC + 'hospital.png', c: '#D93A32', l: '#FDEBEA' },
  生活: { ic: IC + 'cart-c.png', icOn: IC + 'cart.png', c: '#0E9E77', l: '#E4F8F1' },
  教务: { ic: IC + 'book-c.png', icOn: IC + 'book.png', c: '#5A4BD8', l: '#EEEBFD' },
  学籍: { ic: IC + 'cap-c.png', icOn: IC + 'cap.png', c: '#A8780C', l: '#FBF2DC' },
  团学: { ic: IC + 'flag-c.png', icOn: IC + 'flag.png', c: '#B32F4F', l: '#FBE8ED' },
}
const FALLBACK = { ic: IC + 'doc-c.png', icOn: IC + 'doc.png', c: '#2B6FE8', l: '#E9F0FE' }

const HOTS = ['请假', '快递', '热水', '洗衣机', '校园卡', '医保', '学费', '成绩', '吉美楼']
const FAV_KEY = 'guideFav'
const CHK_KEY = 'guideChk'

const BY = {}
DAILY.forEach((d) => { BY[d.k] = d })

const ONLINE_N = DAILY.filter((d) => d.way !== '线下').length

// ---------- 文本处理 ----------
// 数据里用 **xx** 标重点；搜索命中的关键词再加一层高亮
const plain = (s) => String(s || '').replace(/\*\*/g, '')

function seg(text, kw) {
  const out = []
  const push = (s, em) => {
    if (!s) return
    if (kw) {
      const lo = s.toLowerCase()
      const klo = kw.toLowerCase()
      let p = 0
      let idx = lo.indexOf(klo)
      while (idx >= 0) {
        if (idx > p) out.push({ s: s.slice(p, idx), e: em, h: 0 })
        out.push({ s: s.slice(idx, idx + kw.length), e: em, h: 1 })
        p = idx + kw.length
        idx = lo.indexOf(klo, p)
      }
      if (p < s.length) out.push({ s: s.slice(p), e: em, h: 0 })
    } else {
      out.push({ s, e: em, h: 0 })
    }
  }
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m = re.exec(text)
  while (m) {
    push(text.slice(last, m.index), 0)
    push(m[1], 1)
    last = m.index + m[0].length
    m = re.exec(text)
  }
  push(text.slice(last), 0)
  return out.map((x, i) => ({ s: x.s, e: x.e, h: x.h, i }))
}

// 搜索结果只给命中处前后一小段，太长没人看
function snippet(text, kw, r) {
  const t = plain(text)
  const i = t.toLowerCase().indexOf(String(kw).toLowerCase())
  if (i < 0) return t.slice(0, r * 2)
  const s = Math.max(0, i - r)
  const e = Math.min(t.length, i + kw.length + r)
  return (s > 0 ? '…' : '') + t.slice(s, e) + (e < t.length ? '…' : '')
}

// 搜索命中：按"学生最可能想的那一层"排序
// 检索逻辑抽到 utils/search.js，页面和评测脚本共用同一份，避免"自测能搜到、用户搜不到"
const { matchOf, search, suggest } = require('../../utils/search')

// ---------- 本地状态 ----------
function readFav() {
  const v = wx.getStorageSync(FAV_KEY)
  return Array.isArray(v) ? v.filter((k) => BY[k]) : []
}
function readChk() {
  const v = wx.getStorageSync(CHK_KEY)
  return v && typeof v === 'object' ? v : {}
}

function cardOf(d, fav, q, picked) {
  const m = META[d.cat] || FALLBACK
  const hit = q ? matchOf(d, q) : null
  // 高亮用"真正命中的那个词"：整句问法（快递在哪取）在标题里找不到
  const kw = hit ? hit.key : (q || '')
  return {
    k: d.k, t: d.t, brief: d.brief, cat: d.cat, way: d.way,
    entryOnly: !!d.entryOnly,
    catIc: m.ic, c: m.c, light: m.l,
    place: (d.where[0] && d.where[0].n) || '',
    nNeed: d.need.length,
    nSteps: d.steps.length,
    fav: fav.indexOf(d.k) >= 0,
    sel: (picked || []).indexOf(d.k) >= 0,
    tSegs: q ? seg(d.t, kw) : null,
    whyLabel: hit && hit.rank > 0 ? hit.label : '',
    whySegs: hit && hit.rank > 0 ? seg(snippet(hit.text, kw, 22), kw) : null,
    rank: hit ? hit.rank : 0,
  }
}

Page({
  data: {
    total: DAILY.length,
    catN: CATS.length,
    onlineN: ONLINE_N,
    hots: HOTS,
    filters: [{ k: '全部', n: '全部', ic: IC + 'grid-c.png', icOn: IC + 'grid.png', count: DAILY.length }].concat(
      CATS.map((c) => {
        const m = META[c] || FALLBACK
        return { k: c, n: c, ic: m.ic, icOn: m.icOn, count: DAILY.filter((x) => x.cat === c).length }
      })
    ),
    filter: '全部',
    q: '',
    view: [],
    favCards: [],
    miss: [],
    missQ: '',
    openK: '',
    open: null,
    hotlines: HOTLINES,
    // 路线编排
    routeOn: false,
    picked: [],
    route: null,
    startAt: '09:00',
    hasRoute: false,
  },

  onLoad(q) {
    this.st = 0
    this.pending = q && q.k && BY[q.k] ? q.k : ''
    this.refresh()
  },
  onShow() {
    this.refresh()
    // 从别处带着 ?k=xxx 进来，直接展开那一件
    if (this.pending) {
      const k = this.pending
      this.pending = ''
      setTimeout(() => this.jumpTo({ currentTarget: { dataset: { k } } }), 80)
    }
  },
  onPageScroll(e) { this.st = e.scrollTop },

  // 重建列表 + 我的办事
  refresh() {
    const fav = readFav()
    const q = String(this.data.q || '').trim()
    const cat = this.data.filter
    // 有搜索词时按全库搜：用户搜"快递"却在"教务"分类里，不该给他一个空列表
    let list = q
      ? search(DAILY, q).map((x) => x.d)
      : DAILY.filter((d) => cat === '全部' || d.cat === cat)
    const miss = q && !list.length ? suggest(DAILY, q, 3) : []
    const chk = readChk()
    const picked = this.data.picked || []
    this.setData({
      view: list.map((d) => cardOf(d, fav, q, picked)),
      missQ: miss.length ? q : '',
      miss: miss.map((d) => ({ k: d.k, t: d.t, cat: d.cat })),
      // 我的办事带材料进度，一眼看出哪件还没备齐
      favCards: fav.map((k) => {
        const d = BY[k]
        const done = d.need.filter((x, i) => chk[k + '#' + i]).length
        return {
          k, t: d.t, brief: d.brief,
          prog: d.need.length ? done + '/' + d.need.length : '',
          full: !!d.need.length && done === d.need.length,
        }
      }),
    })
  },

  // ---------- 搜索 / 筛选 ----------
  onInput(e) {
    const q = e.detail.value
    // 一旦开始搜，就把分类切回全部：搜索是按全库查的，分类标签留着会误导
    this.setData({ q, filter: q ? '全部' : this.data.filter, openK: '', open: null })
    this.refresh()
  },
  clearQ() {
    this.setData({ q: '', openK: '', open: null })
    this.refresh()
  },
  pickHot(e) {
    this.setData({ q: e.currentTarget.dataset.w, filter: '全部', openK: '', open: null })
    this.refresh()
  },
  pickFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.k, openK: '', open: null })
    this.refresh()
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  // ---------- 展开 / 收起 ----------
  // 行点击：选择态是勾选，否则展开。统一一个方法，不依赖动态事件名
  onRowTap(e) {
    if (this.data.routeOn) { this.pickItem(e); return }
    this.toggle(e)
  },
  buildOpen(k) {
    const d = BY[k]
    const chk = readChk()
    const need = d.need.map((x, i) => ({ i, x, segs: seg(x), on: !!chk[k + '#' + i] }))
    return {
      k, t: d.t, cat: d.cat, brief: d.brief, way: d.way, due: d.due, src: d.src,
      entryOnly: !!d.entryOnly,
      need, needN: need.length, doneN: need.filter((n) => n.on).length,
      steps: d.steps.map((s, i) => ({ n: i + 1, segs: seg(s) })),
      where: d.where,
      entry: d.entry || null,
      tips: (d.tips || []).map((x, i) => ({ i, segs: seg(x) })),
      rel: (d.rel || []).filter((x) => BY[x]).map((x) => ({
        k: x, t: BY[x].t, ic: (META[BY[x].cat] || FALLBACK).ic,
      })),
    }
  },
  toggle(e) {
    const k = e.currentTarget.dataset.k
    if (this.data.openK === k) { this.setData({ openK: '', open: null }); return }
    this.setData({ openK: k, open: this.buildOpen(k) })
  },

  // 材料勾选：当场存，换页面回来还在
  toggleNeed(e) {
    const k = e.currentTarget.dataset.k
    const i = Number(e.currentTarget.dataset.i)
    const key = k + '#' + i
    const chk = readChk()
    if (chk[key]) delete chk[key]
    else chk[key] = 1
    wx.setStorageSync(CHK_KEY, chk)
    const open = this.data.open
    if (!open || open.k !== k) return
    open.need = open.need.map((n) => (n.i === i ? Object.assign({}, n, { on: !n.on }) : n))
    open.doneN = open.need.filter((n) => n.on).length
    this.setData({ open })
    this.refresh()   // 同步「我的办事」上的材料进度
    if (open.doneN === open.needN && open.needN > 0) wx.showToast({ title: '材料齐了', icon: 'none' })
  },

  // ---------- 路线编排：选几件 → 排一条路线 ----------
  startRoute() {
    this.setData({ routeOn: true, picked: [], route: null, openK: '', open: null })
    this.refresh()
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  stopRoute() {
    this.setData({ routeOn: false, picked: [], route: null })
    this.refresh()
  },
  pickItem(e) {
    const k = e.currentTarget.dataset.k
    let picked = (this.data.picked || []).slice()
    const i = picked.indexOf(k)
    if (i >= 0) picked.splice(i, 1)
    else {
      if (picked.length >= 5) { wx.showToast({ title: '一次最多排 5 件', icon: 'none' }); return }
      picked.push(k)
    }
    this.setData({ picked })
    this.refresh()
  },
  genRoute() {
    const picked = this.data.picked || []
    if (picked.length < 2) { wx.showToast({ title: '至少选 2 件', icon: 'none' }); return }
    const r = buildRoute(picked, { start: this.data.startAt })
    if (!r) { wx.showToast({ title: '这两个没法排在一起', icon: 'none' }); return }
    // 文本里的 ** 标记去掉，页面上不再渲染星号
    r.steps.forEach((s) => s.items.forEach((it) => { it.tip = plain(it.tip) }))
    r.blocked.forEach((b) => { b.why = plain(b.why) })
    r.online.forEach((o) => { o.note = plain(o.note) })
    this.setData({ route: r, routeTxt: routeText(r), routeOn: false })
  },
  closeRoute() {
    this.setData({ route: null })
  },
  setStart(e) {
    const v = e.detail.value
    this.setData({ startAt: v })
    const r = buildRoute(this.data.picked || [], { start: v })
    if (!r) return
    r.steps.forEach((s) => s.items.forEach((it) => { it.tip = plain(it.tip) }))
    r.blocked.forEach((b) => { b.why = plain(b.why) })
    r.online.forEach((o) => { o.note = plain(o.note) })
    this.setData({ route: r, routeTxt: routeText(r) })
  },
  copyRoute() {
    if (!this.data.routeTxt) return
    this.copy(this.data.routeTxt, '路线已复制，可发给同学')
  },
  // 从路线里跳到某件事的详情
  fromRoute(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ route: null }, () => this.jumpTo({ currentTarget: { dataset: { k } } }))
  },

  // ---------- 收藏 = 我的办事 ----------
  toggleFav(e) {
    const k = e.currentTarget.dataset.k
    const fav = readFav()
    const i = fav.indexOf(k)
    if (i >= 0) fav.splice(i, 1)
    else fav.unshift(k)
    wx.setStorageSync(FAV_KEY, fav)
    this.refresh()
    wx.showToast({ title: i >= 0 ? '已移出我的办事' : '已加入我的办事', icon: 'none' })
  },
  // 从"我的办事"跳到列表里的那张卡
  jumpTo(e) {
    const k = e.currentTarget.dataset.k
    const show = () => {
      this.setData({ openK: k, open: this.buildOpen(k) }, () => {
        // 先归零再量位置，避免算进上一次的滚动量；展开会撑高页面，120ms 后再校正一次
        const at = (dur) => {
          wx.createSelectorQuery().select('#card-' + k).boundingClientRect().exec((r) => {
            if (!r[0]) return
            wx.pageScrollTo({ scrollTop: Math.max(0, r[0].top - 100), duration: dur })
          })
        }
        wx.pageScrollTo({ scrollTop: 0, duration: 0 })
        // 等展开后的布局稳定再量，此时页面在顶部，top 就是绝对位置
        setTimeout(() => at(0), 150)
      })
    }
    if (this.data.q || this.data.filter !== '全部') {
      this.setData({ q: '', filter: '全部' }, () => { this.refresh(); setTimeout(show, 30) })
    } else { show() }
  },

  // ---------- 复制 / 拨号 / 线上入口 ----------
  copy(text, tip) {
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: tip || '已复制', icon: 'none' }),
    })
  },
  copySrc(e) {
    const s = e.currentTarget.dataset.src
    if (!s) { wx.showToast({ title: '这条没有出处', icon: 'none' }); return }
    this.copy(s, '出处已复制')
  },
  copyNeed() {
    const o = this.data.open
    if (!o) return
    const L = ['【' + o.t + '】要带的材料']
    if (o.needN) o.need.forEach((n, i) => L.push((i + 1) + '. ' + n.x))
    else L.push('（这一步不用带材料）')
    L.push('')
    L.push('办理方式：' + o.way)
    if (o.due) L.push('时间：' + o.due)
    L.push('出处：' + o.src)
    L.push('—— 数科云栖校园 · 办事指南')
    this.copy(L.join('\n'), '清单已复制，可直接发给同学')
  },
  copyAll() {
    const o = this.data.open
    if (!o) return
    const L = ['【' + o.t + '】', o.brief, '']
    if (o.needN) {
      L.push('要带什么')
      o.need.forEach((n, i) => L.push((i + 1) + '. ' + n.x))
      L.push('')
    }
    L.push('怎么办')
    o.steps.forEach((s) => L.push(s.n + '. ' + plain(s.segs.map((x) => x.s).join(''))))
    L.push('')
    L.push('去哪办')
    o.where.forEach((w) => L.push('· ' + w.n + (w.d ? '（' + w.d + '）' : '') + (w.tel ? ' ' + w.tel : '')))
    if (o.entry) L.push('· 线上入口：' + o.entry.n)
    if (o.due) L.push('')
    if (o.due) L.push('时间：' + o.due)
    L.push('')
    L.push('出处：' + o.src)
    L.push('—— 数科云栖校园 · 办事指南')
    this.copy(L.join('\n'), '全文已复制')
  },
  call(e) {
    const tel = e.currentTarget.dataset.tel
    if (!tel) return
    wx.makePhoneCall({ phoneNumber: String(tel), fail: () => {} })
  },
  openEntry() {
    const en = this.data.open && this.data.open.entry
    if (!en) return
    if (en.kind === 'page') { wx.navigateTo({ url: en.u }); return }
    wx.setClipboardData({
      data: en.u,
      success: () => wx.showModal({
        title: '链接已复制',
        content: '小程序里打不开外部网页，需要到浏览器地址栏粘贴访问「' + en.n + '」。',
        showCancel: false,
        confirmText: '知道了',
      }),
    })
  },

  goWiki() {
    const q = String(this.data.q || '').trim()
    wx.navigateTo({ url: '/pages/wiki/index' + (q ? '?q=' + encodeURIComponent(q) : '') })
  },

  onShareAppMessage() {
    return { title: '办事指南 · 带什么、去哪办、出处都写清楚了', path: '/pages/guide/index' }
  },
})
