// utils/contribute.js —— 反馈与贡献：荣誉的统计口径都在这里
//
// 反馈有三类，对应三个荣誉：
//   fix  纠错   → 纠错贡献者
//   idea 建议   → 意见反馈者
//   docs 资料补充 → 资料补充者
// 反馈先落本机（统计要用），再试着发云端（复用互助墙的 /api/post，cat=feedback），
// 云端不通就明说「本机暂存」，不假装同步成功。
const db = require('./db')
const TT = require('./timetable')

const K_FB = 'fb_notes_v1'
const K_FIRST = 'first_login_v1'

const TYPES = [
  { k: 'fix', n: '纠错', d: '内容错了、页面有问题', ph: '哪一条、哪一页错了，正确的是什么' },
  { k: 'idea', n: '建议', d: '功能或流程还能更好', ph: '哪一步麻烦、你希望怎么改' },
  { k: 'docs', n: '资料补充', d: '课表、材料、缺的信息', ph: '缺什么、你能补上什么（课表可直接去课表页录）' },
]

const readFb = () => {
  try {
    const v = wx.getStorageSync(K_FB)
    return Array.isArray(v) ? v : []
  } catch (e) { return [] }
}

// 「交课表」贡献：只有用户真正导入/录入的课表才算，系统预置示例不算——
// 否则一登录就默认有 5 门示例课，资料补充者/校园共建者会莫名其妙显示「已获得」。
const ttCount = () => {
  const list = TT.read() || []
  return (list.length && !TT.isDemo(list)) ? 1 : 0
}

const writeFb = (list) => {
  try { wx.setStorageSync(K_FB, (list || []).slice(0, 60)) } catch (e) {}
}

// 首次登入时间：荣誉「先驱者」靠它判金/铜，只记第一次
const firstAt = () => {
  let v = 0
  try { v = Number(wx.getStorageSync(K_FIRST)) || 0 } catch (e) { v = 0 }
  if (!v) {
    v = Date.now()
    try { wx.setStorageSync(K_FIRST, v) } catch (e) {}
  }
  return v
}

const typeName = (k) => {
  const t = TYPES.filter((x) => x.k === k)[0]
  return t ? t.n : '反馈'
}

// 提交一条反馈：本机必存，云端尽力
async function submit(input) {
  const k = String((input && input.type) || 'idea')
  const text = String((input && input.text) || '').trim()
  if (!text) return { ok: false, why: '先写两句' }
  const where = String((input && input.where) || '').trim()
  const item = { type: k, typeName: typeName(k), text, where, ts: Date.now() }
  const list = readFb()
  list.unshift(item)
  writeFb(list)
  let synced = false
  let why = ''
  try {
    const r = await db.add(db.BOARD, {
      cat: 'feedback',
      type: k,
      title: '【' + typeName(k) + '】' + (where || text.slice(0, 14)),
      desc: text,
      contact: '',
      status: 'open',
    })
    synced = !!r.synced
    why = r.why || ''
  } catch (e) {
    why = (e && e.message) || '云端不可用'
  }
  return { ok: true, item, synced, why, count: readFb().length }
}

const fbCount = (k) => readFb().filter((x) => x.type === k).length

// 只用本机数据先算一版：首屏不用等云端，跑得慢也不至于空着
function localStats() {
  let board = []
  try {
    const v = wx.getStorageSync(db.LOCAL_KEY[db.BOARD])
    board = Array.isArray(v) ? v : []
  } catch (e) { board = [] }
  return {
    firstAt: firstAt(),
    tt: ttCount(),
    fbDocs: fbCount('docs'),
    fbFix: fbCount('fix'),
    fbIdea: fbCount('idea'),
    posts: board.filter((x) => x && x.cat !== 'feedback' && x.cat !== 'canteen').length,
    fbTotal: readFb().length,
    fbList: readFb().slice(0, 8),
  }
}

// 我的互助发布条数（不含反馈、不含食堂评价，那两类不算"条目"）
let cache = null
let cacheAt = 0
async function stats(force) {
  const now = Date.now()
  if (!force && cache && now - cacheAt < 4000) return cache
  let posts = 0
  try {
    const r = await db.mine(db.BOARD, 50)
    posts = (r.items || []).filter((x) => x && x.cat !== 'feedback' && x.cat !== 'canteen').length
  } catch (e) { posts = 0 }
  cache = {
    firstAt: firstAt(),
    tt: ttCount(),
    fbDocs: fbCount('docs'),
    fbFix: fbCount('fix'),
    fbIdea: fbCount('idea'),
    posts,
    fbTotal: readFb().length,
    fbList: readFb().slice(0, 8),
  }
  cacheAt = now
  return cache
}

const clearCache = () => { cache = null; cacheAt = 0 }

module.exports = { K_FB, K_FIRST, TYPES, readFb, firstAt, submit, stats, localStats, fbCount, typeName, clearCache }
