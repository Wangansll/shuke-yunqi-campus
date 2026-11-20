// pages/board/index.js —— 校园互助墙：失物招领 / 二手 / 求助
// 为什么站内做：这三类原本都是"跳易校园 App"，点进去就离开小程序，等于没有。
// 站内发布 + 云端列表，数据是真人发的（不是内置假数据），才谈得上"能办事"。
const db = require('../../utils/db')
const wxhost = require('../../utils/wxhost')
const K = require('../../utils/klass')
const H = require('../../utils/honor')
const C = require('../../utils/contribute')
const ID = require('../../utils/identity')
const CUP_SRC = ID.CUP_SRC
const PROFILE_KEY = 'wx_profile_v1'
// 云端 posts / profile 接口现在都带身份了；这份按帖子 id 的旧映射只作历史帖子兜底
const WHO_KEY = 'board_who_v1'

const readWho = () => {
  try {
    const v = wx.getStorageSync(WHO_KEY)
    return v && typeof v === 'object' ? v : {}
  } catch (e) { return {} }
}
// 身份随帖子存本机：兼容旧格式（纯文字），新格式存 {klass, honor, metal}
const writeWho = (id, val) => {
  if (!id || !val) return
  const m = readWho()
  m[String(id)] = val
  try { wx.setStorageSync(WHO_KEY, m) } catch (e) {}
}

const CATS = [
  { k: 'lost', n: '失物招领', ic: '🔍', ph: '丢了什么 / 捡到什么，在哪一片' },
  { k: 'second', n: '二手转卖', ic: '🔄', ph: '出什么、成色、多少钱、怎么自提' },
  { k: 'help', n: '求助互帮', ic: '🙋', ph: '需要帮什么忙，什么时候' },
]

// 旧帖身份只存了整段纯文字「《23计科4班》 · 先驱者」，没拆字段 → 牌匾出不来。
// 这里拆回班级 / 头衔 / 奖杯；拆不出头衔就退回纯文字，不硬套牌匾。
const parseOldWho = (txt) => {
  const segs = String(txt || '').split('·').map((x) => String(x).trim()).filter(Boolean)
  let klass = '', honor = '', metal = ''
  const metalChar = { 金: 'gold', 银: 'silver', 铜: 'bronze' }
  segs.forEach((seg) => {
    if (/^《.+》$/.test(seg)) { klass = seg; return }
    if (H.hasName(seg)) { honor = seg; metal = H.metalOfName(seg); return }
    const m = seg.match(/^(.+?)[（(]([金银铜])[)）]$/)
    if (m && H.hasName(m[1])) { honor = m[1]; metal = metalChar[m[2]] }
  })
  return { klass, honor, metal, ok: !!honor }
}

function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// 云端不可用时只说一句话，别把错误码原件丢给学生看
function cloudNoteOf(why) {
  const w = String(why || '')
  if (/授权服务商|环境不存在|自建云开发/.test(w)) {
    return '当前账号的自建云数据库被平台禁用（AppID 已授权服务商使用云开发），这里显示的是你本机发的记录。'
  }
  if (/还没有建集合/.test(w)) {
    return '云端集合还没建，这里显示的是你本机发的记录；建好集合后会自动汇总。'
  }
  return '云端暂时不可用（' + (w || '网络未通') + '），这里显示的是你本机发的记录。'
}

