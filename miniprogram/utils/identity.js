// utils/identity.js —— 把「班级 + 头衔 + 奖杯金属色」绑到人（openid）
//
// 为什么要有这层：以前身份是按帖子 id 存本机的（绑帖子），换设备/退出登录就认不出
// 自己发的帖子，别人也看不到作者头衔。现在改成绑人：
//   1) 云端：POST /api/profile 按 openid 存一份；GET /api/profile?openids= 批量取别人身份
//   2) 本机：按 openid 存一份兜底，云端没通时列表仍能显示
// openid 由云托管从请求头注入，前端伪造不了，所以「谁」是可信的。
const wxhost = require('./wxhost')

const LOCAL_KEY = 'identity_by_openid_v1'
const CUP_SRC = {
  gold: '/images/icons/trophy_gold.png',
  silver: '/images/icons/trophy_silver.png',
  bronze: '/images/icons/trophy_bronze.png',
}

const myOpenid = () => {
  try {
    const h = wxhost.getSaved()
    return (h && h.openid) || ''
  } catch (e) { return '' }
}

function readLocal() {
  try {
    const v = wx.getStorageSync(LOCAL_KEY)
    return v && typeof v === 'object' ? v : {}
  } catch (e) { return {} }
}

function writeLocal(map) {
  try { wx.setStorageSync(LOCAL_KEY, map) } catch (e) {}
}

// 归一成存储用的身份对象
function shape(klass, honor, author) {
  return {
    klass: String(klass || ''),
    honor: String((honor && honor.n) || ''),
    metal: String((honor && honor.metal) || ''),
    author: String(author || ''),
  }
}

// 取当前用户身份（从 data 或现算），绑到自己的 openid：云端 + 本机都写
async function bindMine(klass, honor, author) {
  const oid = myOpenid()
  const p = shape(klass, honor, author)
  if (!oid) return { ok: false, bound: false, profile: p }
  const map = readLocal()
  map[oid] = p
  writeLocal(map)
  try {
    await wxhost.call('/api/profile', {
      klass: p.klass, honor: p.honor, honorMetal: p.metal, author: p.author,
    }, 'POST')
    return { ok: true, bound: true, profile: p }
  } catch (e) {
    return { ok: false, bound: true, profile: p } // 本机已存，云端不通也不误导
  }
}

// 按一批 openid 取身份：先本机兜底，再尝试云端覆盖（云端是权威）
async function fetchMany(openids) {
  const ids = (openids || []).filter(Boolean)
  const map = readLocal()
  const out = {}
  ids.forEach((oid) => {
    const p = map[oid]
    if (p) out[oid] = Object.assign({}, p)
  })
  if (!ids.length) return out
  try {
    const body = await wxhost.call('/api/profile?openids=' + encodeURIComponent(ids.join(',')), {}, 'GET')
    const profiles = (body && body.profiles) || {}
    Object.keys(profiles).forEach((oid) => {
      const r = profiles[oid]
      const p = shape(r.klass, { n: r.honor, metal: r.honor_metal }, r.author)
      out[oid] = p
      map[oid] = p
    })
    writeLocal(map)
  } catch (e) {}
  return out
}

// 本机兜底取单人（列表渲染时同步用，不发请求）
function localOf(oid) {
  if (!oid) return null
  const p = readLocal()[oid]
  return p ? Object.assign({}, p) : null
}

function withCup(p) {
  if (!p) return null
  return Object.assign({}, p, { cupSrc: CUP_SRC[p.metal] || '' })
}

module.exports = { CUP_SRC, myOpenid, bindMine, fetchMany, localOf, withCup, shape, LOCAL_KEY }
