// pages/geely/index.js —— 吉利专区
// 只放三类内容：吉利自己的招聘（校招机会 / 社招岗位）、学校官网发过的吉利动态、集团概况。
// 招聘数据分两处：
//   校招 7 条机会在 utils/career.js（逐条对着学校官网原文写的）
//   社招 15 条岗位在 data/geely-soc.js（脚本从吉利社招官网首屏抓的，带发布时间）
// 页面按「折叠行」展示，点开就地展开，不再往别的页面跳。

const BRANDS = [
  '吉利', '领克', '极氪', '几何', '沃尔沃', '极星', '路特斯',
  '英伦电动汽车', '远程新能源商用车', '雷达新能源汽车', '曹操出行',
]

const { NEWS, BUILT, TOTAL } = require('../../data/geely-live')
const { SOC, SOC_META } = require('../../data/geely-soc')
const C = require('../../utils/career')

// 只算真招人的动作：宣讲、实习、招聘会、offer 与入职；集训、专访这类不混进来
const HIRE_RE = /宣讲|实习生|招聘会|校园招聘|offer|入职|繁星项目|2\+2|创新班/
const HIRES = NEWS.filter((n) => HIRE_RE.test(n.t))

const H5_INTERVIEW_URL = ''
const H5_VIDEO_URL = ''

const STEPS = [
  '认准官方入口：只在 geely.com 域名下投递，不通过第三方链接提交身份证、学籍等敏感信息。',
  '校招看批次，社招看工作年限：应届生优先走 campus.geely.com，社招岗位多数要求相关经验。',
  '材料提前备：学籍验证报告、成绩单、项目与实习经历，按岗位要求准备作品或证书。',
  '批次与截止时间每年调整，以官网当季公告为准，别按往年时间推算。',
]

const stepOf = (k) => C.APPLY_STEPS.find((x) => x.k === (k || '')) || C.APPLY_STEPS[0]
const hit = (o, q) => [o.title, o.org, o.target, o.dirTxt, o.sum].join(' ').toLowerCase().indexOf(q) >= 0

