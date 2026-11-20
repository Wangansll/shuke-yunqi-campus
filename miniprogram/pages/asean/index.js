// pages/asean/index.js —— 东盟专区（汇率 / 翻译 / 时差 / 十国速查 / 出行清单）
const { cloud, pickModel, fetchFx, FX_TARGETS } = require('../../utils/biz')
const { syncTabBar } = require('../../utils/tabbar')
const { COUNTRIES, PHRASES, CHECKLIST, DENOMS } = require('./data')
const { GUIDE, GUIDE_TABS, NEWS_AT, POLICY_CHECKED } = require('./guide')

const LANG_NAMES = { th: '泰语', vi: '越南语', ms: '马来语', en: '英语' }
const CK_KEY = 'asean_check_v1'

// 指南六个板块的字徽与一行说明（与十国卡片的单字徽标同一套视觉语言）
const GD_META = {
  what: { icon: '盟', desc: '成立 · 规模 · 机制' },
  where: { icon: '位', desc: '位置 · 口岸 · 通道' },
  event: { icon: '会', desc: '东博会 · 峰会' },
  news: { icon: '闻', desc: '最新经贸动态' },
  care: { icon: '戒', desc: '禁忌 · 安全 · 海关' },
  do: { icon: '办', desc: '签证 · 认证 · 留学' },
}
const GD_TABS = GUIDE_TABS.map((t) => Object.assign({}, t, GD_META[t.k] || { icon: '·', desc: '' }))

// 按 UTC 偏移算当地时间，不依赖设备时区
function tzTime(tz, withSec) {
  const d = new Date(Date.now() + tz * 3600000)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  const hm = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes())
  return withSec ? hm + ':' + p(d.getUTCSeconds()) : hm
}
function diffText(tz) {
  const d = +(tz - 8).toFixed(1)
  if (d === 0) return '与北京同时'
  return d > 0 ? '早 ' + d + ' 小时' : '晚 ' + Math.abs(d) + ' 小时'
}
// 千分位自带实现：小程序 JS 引擎的 toLocaleString('zh-CN') 会输出点号，不可靠
function group(s) {
  const p = String(s).split('.')
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return p.join('.')
}
function fmt(x) {
  if (!isFinite(x)) return '—'
  if (x >= 1000) return group(x.toFixed(2))
  if (x >= 1) return x.toFixed(2)
  if (x >= 0.01) return x.toFixed(4)
  return x.toFixed(6)
}
// 汇率时间戳转北京时间 MM-DD HH:mm
function fmtTime(s) {
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s || '').replace('UTC', '').trim()
  const b = new Date(d.getTime() + 8 * 3600000)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return p(b.getUTCMonth() + 1) + '-' + p(b.getUTCDate()) + ' ' + p(b.getUTCHours()) + ':' + p(b.getUTCMinutes())
}

