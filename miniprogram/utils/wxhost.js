// utils/wxhost.js —— 微信云开发登录通道（拿真 openid，不需要 AppID/AppSecret）
//
// 两条腿，按顺序试，谁通用谁：
//   1) 云函数 quickstartFunctions 的 getOpenId（项目自带，本地代码，最稳）
//      → cloud.getWXContext() 直接给 OPENID
//   2) 云托管 express 的 /api/wxlogin（微信注入 X-WX-OPENID 请求头）
//      → 需要服务端有这条路由，没有就快速失败
// 两条都不通时抛错，「我的」页会自动降级到微信头像昵称本机登录。
const ENV = 'prod-d2gc3nmna23946d86'   // 云开发/云托管环境 ID
const SERVICE = 'express-tmya'          // 云托管服务名 → 请求头 X-WX-SERVICE
const FUNC = 'quickstartFunctions'      // 云函数名（cloudfunctions/ 下那个）
const LOGIN_PATH = '/api/wxlogin'
const OPENID_KEY = 'wx_openid_v1'
// 云托管公网域名：真流式要绕开 callContainer（它不支持分块），改用 wx.request enableChunked。
// 该域名需在小程序后台加入 request 合法域名；未加入时 callStream 会失败，llm.js 自动回落非流式。
const PUBLIC_BASE = 'https://express-tmya-349409-13-1534701865.sh.run.tcloudbase.com'

let inited = false

function ensureCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) return false
  if (!inited) {
    try {
      wx.cloud.init({ env: ENV, traceUser: true })
      inited = true
    } catch (e) {
      try {
        wx.cloud.init({ traceUser: true })
        inited = true
      } catch (e2) {
        return false
      }
    }
  }
  return true
}

// 调云函数
function callFunc(name, data) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) { reject(new Error('wx.cloud 不可用')); return }
    wx.cloud.callFunction({
      name,
      data: data || {},
      success: (res) => resolve((res && res.result) || {}),
      fail: (err) => reject(new Error((err && err.errMsg) || '云函数调用失败')),
    })
  })
}

// 调云托管接口
// opts.timeout 可覆盖默认 8 秒：像快递查询这种要串两次上游的接口需要更久
function call(path, data, method, opts) {
  const timeout = (opts && opts.timeout) || 8000
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) { reject(new Error('wx.cloud 不可用')); return }
    wx.cloud.callContainer({
      config: { env: ENV },
      path,
      header: { 'X-WX-SERVICE': SERVICE, 'content-type': 'application/json' },
      method: method || 'POST',
      data: data || {},
      timeout,
      success: (res) => {
        const body = res && res.data
        if (body && body.ok === false) {
          // 把原始响应挂到 error 上，调用方还能拿到 hint / source 之类的附加字段
          const err = new Error(body.error || '云托管返回失败')
          err.body = body
          reject(err)
          return
        }
        resolve(body || {})
      },
      fail: (err) => reject(new Error((err && err.errMsg) || '云托管调用失败')),
    })
  })
}

// 把云开发的错误翻译成"下一步该做什么"，而不是把 errCode 甩给用户
// 真流式调云托管 /api/llm/stream：wx.request enableChunked 逐段收 SSE。
// onDelta(txt) 每收到一个 token 立即回调；返回 task 供调用方 abort（停止生成）。
// 注意：调用方需保证 PUBLIC_BASE 已在小程序后台 request 合法域名里，否则 fail 回调触发。
function callStream(path, data, onDelta, opts) {
  const timeout = (opts && opts.timeout) || 120000
  let task = null
  const p = new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.request) { reject(new Error('wx.request 不可用')); return }
    let buf = ''            // 跨 chunk 的半行缓冲（按 \n 切行）
    let byteTail = null     // 跨 chunk 被截断的多字节 UTF-8 尾巴
    let failed = false
    let settled = false
    task = wx.request({
      url: PUBLIC_BASE + path,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: data || {},
      enableChunked: true,
      responseType: 'text',
      timeout,
      success: (res) => {
        if (settled) return
        // 分块模式 success 只代表连接结束，真正内容在 onChunkReceived
        settled = true
        if (failed) return
        if (res && res.statusCode >= 200 && res.statusCode < 300) resolve()
        else reject(new Error('流式 HTTP ' + (res && res.statusCode)))
      },
      fail: (err) => {
        failed = true
        if (settled) return
        settled = true
        reject(new Error((err && err.errMsg) || '流式请求失败'))
      },
    })
    if (task.onChunkReceived) {
      task.onChunkReceived((chunk) => {
        if (failed) return
        let bytes = chunk && chunk.data
        if (!bytes) return
        // ArrayBuffer → 字符串，处理跨 chunk 的多字节字符（中文首字节落在上一包末尾）
        if (byteTail && byteTail.length) {
          const merged = new Uint8Array(byteTail.length + bytes.byteLength)
          merged.set(byteTail, 0)
          merged.set(new Uint8Array(bytes), byteTail.length)
          byteTail = null
          bytes = merged.buffer
        }
        let text = decodeUtf8(bytes)
        // decodeUtf8 把末尾不完整的字节序列塞回 byteTail
        const d = decodeUtf8.partial(bytes)
        if (d.tail) { byteTail = d.tail; text = d.text }
        buf += text
        let idx
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '')
          buf = buf.slice(idx + 1)
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          if (raw === '[DONE]') continue
          try {
            const j = JSON.parse(raw)
            if (j && j.ok === false) { failed = true; continue }
            if (j && typeof j.delta === 'string' && j.delta) onDelta(j.delta)
          } catch (e) { /* 半行忽略 */ }
        }
      })
    }
  })
  p.task = task
  return p
}

