// utils/db.js —— 站内业务数据（报修工单 / 校园互助）
//
// 两条通道，先云端后本机：
//   1) 云端：走云托管接口（/api/ticket、/api/post…），数据落阿里云 RDS MySQL，
//      openid 由云托管从请求头注入，前端伪造不了；跨设备可见。
//   2) 本机：云端不可用（没配数据库 / 网络不通）时落 storage，
//      返回里明确 synced:false，页面必须显示「本机暂存 · 未同步云端」，不许假装成功。
const wxhost = require('./wxhost')

const REPAIR = 'repair_tickets'
const BOARD = 'board_posts'
// 食堂评价：复用互助墙的后端集合（/api/post），靠 cat 字段区分，不额外要求后端加路由
const CANTEEN = 'canteen_reviews'
const LOCAL_KEY = {
  [REPAIR]: 'local_repair_v1',
  [BOARD]: 'local_board_v1',
  [CANTEEN]: 'local_canteen_v1',
}

const API = {
  [REPAIR]: { create: '/api/ticket', list: '/api/tickets' },
  [BOARD]: { create: '/api/post', list: '/api/posts' },
  [CANTEEN]: { create: '/api/post', list: '/api/posts' },
}

let cloudReady = false

// 云托管可用性（wx.cloud 存在即可 init；真实连通性由接口返回判定）
function ensureCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) return false
  if (cloudReady) return true
  try {
    wx.cloud.init({ env: wxhost.ENV, traceUser: true })
    cloudReady = true
  } catch (e) {
    try {
      wx.cloud.init({ traceUser: true })
      cloudReady = true
    } catch (e2) {
      return false
    }
  }
  return true
}

// 把云托管/数据库的错误翻译成人话，页面直接显示
function reason(err) {
  const m = String((err && (err.message || err.errMsg)) || err || '')
  if (/not-configured|数据库未配置/.test(m)) return '后端还没接数据库'
  if (/数据库未就绪|db/i.test(m) && /down|未就绪/.test(m)) return '数据库连不上'
  if (/timeout|超时/i.test(m)) return '云端请求超时'
  if (/identity|OPENID|身份/i.test(m)) return '没有微信身份（先登录）'
  return '云端暂时不可用'
}

function readLocal(name) {
  try {
    const v = wx.getStorageSync(LOCAL_KEY[name])
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function writeLocal(name, list) {
  try { wx.setStorageSync(LOCAL_KEY[name], list.slice(0, 60)) } catch (e) {}
}

// 本机侧的 id / 单号
function shortNo(prefix) {
  const t = Date.now().toString(36).toUpperCase().slice(-5)
  const r = Math.random().toString(36).toUpperCase().slice(2, 5)
  return prefix + t + r
}

function saveLocal(name, doc) {
  const no = doc.no || shortNo(name === REPAIR ? 'BX' : 'HZ')
  const local = Object.assign({ _local: true, no, ts: doc.ts || Date.now() }, doc)
  writeLocal(name, [local].concat(readLocal(name)))
  return { ok: true, no, synced: false, doc: local }
}

// 新增一条：先云端，失败落本机
async function add(name, doc) {
  const payload = Object.assign({}, doc)
  if (name === REPAIR) {
    // 服务端字段名对齐
    payload.desc = payload.desc || ''
  } else {
    payload.desc = payload.desc || ''
  }
  if (ensureCloud()) {
    try {
      const body = await wxhost.call(API[name].create, payload, 'POST')
      return { ok: true, no: body.no || '', id: body.id, synced: true, doc }
    } catch (e) {
      const local = saveLocal(name, doc)
      return Object.assign(local, { why: reason(e) })
    }
  }
  const local = saveLocal(name, doc)
  return Object.assign(local, { why: '云开发未初始化' })
}

// 我的记录：云端按 openid 过滤；失败回落本机
async function mine(name, limit) {
  const cap = limit || 30
  const localList = readLocal(name).map((x) => Object.assign({}, x, { _local: true }))
  if (ensureCloud()) {
    try {
      const body = await wxhost.call(API[name].list, {}, 'GET')
      let items = (body.items || []).map((it) => Object.assign({}, it, { _local: false }))
      if (name === BOARD) {
        const saved = wxhost.getSaved()
        const myOid = (saved && saved.openid) || ''
        items = items.filter((it) => !myOid || it.openid === myOid)
      }
      // 云端成功时，本机遗留（历史未同步）也带上，别让用户丢记录
      const merged = items.concat(localList)
      merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return { items: merged.slice(0, cap), synced: localList.length === 0, why: localList.length ? '部分记录未同步' : '' }
    } catch (e) {
      localList.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return { items: localList.slice(0, cap), synced: false, why: reason(e) }
    }
  }
  localList.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return { items: localList.slice(0, cap), synced: false, why: '云开发未初始化' }
}

// 公共列表：互助墙要看所有人发的
async function feed(name, limit) {
  const cap = limit || 30
  if (ensureCloud()) {
    try {
      const body = await wxhost.call(API[name].list, {}, 'GET')
      const items = (body.items || []).map((it) => Object.assign({}, it, { _local: false }))
      return { items: items.slice(0, cap), synced: true }
    } catch (e) {
      const local = readLocal(name)
      return { items: local, synced: false, why: reason(e) }
    }
  }
  return { items: readLocal(name), synced: false, why: '云开发未初始化' }
}

// 自检用：探云托管 + 数据库
// 这里不能走 wxhost.call —— 它把 {ok:false} 当失败抛出，会丢掉 db 字段；
// /api/health 的语义是"HTTP 200 + ok:false 也代表探测成功"，所以直接拿原始响应。
function rawCall(path) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) { reject(new Error('wx.cloud 不可用')); return }
    wx.cloud.callContainer({
      config: { env: wxhost.ENV },
      path,
      header: { 'X-WX-SERVICE': wxhost.SERVICE, 'content-type': 'application/json' },
      method: 'GET',
      data: {},
      timeout: 8000,
      success: (res) => resolve((res && res.data) || {}),
      fail: (err) => reject(new Error((err && err.errMsg) || '云托管调用失败')),
    })
  })
}

async function diagnose() {
  if (!ensureCloud()) return { ok: false, d: 'wx.cloud 不可用（未开通云开发/云托管）' }
  try {
    const body = await rawCall('/api/health')
    if (body && body.ok) return { ok: true, d: '数据库已连通（MySQL）' }
    return { ok: false, d: '后端还没接数据库（' + (body && body.db ? body.db : 'unknown') + '）' }
  } catch (e) {
    return { ok: false, d: reason(e) }
  }
}

module.exports = { REPAIR, BOARD, CANTEEN, LOCAL_KEY, add, mine, feed, diagnose, reason, ensureCloud, shortNo }