Page({
  data: {
    // 汇率
    amount: '100',
    denoms: DENOMS,
    fxMode: 'out', // out: 人民币→外币  in: 外币→人民币
    fxCode: 'THB',
    fxList0: FX_TARGETS, // 币种选择（in 模式）
    fxRate: '', // in 模式下 1 外币 = ? 人民币
    fxReady: false, fxError: '', fxTime: '', fxList: [], rates: null,
    // 翻译
    srcText: '这个多少钱？', trLang: 'th', trResult: '', translating: false,
    langs: [{ code: 'th', name: '泰语' }, { code: 'vi', name: '越南语' }, { code: 'ms', name: '马来语' }, { code: 'en', name: '英语' }],
    phrases: PHRASES, phraseGroup: 0,
    // 时钟
    bjTime: '', clock: [],
    // 十国
    countries: COUNTRIES, search: '', list: COUNTRIES,
    showDetail: false, country: {},
    // 清单
    checklist: [], checkDone: 0,
    // 指南
    gdOpen: false, gdAnchor: '', gdTab: 'what',
    guide: GUIDE, gdTabs: GD_TABS, newsAt: NEWS_AT, policyAt: POLICY_CHECKED,
    // 其他
    modelReady: false, model: null,
    heroTags: ['10 国', 'RCEP', '东博会'], curSec: 'fx',
    secs: [{ k: 'fx', t: '汇率' }, { k: 'tr', t: '翻译' }, { k: 'clk', t: '时差' }, { k: 'ct', t: '十国' }, { k: 'ck', t: '清单' }],
  },

  onLoad() {
    this.loadFx()
    this.initCheck()
    this.tick()
    this._t = setInterval(() => this.tick(), 1000)
    pickModel().then((m) => this.setData({ model: m, modelReady: !!m })).catch(() => {})
  },
  onShow() {
    syncTabBar(this, 3)
    if (!this._t) {
      this.tick()
      this._t = setInterval(() => this.tick(), 1000)
    }
    // 汇率卡加载完高度才稳定，延迟重测分区位置
    setTimeout(() => this.measureSecs(), 1500)
  },
  onHide() {
    this.stopClock()
    this.setTabBarHidden(false)
    if (this.data.gdOpen) this.setData({ gdOpen: false, gdAnchor: '' })
  },
  onUnload() { this._dead = true; this.setTabBarHidden(false); this.stopClock() },

  // ---------- 分区导航滚动联动 ----------
  onReady() { this.measureSecs() },
  measureSecs() {
    if (this._dead) return
    const q = wx.createSelectorQuery()
    this.data.secs.forEach((s) => q.select('#sec-' + s.k).boundingClientRect())
    q.selectViewport().scrollOffset()
    q.exec((res) => {
      if (this._dead) return
      const vp = res[res.length - 1] || {}
      const scrollTop = vp.scrollTop || 0
      this._secTops = this.data.secs
        .map((s, i) => ({ k: s.k, top: res[i] ? res[i].top + scrollTop : 0 }))
        .filter((x) => x.top > 0)
    })
  },
  onPageScroll(e) {
    const tops = this._secTops
    if (!tops || !tops.length) return
    let cur = tops[0].k
    for (let i = 0; i < tops.length; i++) {
      if (e.scrollTop >= tops[i].top - 110) cur = tops[i].k
    }
    if (cur !== this.data.curSec) this.setData({ curSec: cur })
  },
  // 滚到底时 last 区块整体高于阈值，单独兜一次，避免导航停在倒数第二个
  onReachBottom() {
    const secs = this.data.secs
    const last = secs[secs.length - 1]
    if (last && this.data.curSec !== last.k) this.setData({ curSec: last.k })
  },
  stopClock() {
    if (this._t) { clearInterval(this._t); this._t = null }
  },

  // ---------- 时钟 ----------
  tick() {
    const bj = tzTime(8, true)
    const clock = COUNTRIES.map((c) => ({ n: c.n, abbr: c.abbr, t: tzTime(c.tz), d: diffText(c.tz), tz: c.tz }))
    // 只在北京时间秒数变化时刷新大字；分钟变化时刷新列表
    if (this.data.bjTime !== bj) {
      const patch = { bjTime: bj }
      if (bj.slice(0, 5) !== (this.data.bjTime || '').slice(0, 5)) patch.clock = clock
      else if (!this.data.clock.length) patch.clock = clock
      this.setData(patch)
    }
  },

  // ---------- 汇率 ----------
  async loadFx() {
    const r = await fetchFx()
    if (!r) {
      this.setData({ fxReady: false, fxError: '汇率暂时无法获取，请稍后重试' })
      return
    }
    this.setData({ rates: r.rates, fxTime: fmtTime(r.time) })
    this.calcFx(this.data.amount)
  },
  onAmount(e) { this.setData({ amount: e.detail.value }); this.calcFx(e.detail.value) },
  setDenom(e) {
    const v = String(e.currentTarget.dataset.v)
    this.setData({ amount: v })
    this.calcFx(v)
  },
  switchMode(e) {
    const m = e.currentTarget.dataset.m
    if (m === this.data.fxMode) return
    this.setData({ fxMode: m })
    this.calcFx(this.data.amount)
  },
  pickFx(e) {
    this.setData({ fxCode: e.currentTarget.dataset.c })
    this.calcFx(this.data.amount)
  },
  calcFx(v) {
    const rates = this.data.rates
    const n = parseFloat(v)
    if (!rates || isNaN(n)) { this.setData({ fxList: [], fxReady: false }); return }

    if (this.data.fxMode === 'out') {
      // 人民币 → 外币
      const list = FX_TARGETS.filter((t) => rates[t.code]).map((t) => ({
        code: t.code, name: t.name, badge: t.code, value: fmt(n * rates[t.code]),
      }))
      this.setData({ fxList: list, fxReady: list.length > 0, fxRate: '' })
      return
    }
    // 外币 → 人民币
    const t = FX_TARGETS.find((x) => x.code === this.data.fxCode)
    const r = t && rates[t.code]
    if (!r) { this.setData({ fxReady: false, fxError: '该币种汇率不可用' }); return }
    const one = 1 / r
    this.setData({
      fxReady: true,
      fxRate: '1 ' + t.name + ' ≈ ' + fmt(one) + ' CNY',
      fxList: [
        { code: 'r', name: n + ' ' + t.name, badge: this.data.fxCode, value: fmt(n * one) + ' CNY' },
        { code: 'k', name: '1000 ' + t.name, badge: '', value: fmt(1000 * one) + ' CNY' },
        { code: 'w', name: '10000 ' + t.name, badge: '', value: fmt(10000 * one) + ' CNY' },
      ],
    })
  },

  // ---------- 翻译 ----------
  onTrInput(e) { this.setData({ srcText: e.detail.value }) },
  setLang(e) { this.setData({ trLang: e.currentTarget.dataset.c, trResult: '' }) },
  pickGroup(e) { this.setData({ phraseGroup: Number(e.currentTarget.dataset.i) }) },
  usePhrase(e) { this.setData({ srcText: e.currentTarget.dataset.t, trResult: '' }) },
  async doTranslate() {
    const text = (this.data.srcText || '').trim()
    if (!text) { wx.showToast({ title: '请输入内容', icon: 'none' }); return }
    if (!this.data.model) { wx.showToast({ title: '模型未就绪', icon: 'none' }); return }
    this.setData({ translating: true, trResult: '' })
    const lang = LANG_NAMES[this.data.trLang] || this.data.trLang
    let out = ''
    try {
      for await (const chunk of cloud.llm.chat.completions.create({
        model: this.data.model.id,
        messages: [
          { role: 'system', content: '你是翻译助手。只输出译文，不要解释、不要加引号、不要附加任何说明。' },
          { role: 'user', content: '把下面这段中文翻译成' + lang + '：\n' + text },
        ],
        stream: true,
      })) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (d && d.content) out += d.content
      }
      this.setData({ trResult: out.trim() })
    } catch (e) {
      wx.showToast({ title: '翻译失败，请重试', icon: 'none' })
    } finally {
      this.setData({ translating: false })
    }
  },
  copyTr() {
    wx.setClipboardData({ data: this.data.trResult, success: () => wx.showToast({ title: '已复制', icon: 'none' }) })
  },

  // ---------- 十国速查 ----------
  onSearch(e) {
    const k = (e.detail.value || '').trim().toLowerCase()
    const list = !k ? COUNTRIES : COUNTRIES.filter((c) =>
      (c.n + c.en + c.cap + c.cur + c.curName + c.lang).toLowerCase().indexOf(k) >= 0)
    this.setData({ search: e.detail.value, list })
  },
  clearSearch() { this.setData({ search: '', list: COUNTRIES }) },
  showCountry(e) {
    const c = this.data.list[e.currentTarget.dataset.i]
    // 弹层要盖住自定义 tabBar，同样只能让它自己隐藏
    this.setTabBarHidden(true)
    this.setData({ showDetail: true, country: Object.assign({}, c, { now: tzTime(c.tz, true), diff: diffText(c.tz) }) })
  },
  hideCountry() {
    this.setTabBarHidden(false)
    this.setData({ showDetail: false })
  },

  // ---------- 出行清单 ----------
  initCheck() {
    let saved = []
    try { saved = wx.getStorageSync(CK_KEY) || [] } catch (e) {}
    const checklist = CHECKLIST.map((t, i) => ({ t, on: !!saved[i] }))
    this.setData({ checklist, checkDone: checklist.filter((x) => x.on).length })
  },
  toggleCheck(e) {
    const i = e.currentTarget.dataset.i
    const checklist = this.data.checklist.slice()
    checklist[i] = { t: checklist[i].t, on: !checklist[i].on }
    const done = checklist.filter((x) => x.on).length
    this.setData({ checklist, checkDone: done })
    try { wx.setStorageSync(CK_KEY, checklist.map((x) => x.on)) } catch (e) {}
  },
  resetCheck() {
    const checklist = CHECKLIST.map((t) => ({ t, on: false }))
    this.setData({ checklist, checkDone: 0 })
    try { wx.setStorageSync(CK_KEY, []) } catch (e) {}
  },

  // ---------- 东盟指南 ----------
  openGd(e) {
    const k = e.currentTarget.dataset.k || 'what'
    // 自定义 tabBar 渲染在页面容器之外，z-index 压不住，只能让它自己隐藏
    this.setTabBarHidden(true)
    this.setData({ gdOpen: true, gdTab: k, gdAnchor: '' })
    setTimeout(() => this.setData({ gdAnchor: 'gd-' + k }), 130)
  },
  closeGd() {
    this.setTabBarHidden(false)
    this.setData({ gdOpen: false, gdAnchor: '' })
  },
  setTabBarHidden(h) {
    if (typeof this.getTabBar !== 'function') return
    const tb = this.getTabBar()
    if (tb && tb.data && tb.data.hidden !== h) tb.setData({ hidden: h })
  },
  jumpGd(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ gdTab: k, gdAnchor: '' })
    setTimeout(() => this.setData({ gdAnchor: 'gd-' + k }), 60)
  },
  noop() {},

  // ---------- 分区跳转 ----------
  scrollSec(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ curSec: k })
    wx.createSelectorQuery().select('#sec-' + k).boundingClientRect()
      .selectViewport().scrollOffset().exec((res) => {
        if (!res[0]) return
        wx.pageScrollTo({ scrollTop: res[0].top + res[1].scrollTop - 96, duration: 260 })
      })
  },
})