// ArrayBuffer → UTF-8 字符串，支持把末尾不完整的多字节序列留给下一包
function decodeUtf8(bytes) { return decodeUtf8.partial(bytes).text }
decodeUtf8.partial = function (bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let end = u8.length
  let tailLen = 0
  // 从末尾回退，找出被截断的 UTF-8 序列（ leading byte 的连续 1 个数决定长度）
  while (end > 0) {
    const b = u8[end - 1]
    if ((b & 0xC0) === 0x80) { end--; tailLen++; if (tailLen >= 3) break }
    else break
  }
  // 检查回退后的最后一个字节是否是一个不完整序列的 leading byte
  if (tailLen > 0 && end > 0) {
    const lead = u8[end - 1]
    const need = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 0
    if (need && need === tailLen + 1) {
      // 不完整：text 只解到 end-1，tail 留下
      let text = ''
      try { text = decodeURIComponent(escape(String.fromCharCode.apply(null, u8.subarray(0, end - 1)))) }
      catch (e) { text = String.fromCharCode.apply(null, u8.subarray(0, end - 1)) }
      return { text, tail: u8.slice(end - 1) }
    }
  }
  let text = ''
  try { text = decodeURIComponent(escape(String.fromCharCode.apply(null, u8))) }
  catch (e) { text = String.fromCharCode.apply(null, u8) }
  return { text, tail: null }
}

function explain(e) {
  const code = e && e.errCode
  const m = String((e && (e.errMsg || e.message)) || '')
  if (code === 10 || /授权服务商使用云开发/.test(m)) return '小程序已授权服务商使用云开发，无法用自建云开发'
  if (code === -501000 || /FunctionName|function not found|不存在|not found/i.test(m)) return '云函数没部署'
  if (/env|环境/i.test(m)) return '云开发环境 ID 不对'
  if (code === -502005 || /collection not exists/i.test(m)) return '云数据库集合没建'
  if (code === -502003 || /permission|not authorized/i.test(m)) return '云端权限不足'
  if (/timeout|超时/i.test(m)) return '请求超时'
  if (/domain|白名单|url not in/i.test(m)) return '域名白名单没配'
  if (/cloud/i.test(m) && /not|undefined/i.test(m)) return '没有开通云开发'
  return m || '未知错误'
}

async function loginByCloudHost() {
  let openid = ''
  let via = ''
  const reasons = []
  // 1) 云函数（项目里已有 quickstartFunctions，type=getOpenId 直接返回 openid）
  try {
    const r = await callFunc(FUNC, { type: 'getOpenId' })
    if (r && r.openid) { openid = r.openid; via = 'function' }
    else if (r && r.errMsg) reasons.push('云函数：' + r.errMsg)
    else reasons.push('云函数：能调通但没返回 openid')
  } catch (e) {
    console.warn('[wxhost] 云函数登录不可用：', e.message)
    reasons.push('云函数：' + explain(e))
  }
  // 2) 云托管
  if (!openid) {
    try {
      const body = await call(LOGIN_PATH, {})
      if (body && body.openid) { openid = body.openid; via = 'container' }
      else reasons.push('云托管：/api/wxlogin 没有返回 openid')
    } catch (e) {
      console.warn('[wxhost] 云托管登录不可用：', e.message)
      reasons.push('云托管：' + explain(e))
    }
  }
  if (!openid) throw new Error('没有拿到 openid（' + reasons.join('；') + '）')
  const p = { openid, via, token: '', ts: Date.now() }
  try { wx.setStorageSync(OPENID_KEY, p) } catch (e) {}
  return p
}

function getSaved() {
  try { return wx.getStorageSync(OPENID_KEY) || null } catch (e) { return null }
}

function clearSaved() {
  try { wx.removeStorageSync(OPENID_KEY) } catch (e) {}
}

module.exports = { ENV, SERVICE, FUNC, PUBLIC_BASE, call, callFunc, callStream, loginByCloudHost, getSaved, clearSaved, explain }
