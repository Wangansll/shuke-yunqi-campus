// pages/express/index.js —— 快递查询
// 真实轨迹来自云托管接口 /api/express（服务端带 Referer 走公开查询通道）
// 之前走的是云函数 getExpress，但本 AppID 的云函数被平台禁用（code 10），所以改走容器。
// 查不到时不让用户卡住：保留单号 + 一键复制，去菜鸟驿站/菜鸟裹裹继续查。
const wxhost = require('../../utils/wxhost')

const COMS = [
  { code: '', name: '自动识别' },
  { code: 'zhongtong', name: '中通快递' },
  { code: 'yuantong', name: '圆通速递' },
  { code: 'shentong', name: '申通快递' },
  { code: 'yunda', name: '韵达快递' },
  { code: 'shunfeng', name: '顺丰速运' },
  { code: 'jtexpress', name: '极兔速递' },
  { code: 'jd', name: '京东物流' },
  { code: 'ems', name: 'EMS' },
  { code: 'youzhengguonei', name: '邮政快递包裹' },
  { code: 'debangwuliu', name: '德邦快递' },
  { code: 'zhaijisong', name: '宅急送' },
]
const COM_NAMES = COMS.map(c => c.name)
const CODE_NAME = COMS.reduce((m, c) => { if (c.code) m[c.code] = c.name; return m }, {})

Page({
  data: {
    no: '', loading: false, done: false, fail: '', hint: '',
    list: [], comName: '', pickIndex: 0, comNames: COM_NAMES,
    phone: '',
  },

  onLoad() {
    const last = wx.getStorageSync('exp_last')
    if (last && last.no) {
      const i = COMS.findIndex(c => c.code === (last.com || ''))
      this.setData({ no: last.no, pickIndex: i < 0 ? 0 : i })
    }
  },

  onInput(e) { this.setData({ no: e.detail.value }) },

  // 隐私面单：只收后四位，且不落本地存储
  onPhone(e) {
    const v = String(e.detail.value || '').replace(/\D/g, '').slice(0, 4)
    this.setData({ phone: v })
  },

  clear() { this.setData({ no: '', done: false, fail: '', list: [], comName: '' }) },

  onComChange(e) { this.setData({ pickIndex: Number(e.detail.value) }) },

  async doQuery() {
    if (this.data.loading) return
    const no = String(this.data.no || '').replace(/[\s-]/g, '')
    if (no.length < 6) {
      wx.showToast({ title: '单号太短了', icon: 'none' })
      return
    }
    const comCode = (COMS[this.data.pickIndex] || {}).code || ''
    this.setData({ loading: true, done: false, fail: '', list: [] })
    try {
      const q = '?no=' + encodeURIComponent(no) + '&com=' + encodeURIComponent(comCode)
        + (this.data.phone ? '&phone=' + this.data.phone : '')
      // 服务端要串两次上游（识别 + 查询），实测约 9 秒，所以放宽到 20 秒
      const r = await wxhost.call('/api/express' + q, {}, 'GET', { timeout: 20000 })
      if (r && r.ok) {
        const idx = COMS.findIndex((c) => c.code === r.com)
        this.setData({
          loading: false,
          done: true,
          list: r.list || [],
          no,
          comName: CODE_NAME[r.com] || r.comName || '快递',
          // 自动识别命中了就把选择器同步过去，避免显示和实际不符
          pickIndex: (this.data.pickIndex === 0 && idx > 0) ? idx : this.data.pickIndex,
        })
        try { wx.setStorageSync('exp_last', { no, com: r.com || '' }) } catch (e) {}
      } else {
        const msg = (r && r.error) || '查不到这条单号'
        const hint = (r && r.hint) || (this.data.phone ? '' : '（如果是隐私面单，填上收件人手机后四位再试）')
        this.setData({ loading: false, no, fail: msg, hint })
      }
    } catch (e) {
      // 接口把明确的失败原因和附加提示都放在 body 里（见 utils/wxhost.call）
      const b = (e && e.body) || {}
      const msg = b.error || (e && e.message) || '查询失败'
      const hint = b.hint || (this.data.phone ? '' : '如果是隐私面单，填上收件人手机后四位再试')
      this.setData({
        loading: false,
        no,
        fail: msg,
        hint,
      })
    }
  },

  copyNo() {
    if (!this.data.no) return
    wx.setClipboardData({
      data: this.data.no,
      success: () => wx.showToast({ title: '单号已复制', icon: 'none' }),
    })
  },
})