Page({
  data: {
    cats: CATS,
    catIndex: 0,
    title: '',
    desc: '',
    contact: '',
    showForm: false,
    posting: false,
    items: [],
    mineOnly: false,
    cloudNote: '',
    tip: '',
    curCat: 'all',
    // 发帖时带上的身份：班级 + 头衔（头像下方那一枚）
    klassText: '', honor: null, authorName: '', cupSrc: '',
  },

  onLoad(q) {
    // 支持从服务页/首页带分类进来：?cat=lost
    if (q && q.cat) {
      const i = CATS.findIndex((c) => c.k === q.cat)
      if (i >= 0) this.setData({ catIndex: i, curCat: q.cat })
    }
    if (q && q.new === '1') this.setData({ showForm: true })
  },

  onShow() {
    this.load()
    this.loadMe()
  },

  // 我的班级与头衔：发帖要写进这条记录，所以每次进来都刷新
  async loadMe() {
    const snap = K.snapshot()
    const p = wx.getStorageSync(PROFILE_KEY) || {}
    let title = null
    try {
      const stat = await C.stats()
      title = H.titleOf(stat)
    } catch (e) { title = null }
    const profile = { klassText: snap.curText, honor: title, authorName: p.name || '',
      cupSrc: CUP_SRC[title && title.metal] || '' }
    this.setData(profile)
    // 身份绑到人（openid）：让云端和别人都能按作者认出头衔，不再只靠本机帖子映射
    ID.bindMine(snap.curText, title, p.name)
  },

  async load() {
    const r = await db.feed(db.BOARD, 30)
    const mine = await db.mine(db.BOARD, 30)
    const mineIds = {}
    ;(mine.items || []).forEach((x) => { mineIds[x._id] = 1 })
    // 换台设备时本机 docId 对不上，再用 openid 认一次自己的帖子
    const saved = wxhost.getSaved()
    const myOid = (saved && saved.openid) || ''
    // 食堂评价和意见反馈也落在同一个后端集合，这里按 cat 剔掉，互助墙只留自己的三类
    // 身份固定为「发布当时的快照」：只认记录里写入的 klass/honor/honorMetal，
    // 不再按 openid 实时拉当前身份表去覆盖。否则用户一改头衔/班级，历史帖子全跟着变；
    // 帖子一多就每条都实时切状态，会非常卡甚至卡崩。
    // 旧帖子没有快照字段时，才用本机按帖子 id 存的映射兜底（那也是发布当时的固定值）。
    const whoMap = readWho()
    let items = (r.items || []).filter((it) => it && it.cat !== 'canteen' && it.cat !== 'feedback').map((it) => {
      const c = CATS.find((x) => x.k === it.cat) || CATS[0]
      // 发布时写进记录的快照 = 这条身份的唯一来源，固定不变
      let honorName = it.honor || ''
      let metal = it.honorMetal || ''
      let klass = it.klass || ''
      const w = whoMap[String(it.id)]
      let whoText = ''
      if (w && typeof w === 'object') {
        honorName = honorName || w.honor || ''
        metal = metal || w.metal || ''
        klass = klass || w.klass || ''
      } else if (typeof w === 'string' && w) {
        // 旧帖纯文字拆回牌匾字段；拆出来的结果固化成对象，之后就是固定快照
        const p = parseOldWho(w)
        if (p.ok) {
          honorName = honorName || p.honor
          metal = metal || p.metal
          klass = klass || p.klass
          writeWho(it.id, { klass: klass, honor: honorName, metal: metal })
        } else {
          whoText = w
        }
      }
      if (!whoText) whoText = klass + (klass && honorName ? ' · ' : '') + honorName
      return Object.assign({}, it, {
        catName: c.n,
        catIc: c.ic,
        timeText: fmt(it.ts),
        // 发帖时把班级与头衔写在记录里，换设备、看别人的帖子也能照原样显示
        whoText,
        honorName,
        honorMetal: metal,
        cupSrc: CUP_SRC[metal] || '',
        isMine: !!mineIds[it._id] || (!!myOid && it._openid === myOid),
      })
    })
    // 全量先存一份，切分类/「我的」时就地过滤，不用每次重新拉云端
    this._all = items
    this.applyFilter()
    this.setData({ cloudNote: r.synced ? '' : cloudNoteOf(r.why) })
  },

  // 分类与「我的」只做本地过滤：两个筛选条件互不覆盖，可以叠加
  applyFilter() {
    const all = this._all || []
    const c = this.data.curCat
    const items = all.filter((x) => (c === 'all' || x.cat === c) && (!this.data.mineOnly || x.isMine))
    this.setData({ items })
  },

  pickCat(e) { this.setData({ curCat: e.currentTarget.dataset.k }, () => this.applyFilter()) },
  filterMine() { this.setData({ mineOnly: !this.data.mineOnly }, () => this.applyFilter()) },

  openForm() { this.setData({ showForm: true, tip: '' }) },
  closeForm() { this.setData({ showForm: false }) },
  onCatChange(e) { this.setData({ catIndex: Number(e.detail.value) }) },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onDesc(e) { this.setData({ desc: e.detail.value }) },
  onContact(e) { this.setData({ contact: e.detail.value }) },

  async submit() {
    if (this.data.posting) return
    const t = (this.data.title || '').trim()
    const d = (this.data.desc || '').trim()
    if (t.length < 2) { wx.showToast({ title: '写个标题', icon: 'none' }); return }
    if (d.length < 4) { wx.showToast({ title: '多写两句，方便别人判断', icon: 'none' }); return }

    this.setData({ posting: true })
    const cat = CATS[this.data.catIndex].k
    const honor = this.data.honor
    const klassText = this.data.klassText || ''
    const honorName = honor ? honor.n : ''
    const r = await db.add(db.BOARD, {
      cat,
      title: t,
      desc: d,
      contact: (this.data.contact || '').trim(),
      status: 'open',
      // 作者身份跟着这条记录走：班级《23计科4班》、头衔（金/银/铜）
      klass: klassText,
      honor: honorName,
      honorMetal: honor ? honor.metal : '',
      author: this.data.authorName || '',
    })
    // 云端只回 id，本机映射按 id 存对象（班级+头衔+金属）；本机帖用 no，两条路都能在列表里补回身份
    const metal = honor ? honor.metal : ''
    writeWho(r.id || r.no, { klass: klassText, honor: honorName, metal })
    // 同时绑到人：这张脸以后发的所有帖子都认这个身份
    ID.bindMine(klassText, honor, this.data.authorName)
    this.setData({ posting: false, title: '', desc: '', contact: '', showForm: false, catIndex: 0 })
    wx.showToast({
      title: r.synced ? '已发布' : '已存本机（云端未通）',
      icon: 'none',
      duration: 2200,
    })
    // 云端不通的说明统一由列表上方的 cloudNote 给，不在这里再叠一条
    C.clearCache()
    await this.load()
  },

  copyContact(e) {
    const v = e.currentTarget.dataset.v
    if (!v) return
    wx.setClipboardData({
      data: v,
      success: () => wx.showToast({ title: '联系方式已复制', icon: 'none' }),
    })
  },

  // 每条帖子下面给一句"问问小栖"，把上下文带到对话页
  askXiaoqi(e) {
    const t = e.currentTarget.dataset.t
    getApp().pendingQuestion = '校园互助墙上有人发了「' + t + '」，我该怎么回应比较稳妥？'
    wx.switchTab({ url: '/pages/chat/index' })
  },
})