Page({
  data: {
    tab: 'campus',
    brands: BRANDS,
    steps: STEPS,
    campus: C.CAMPUS,
    socials: C.SOCIAL,
    outcomes: C.OUTCOMES,
    kinds: C.KINDS,

    // 校招机会：默认先看培养项目（学校官网发得最多，也是本校学生真能报的口子）
    kind: 'prog',
    kw: '',
    oppView: [],
    openId: '',
    oppN: C.OPP.length,

    // 社招岗位
    soc: SOC,
    socN: SOC.length,
    socTotal: SOC_META.total,
    socBuilt: SOC_META.built,
    socUrl: SOC_META.listUrl,
    socKw: '',
    socView: [],
    openSoc: '',

    // 动态
    news: NEWS,
    newsN: NEWS.length,
    built: BUILT,
    total: TOTAL,
    hires: HIRES,
    hireN: HIRES.length,

    // 我的投递
    favPosts: [],
    applyGroups: [],
    prep: {},
    prepItems: C.PREP_ITEMS,
    prepDone: 0,
    prepN: C.PREP_ITEMS.length,
    favN: 0,
    mineN: 0,
  },

  onLoad(options) {
    const t = options && options.tab
    if (t && ['campus', 'social', 'event', 'mine'].indexOf(t) >= 0) this.setData({ tab: t })
  },

  onShow() {
    this.refresh()
  },

  // 收藏、投递进度、材料清单都可能被别处改过，进页面重算一次
  refresh() {
    const fav = C.readFav()
    const apply = C.readApply()
    const prep = C.readPrep()

    const all = C.OPP.map((o) => {
      const st = stepOf(apply[o.id])
      return Object.assign({}, o, {
        kindName: C.kindName(o.kind),
        dirTxt: (o.dirs || []).join(' / '),
        fav: fav.indexOf(o.id) >= 0,
        st: st.k,
        stName: st.n,
        stCls: st.cls,
      })
    })

    const q = String(this.data.kw || '').trim().toLowerCase()
    const kind = this.data.kind
    const oppView = all.filter((o) => {
      if (kind !== 'all' && o.kind !== kind) return false
      return q ? hit(o, q) : true
    })

    const sq = String(this.data.socKw || '').trim().toLowerCase()
    const socView = SOC.filter((j) => {
      if (!sq) return true
      return [j.t, j.org, j.city, j.zn].join(' ').toLowerCase().indexOf(sq) >= 0
    })

    const groups = C.APPLY_STEPS.filter((s) => s.k).map((s) => {
      const list = all.filter((o) => o.st === s.k)
      return { k: s.k, n: s.n, cls: s.cls, list, cnt: list.length }
    }).filter((g) => g.cnt)

    const appliedIds = Object.keys(apply)
    const favPosts = all.filter((o) => o.fav && appliedIds.indexOf(o.id) < 0)

    this.setData({
      oppView,
      socView,
      applyGroups: groups,
      favPosts,
      favN: fav.length,
      mineN: appliedIds.length,
      prep,
      prepDone: C.PREP_ITEMS.filter((i) => prep[i.k]).length,
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab && tab !== this.data.tab) this.setData({ tab, openId: '', openSoc: '' })
  },

  // —— 校招机会 ——
  onKw(e) {
    this.setData({ kw: e.detail.value || '' })
    this.refresh()
  },
  clearKw() {
    this.setData({ kw: '' })
    this.refresh()
  },
  pickKind(e) {
    this.setData({ kind: e.currentTarget.dataset.k })
    this.refresh()
  },
  // 「共 N 条，看全部」：默认只筛一类，剩下的从这里一次放出来
  pickAll() {
    if (this.data.kind === 'all') return
    this.setData({ kind: 'all' })
    this.refresh()
  },
  // 折叠：同一时间只展开一条，避免整页太长
  toggleOpp(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ openId: this.data.openId === id ? '' : id })
  },
  toggleFav(e) {
    const id = e.currentTarget.dataset.id
    const on = C.toggleFav(id)
    wx.showToast({ title: on ? '已收藏' : '已取消收藏', icon: 'none', duration: 1200 })
    this.refresh()
  },
  // 点一下推进一档：未记录 → 已投递 → 进面试 → 有结果 → 未记录
  cycleApply(e) {
    const id = e.currentTarget.dataset.id
    const nx = C.nextApply(id)
    wx.showToast({ title: nx.k ? '记为「' + nx.n + '」' : '已清除记录', icon: 'none', duration: 1400 })
    this.refresh()
  },
  goInterview(e) {
    const id = (e && e.currentTarget.dataset.id) || ''
    wx.navigateTo({
      url: '/pages/interview/index?track=' + (id ? 'pro' : 'normal') + (id ? '&job=' + encodeURIComponent(id) : ''),
    })
  },

  // —— 社招岗位 ——
  onSocKw(e) {
    this.setData({ socKw: e.detail.value || '' })
    this.refresh()
  },
  clearSocKw() {
    this.setData({ socKw: '' })
    this.refresh()
  },
  toggleSoc(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ openSoc: this.data.openSoc === id ? '' : id })
  },
  // 站内没有逐岗链接（官网是单页应用，岗位地址不对外），复制岗位名去官网搜最稳
  copySocTitle(e) {
    const id = e.currentTarget.dataset.id
    const j = SOC.find((x) => x.id === id)
    if (!j) return
    wx.setClipboardData({
      data: j.t,
      success: () => wx.showToast({ title: '岗位名已复制，去官网搜索', icon: 'none', duration: 2200 }),
    })
  },

  // —— 我的投递 ——
  togglePrep(e) {
    const k = e.currentTarget.dataset.k
    const prep = Object.assign({}, this.data.prep)
    if (prep[k]) delete prep[k]
    else prep[k] = true
    wx.setStorageSync(C.K_PREP, prep)
    this.setData({ prep, prepDone: C.PREP_ITEMS.filter((i) => prep[i.k]).length })
  },

  // —— 复制链接 ——
  copyLink(e) {
    const url = e.currentTarget.dataset.url
    const name = e.currentTarget.dataset.name || ''
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({
        title: name ? name + '链接已复制' : '链接已复制，用浏览器打开',
        icon: 'none',
        duration: 2200,
      }),
    })
  },
  goH5Link(url, name) {
    if (!url) {
      wx.showToast({ title: name + '尚未部署', icon: 'none' })
      return
    }
    this.copyLink({ currentTarget: { dataset: { url, name } } })
  },
  goVideoH5() { this.goH5Link(H5_VIDEO_URL, '视频演练页') },
})
