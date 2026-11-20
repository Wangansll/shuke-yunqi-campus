// 云栖校园 · 云托管服务
//
// 两个职责：
//   1) 微信登录：把云托管注入的 X-WX-OPENID 还给小程序（已上线验证）
//   2) 站内数据：报修工单 / 互助帖的读写后端
//
// 数据库用阿里云 RDS MySQL。连接信息从环境变量读，读不到再读同目录 db.config.json，
// 都没有就降级：/api/health 报 not-configured，写接口返回 503，前端会自动回落到本机存储。
// —— 不配置也不崩，配置上就自动建表。
const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
// 语音转写要收 base64 音频（短录音约 1-3MB），上限放到 6mb；其余接口仍各自校验参数长度
app.use(express.json({ limit: '6mb' }))
// 外卖橱窗的菜品图：静态文件，小程序端 <image> 直接按 URL 加载，不进小程序包
app.use('/img', express.static(path.join(__dirname, 'img'), { maxAge: '7d' }))

// ---------- 百科检索：整站语料 + BM25（纯内存，启动时建索引） ----------
const CORPUS = (function loadCorpus() {
  try {
    const p = path.join(__dirname, 'corpus.json')
    if (!fs.existsSync(p)) return { items: [], n: 0, built: '' }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    return { items: Array.isArray(j.items) ? j.items : [], n: j.n || 0, built: j.built || '' }
  } catch (e) {
    console.warn('[kb] corpus.json 读取失败:', e.message)
    return { items: [], n: 0, built: '' }
  }
})()

const KB = (function buildIndex() {
  const docs = []
  const df = {}
  const STOP = new Set(['什么', '怎么', '如何', '可以', '是否', '请问', '我们', '你们', '他们', '这个', '那个',
    '一个', '一下', '有没有', '没有', '是不', '不是', '的话', '我想', '想要', '能不', '不能', '哪些', '哪个',
    '多少', '为什', '推荐', '建议', '觉得', '认为', '一般', '需要', '应该', '直接', '方便', '在哪', '么去'])
  function tokens(text) {
    const out = []
    const s = String(text || '').toLowerCase()
    const latin = s.match(/[a-z][a-z0-9+#._-]{1,}|\d+(?:\.\d+)?/g)
    if (latin) latin.forEach((w) => out.push('#' + w))
    const runs = s.match(/[\u4e00-\u9fa5]+/g)
    if (runs) {
      runs.forEach((run) => {
        for (let i = 0; i + 1 < run.length; i++) {
          const bg = run.slice(i, i + 2)
          if (!STOP.has(bg)) out.push(bg)
        }
      })
    }
    return out
  }
  CORPUS.items.forEach((it, idx) => {
    const tf = {}
    tokens(it.t).forEach((w) => { tf[w] = (tf[w] || 0) + 2.5 })
    tokens(it.c).forEach((w) => { tf[w] = (tf[w] || 0) + 1.6 })
    tokens(it.x).forEach((w) => { tf[w] = (tf[w] || 0) + 1 })
    let len = 0
    Object.keys(tf).forEach((w) => { len += tf[w] })
    Object.keys(tf).forEach((w) => { df[w] = (df[w] || 0) + 1 })
    docs.push({ i: idx, tf, len: Math.max(1, len) })
  })
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length)
  return { docs, df, avg, N: docs.length, tokens }
})()

function kbSearch(q, n) {
  if (!KB.N) return []
  const toks = KB.tokens(q)
  if (!toks.length) return []
  const k1 = 1.2
  const b = 0.72
  const scored = []
  KB.docs.forEach((d) => {
    let s = 0
    toks.forEach((w) => {
      const f = d.tf[w]
      if (!f) return
      const df = KB.df[w] || 1
      const idf = Math.log(1 + (KB.N - df + 0.5) / (df + 0.5))
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / KB.avg))))
    })
    if (s > 0) scored.push([s, d.i])
  })
  scored.sort((a, b2) => b2[0] - a[0])
  return scored.slice(0, Math.max(1, n || 6)).map(([score, i]) => {
    const it = CORPUS.items[i]
    let snippet = String(it.x || '').slice(0, 180)
    const pos = String(it.x || '').indexOf(toks[0])
    if (pos > 60) snippet = '…' + String(it.x).slice(pos - 40, pos + 140)
    return {
      t: it.t, u: it.u, d: it.d, c: it.c,
      s: Math.round(score * 100) / 100,
      x: snippet,
    }
  })
}

// ---------- 配置 ----------
// 优先级：环境变量 > dbconfig.js > db.config.json
function readConfig() {
  const env = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'yunqi',
  }
  if (env.host && env.user) return env
  // dbconfig.js 一定在代码包里（打包会漏掉 *.config.json）
  try {
    const local = require('./dbconfig')
    if (local && local.host) return Object.assign({ port: 3306, database: 'yunqi' }, local)
  } catch (e) {
    // 没有这个文件是正常情况，继续往下找
  }
  try {
    const p = path.join(__dirname, 'db.config.json')
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (j.host) return Object.assign({ port: 3306, database: 'yunqi' }, j)
    }
  } catch (e) {
    console.warn('[cfg] 读取 db.config.json 失败:', e.message)
  }
  return null
}

const CFG = readConfig()
let pool = null

function getMysql() {
  // 延迟 require：没装依赖时也不至于整个服务起不来
  const mysql = require('mysql2/promise')
  return mysql
}

async function ensureDb() {
  if (!CFG) return null
  if (pool) return pool
  const mysql = getMysql()
  pool = mysql.createPool({
    host: CFG.host,
    port: CFG.port,
    user: CFG.user,
    password: CFG.password,
    database: CFG.database,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000,
    charset: 'utf8mb4',
  })
  await pool.query(`CREATE TABLE IF NOT EXISTS repair_tickets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL,
    no VARCHAR(16) NOT NULL,
    zone VARCHAR(16) NULL,
    room VARCHAR(32) NULL,
    type VARCHAR(64) NULL,
    descr TEXT NULL,
    urgent TINYINT DEFAULT 0,
    status VARCHAR(16) DEFAULT 'pending',
    ts BIGINT NULL,
    KEY idx_openid (openid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS board_posts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL,
    cat VARCHAR(16) NULL,
    title VARCHAR(64) NULL,
    descr TEXT NULL,
    contact VARCHAR(64) NULL,
    klass VARCHAR(48) NULL,
    honor VARCHAR(32) NULL,
    honor_metal VARCHAR(16) NULL,
    author VARCHAR(48) NULL,
    ts BIGINT NULL,
    KEY idx_cat (cat),
    KEY idx_openid (openid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // 旧表补列：已存在的 board_posts 没有身份字段，逐列加，忽略"已存在"错误
  for (const [col, ddl] of [
    ['klass', "ALTER TABLE board_posts ADD COLUMN klass VARCHAR(48) NULL"],
    ['honor', "ALTER TABLE board_posts ADD COLUMN honor VARCHAR(32) NULL"],
    ['honor_metal', "ALTER TABLE board_posts ADD COLUMN honor_metal VARCHAR(16) NULL"],
    ['author', "ALTER TABLE board_posts ADD COLUMN author VARCHAR(48) NULL"],
  ]) {
    try { await pool.query(ddl) } catch (e) { if (!/Duplicate column/i.test(e && e.message)) throw e }
  }
  // 按人（openid）存一份身份：班级、头衔、金属色、昵称、头像。帖子只是快照，人才是主。
  await pool.query(`CREATE TABLE IF NOT EXISTS user_profile (
    openid VARCHAR(64) NOT NULL PRIMARY KEY,
    klass VARCHAR(48) NULL,
    honor VARCHAR(32) NULL,
    honor_metal VARCHAR(16) NULL,
    author VARCHAR(48) NULL,
    nickname VARCHAR(48) NULL,
    avatar MEDIUMTEXT NULL,
    ts BIGINT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // 旧表补列：头像昵称是后加的，逐列 ALTER，忽略"已存在"错误
  for (const [col, ddl] of [
    ['nickname', "ALTER TABLE user_profile ADD COLUMN nickname VARCHAR(48) NULL"],
    ['avatar', "ALTER TABLE user_profile ADD COLUMN avatar MEDIUMTEXT NULL"],
  ]) {
    try { await pool.query(ddl) } catch (e) { if (!/Duplicate column/i.test(e && e.message)) throw e }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS canteen_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL,
    no VARCHAR(16) NOT NULL,
    canteen VARCHAR(32) NULL,
    stall VARCHAR(64) NULL,
    note VARCHAR(200) NULL,
    meal VARCHAR(16) NULL,
    status VARCHAR(16) DEFAULT 'new',
    ts BIGINT NULL,
    done_ts BIGINT NULL,
    KEY idx_openid (openid),
    KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.log('[db] ready ' + CFG.host + ':' + CFG.port + '/' + CFG.database)
  return pool
}

// ---------- 工具 ----------
function openidOf(req) {
  // 云托管注入，前端无法伪造
  return String(req.headers['x-wx-openid'] || '').trim()
}

function shortNo(prefix) {
  const t = Date.now().toString(36).toUpperCase().slice(-5)
  const r = Math.random().toString(36).toUpperCase().slice(2, 5)
  return prefix + t + r
}

function dbDown(res, err) {
  console.error('[db]', err && (err.code || err.message))
  res.status(503).json({ ok: false, error: '数据库未就绪', detail: String((err && err.message) || '').slice(0, 160) })
}

// ---------- 1. 微信登录 ----------
app.post('/api/wxlogin', (req, res) => {
  const openid = openidOf(req)
  const appid = req.headers['x-wx-appid'] || ''
  const unionid = req.headers['x-wx-unionid'] || ''
  if (!openid) {
    res.json({ ok: false, error: '没有收到 X-WX-OPENID：需要在微信小程序内通过 wx.cloud.callContainer 调用' })
    return
  }
  res.json({ ok: true, openid, appid, unionid })
})

app.get('/api/wxlogin', (req, res) => res.json({ ok: false, error: '请用 POST 调用' }))

// ---------- 2. 健康检查 ----------
app.get('/api/health', async (req, res) => {
  if (!CFG) { res.json({ ok: false, db: 'not-configured' }); return }
  try {
    const p = await ensureDb()
    const [rows] = await p.query('SELECT 1 AS x')
    res.json({ ok: true, db: 'up', ping: rows[0].x })
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: String(e.message).slice(0, 160) })
  }
})

// ---------- 3. 报修工单 ----------
app.post('/api/ticket', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份（X-WX-OPENID 缺失）' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }

  const b = req.body || {}
  const no = shortNo('BX')
  const ts = Date.now()
  try {
    await p.query(
      'INSERT INTO repair_tickets (openid, no, zone, room, type, descr, urgent, status, ts) VALUES (?,?,?,?,?,?,?,?,?)',
      [openid, no, b.zone || '', b.room || '', b.type || '', b.desc || '', b.urgent ? 1 : 0, 'pending', ts]
    )
    res.json({ ok: true, no, ts })
  } catch (e) { dbDown(res, e) }
})

app.get('/api/tickets', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  try {
    const [rows] = await p.query(
      'SELECT no, zone, room, type, descr AS `desc`, urgent, status, ts FROM repair_tickets WHERE openid = ? ORDER BY ts DESC LIMIT 50',
      [openid]
    )
    res.json({ ok: true, items: rows })
  } catch (e) { dbDown(res, e) }
})

// ---------- 4. 校园互助 ----------
app.post('/api/post', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }

  const b = req.body || {}
  if (!b.title) { res.status(400).json({ ok: false, error: '标题必填' }); return }
  const ts = Date.now()
  try {
    const [r] = await p.query(
      'INSERT INTO board_posts (openid, cat, title, descr, contact, klass, honor, honor_metal, author, ts) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [openid, b.cat || 'help', String(b.title).slice(0, 60), String(b.desc || '').slice(0, 2000),
       String(b.contact || '').slice(0, 60), String(b.klass || '').slice(0, 48),
       String(b.honor || '').slice(0, 32), String(b.honorMetal || '').slice(0, 16),
       String(b.author || '').slice(0, 48), ts]
    )
    res.json({ ok: true, id: r.insertId, ts })
  } catch (e) { dbDown(res, e) }
})

app.get('/api/posts', async (req, res) => {
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  const cat = String(req.query.cat || '')
  try {
    const cols = 'id, cat, title, descr AS `desc`, contact, klass, honor, honor_metal, author, ts, openid'
    const sql = cat
      ? `SELECT ${cols} FROM board_posts WHERE cat = ? ORDER BY ts DESC LIMIT 50`
      : `SELECT ${cols} FROM board_posts ORDER BY ts DESC LIMIT 50`
    const [rows] = await p.query(sql, cat ? [cat] : [])
    res.json({ ok: true, items: rows })
  } catch (e) { dbDown(res, e) }
})

// 按人存身份：班级 + 头衔 + 奖杯金属色 + 昵称 + 头像，openid 主键，跨设备、跨帖子都认这一个人
// 微信 2022 起收回静默授权，头像昵称只能 chooseAvatar + nickname 让用户点选，
// 所以这里把结果绑到 openid 存云端——否则换设备就丢，看起来像"没绑定"。
const cleanAvatar = (v) => {
  const s = String(v || '')
  // 只接受 data:image/ 的 base64，挡掉任意字符串
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 900000 ? s : ''
}
app.post('/api/profile', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  const b = req.body || {}
  const profile = {
    klass: String(b.klass || '').slice(0, 48),
    honor: String(b.honor || '').slice(0, 32),
    honor_metal: String(b.honorMetal || '').slice(0, 16),
    author: String(b.author || '').slice(0, 48),
    nickname: String(b.nickname || '').slice(0, 48),
    avatar: cleanAvatar(b.avatar),
    ts: Date.now(),
  }
  try {
    // 头像/昵称没带就不覆盖旧值：授权补全和身份绑定分两步走，别互相抹掉
    await p.query(
      `INSERT INTO user_profile (openid, klass, honor, honor_metal, author, nickname, avatar, ts) VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         klass=IF(VALUES(klass)='',klass,VALUES(klass)),
         honor=IF(VALUES(honor)='',honor,VALUES(honor)),
         honor_metal=IF(VALUES(honor_metal)='',honor_metal,VALUES(honor_metal)),
         author=IF(VALUES(author)='',author,VALUES(author)),
         nickname=IF(VALUES(nickname)='',nickname,VALUES(nickname)),
         avatar=IF(VALUES(avatar)='',avatar,VALUES(avatar)),
         ts=VALUES(ts)`,
      [openid, profile.klass, profile.honor, profile.honor_metal, profile.author, profile.nickname, profile.avatar, profile.ts]
    )
    res.json({ ok: true })
  } catch (e) { dbDown(res, e) }
})

// 取身份：传 openids 数组批量取（看别人帖子时按作者认人），不传则取自己
app.get('/api/profile', async (req, res) => {
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  try {
    let rows
    const raw = String(req.query.openids || '')
    const ids = raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50)
    const cols = 'openid, klass, honor, honor_metal, author, nickname, avatar'
    if (ids.length) {
      const ph = ids.map(() => '?').join(',')
      ;[rows] = await p.query(`SELECT ${cols} FROM user_profile WHERE openid IN (${ph})`, ids)
    } else {
      const openid = openidOf(req)
      if (!openid) { res.json({ ok: true, profiles: {} }); return }
      ;[rows] = await p.query(`SELECT ${cols} FROM user_profile WHERE openid = ?`, [openid])
    }
    const profiles = {}
    rows.forEach((r) => { profiles[r.openid] = r })
    res.json({ ok: true, profiles })
  } catch (e) { dbDown(res, e) }
})

// ---------- 5. 快递查询（公开查询通道，服务端带 Referer） ----------
// 为什么要放服务端：小程序端不能设 Referer，也过不了对方的来源校验；
// 而且这条通道随时可能变，放在容器里改一行就能换，不用发版。
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const req = https.get(url, { headers: headers || {}, timeout: 10000 }, (resp) => {
      let buf = ''
      resp.setEncoding('utf8')
      resp.on('data', (d) => { buf += d })
      resp.on('end', () => resolve({ status: resp.statusCode, body: buf }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}

function httpsPostForm(url, form, headers) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const u = new URL(url)
    const body = new URLSearchParams(form).toString()
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      timeout: 12000,
      headers: Object.assign({
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      }, headers || {}),
    }, (resp) => {
      let buf = ''
      resp.setEncoding('utf8')
      resp.on('data', (d) => { buf += d })
      resp.on('end', () => resolve({ status: resp.statusCode, body: buf }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// 通用：把一段 Buffer 以 POST 发出去（ASR 上传音频用）
function httpsPostBuf(url, buf, headers) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      timeout: 30000,
      headers: Object.assign({ 'Content-Length': buf.length }, headers || {}),
    }, (resp) => {
      const chunks = []
      resp.on('data', (d) => chunks.push(d))
      resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

// 流式：把 POST 请求发出去，上游每段 data 立刻回调 onChunk（DeepSeek SSE 逐 token 用）。
// 返回 Promise，在响应结束时 resolve；中途上游出错则 reject。
function httpsPostStream(url, buf, headers, onChunk) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const u = new URL(url)
    let settled = false
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      timeout: 120000,
      headers: Object.assign({ 'Content-Length': buf.length }, headers || {}),
    }, (resp) => {
      if (resp.statusCode !== 200) {
        const chunks = []
        resp.on('data', (d) => chunks.push(d))
        resp.on('end', () => {
          if (settled) return
          settled = true
          const e = new Error('upstream ' + resp.statusCode)
          e.status = resp.statusCode
          e.body = Buffer.concat(chunks).toString('utf8')
          reject(e)
        })
        return
      }
      // 上游 SSE：收到一段就解析一段里的 data: 行，只把 delta.content 吐给前端
      let carry = ''
      resp.setEncoding('utf8')
      resp.on('data', (piece) => {
        carry += piece
        let idx
        while ((idx = carry.indexOf('\n')) >= 0) {
          const line = carry.slice(0, idx).replace(/\r$/, '')
          carry = carry.slice(idx + 1)
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const j = JSON.parse(raw)
            const delta = j && j.choices && j.choices[0] && j.choices[0].delta
            const txt = delta && delta.content
            if (typeof txt === 'string' && txt) onChunk(txt)
          } catch (e) { /* 半包 / 非 JSON 忽略 */ }
        }
      })
      resp.on('end', () => {
        if (settled) return
        settled = true
        resolve()
      })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', (e) => { if (!settled) { settled = true; reject(e) } })
    req.write(buf)
    req.end()
  })
}

// 语音转写上游配置：接现有云托管转发到可配置的 ASR 服务。
//   ASR_URL   —— 转写接口地址
//   ASR_KEY   —— Bearer 密钥（可选， OpenAI 兼容服务需要）
//   ASR_MODEL —— 模型名，默认 whisper-1
//   ASR_STYLE —— openai（multipart，默认）| json（直接发 {audio,format}）
// 没配 ASR_URL 时 /api/asr 明确降级，提示改用文字作答，绝不假装成功。
const ASR_CFG = {
  url: process.env.ASR_URL || '',
  key: process.env.ASR_KEY || '',
  model: process.env.ASR_MODEL || 'whisper-1',
  style: process.env.ASR_STYLE || 'openai',
}

// 快递100 正式接口（需 key）：POST poll.kuaidi100.com/poll/query.do
// sign = MD5(param + key + customer).toUpperCase()
// 凭据优先级：环境变量 > kdconfig.js
const KD = (function () {
  const env = {
    customer: process.env.KUAIDI100_CUSTOMER || '',
    key: process.env.KUAIDI100_KEY || '',
  }
  if (env.customer && env.key) return env
  try {
    const local = require('./kdconfig')
    if (local && local.customer && local.key) return local
  } catch (e) { /* 没有配置文件是正常的 */ }
  return { customer: '', key: '' }
})()
const KD_KEY = KD.key
const KD_CUSTOMER = KD.customer

async function queryByKey(com, no, phone) {
  if (!KD_KEY || !KD_CUSTOMER) return null
  const crypto = require('crypto')
  const param = JSON.stringify({ com, num: no, phone: phone || '', resultv2: '1' })
  const sign = crypto.createHash('md5').update(param + KD_KEY + KD_CUSTOMER).digest('hex').toUpperCase()
  const r = await httpsPostForm('https://poll.kuaidi100.com/poll/query.do', {
    customer: KD_CUSTOMER, sign, param,
  }, { 'User-Agent': 'yunqi-campus/1.0' })
  const j = JSON.parse(r.body)
  if (j.status !== '200' || !Array.isArray(j.data)) {
    return { ok: false, error: j.message || '查询失败', com }
  }
  const list = j.data.map((x) => ({ context: x.context || x.ftim, time: x.ftime || x.time }))
  return { ok: true, com, comName: j.com || '', ischeck: j.state === '3', list }
}

app.get('/api/express', async (req, res) => {
  const no = String(req.query.no || '').replace(/[^0-9A-Za-z]/g, '')
  let com = String(req.query.com || '')
  // 隐私面单：顺丰/京东等要求收件人手机号后四位
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(0, 4)
  if (no.length < 6) { res.status(400).json({ ok: false, error: '单号太短' }); return }

  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Referer': 'https://www.kuaidi100.com/',
    'Accept': 'application/json, text/plain, */*',
  }

  try {
    // 没指定快递公司就先自动识别
    if (!com) {
      const r0 = await httpsGet('https://www.kuaidi100.com/autonumber/autoComNum?text=' + encodeURIComponent(no), H)
      const j0 = JSON.parse(r0.body)
      com = (j0.auto && j0.auto[0] && j0.auto[0].comCode) || ''
      if (!com) { res.json({ ok: false, error: '识别不出快递公司，请手动选择' }); return }
    }

    // 先走正式接口（配了 key 才有），再退公开通道
    const byKey = await queryByKey(com, no, phone)
    if (byKey && byKey.ok) {
      res.json(Object.assign({ source: 'kuaidi100-api' }, byKey))
      return
    }

    const url = 'https://www.kuaidi100.com/query?type=' + encodeURIComponent(com)
      + '&postid=' + encodeURIComponent(no) + '&temp=' + Math.random()
      + '&phone=' + encodeURIComponent(phone)
    const r1 = await httpsGet(url, H)
    const j1 = JSON.parse(r1.body)

    if (j1.status !== '200' || !Array.isArray(j1.data)) {
      res.json({ ok: false, error: j1.message || '查不到这条单号', com })
      return
    }
    const list = j1.data
      .filter((x) => x && x.context && x.context !== '查无结果')
      .map((x) => ({ context: x.context, time: x.time }))
    if (!list.length) {
      res.json({
        ok: false,
        com,
        error: '查不到这条单号的轨迹',
        // 公开通道已被上游收紧，没配 key 时如实说明，别让用户以为单号是假的
        hint: KD_KEY ? '' : '免费公开通道当前受限，配好快递100 key 后即可查询',
        source: 'public',
      })
      return
    }
    res.json({ ok: true, com, comName: j1.com || '', ischeck: j1.ischeck === '1', list, source: 'public' })
  } catch (e) {
    console.error('[express]', e && e.message)
    res.status(503).json({ ok: false, error: '快递查询通道暂时不可用', detail: String((e && e.message) || '').slice(0, 120) })
  }
})

// ---------- 6. 食堂点餐（站内闭环：下单 → 取餐号 → 商户端出餐） ----------
// 不编价格：食堂窗口现场定价/刷卡，这里只收“哪个档口 + 备注 + 餐段”，给取餐号。
// 商户口令：只从环境变量读取，不设硬编码默认值（避免口令随源码泄露）
const MERCHANT_KEY = process.env.MERCHANT_KEY || ''

function keyOk(req) {
  if (!MERCHANT_KEY) return false   // 未配置口令时一律拒绝，不放开
  const k = String(req.query.key || (req.body && req.body.key) || '')
  return k && k === MERCHANT_KEY
}

app.post('/api/order', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份（先登录）' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }

  const b = req.body || {}
  if (!b.stall) { res.status(400).json({ ok: false, error: '先选一个档口' }); return }
  const no = shortNo('Q')
  const ts = Date.now()
  try {
    await p.query(
      'INSERT INTO canteen_orders (openid, no, canteen, stall, note, meal, status, ts) VALUES (?,?,?,?,?,?,?,?)',
      [openid, no, b.canteen || '', b.stall, String(b.note || '').slice(0, 180), b.meal || '午餐', 'new', ts]
    )
    res.json({ ok: true, no, ts })
  } catch (e) { dbDown(res, e) }
})

app.get('/api/orders', async (req, res) => {
  const openid = openidOf(req)
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  try {
    const [rows] = await p.query(
      'SELECT no, canteen, stall, note, meal, status, ts, done_ts FROM canteen_orders WHERE openid = ? ORDER BY ts DESC LIMIT 20',
      [openid]
    )
    res.json({ ok: true, items: rows })
  } catch (e) { dbDown(res, e) }
})

// 商户端：食堂窗口用，只看未完成的单
app.get('/api/merchant/orders', async (req, res) => {
  if (!keyOk(req)) { res.status(403).json({ ok: false, error: '商户口令不对' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  try {
    const [rows] = await p.query(
      "SELECT id, no, canteen, stall, note, meal, status, ts FROM canteen_orders WHERE status IN ('new','ready') ORDER BY ts ASC LIMIT 50"
    )
    res.json({ ok: true, items: rows })
  } catch (e) { dbDown(res, e) }
})

app.post('/api/merchant/status', async (req, res) => {
  if (!keyOk(req)) { res.status(403).json({ ok: false, error: '商户口令不对' }); return }
  let p
  try { p = await ensureDb() } catch (e) { dbDown(res, e); return }
  if (!p) { res.status(503).json({ ok: false, error: '数据库未配置' }); return }
  const b = req.body || {}
  const status = String(b.status || '')
  if (!b.id || ['ready', 'done'].indexOf(status) < 0) { res.status(400).json({ ok: false, error: '参数不对' }); return }
  try {
    await p.query('UPDATE canteen_orders SET status = ?, done_ts = ? WHERE id = ?', [status, status === 'done' ? Date.now() : null, b.id])
    res.json({ ok: true })
  } catch (e) { dbDown(res, e) }
})

// ---------- 7. 百科检索（整站语料） ----------
app.get('/api/kb/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 60)
  const n = Math.min(12, Math.max(1, Number(req.query.n) || 6))
  if (!q.trim()) { res.status(400).json({ ok: false, error: '缺少 q' }); return }
  const items = kbSearch(q, n)
  res.json({ ok: true, q, total: CORPUS.n, built: CORPUS.built, items })
})

app.get('/api/kb/stats', (req, res) => {
  res.json({ ok: true, total: CORPUS.n, built: CORPUS.built, indexed: KB.N })
})

// ---------- 8. 语音转写：小程序录音 base64 → 云托管 → 可配置 ASR 上游 ----------
// 只做音频转文字，不当聊天模型用；没配 ASR_URL 就明确返回未配置，前端提示改文字作答。
app.post('/api/asr', async (req, res) => {
  const openid = req.get('X-WX-OPENID')
  if (!openid) { res.status(401).json({ ok: false, error: '没有身份（X-WX-OPENID 缺失）' }); return }
  if (!ASR_CFG.url) {
    res.status(503).json({ ok: false, error: '语音识别未配置', hint: '请改用文字作答' })
    return
  }
  const b = req.body || {}
  const audio = String(b.audio || '')
  const fmt = ['mp3', 'wav', 'm4a', 'aac', 'webm'].indexOf(String(b.format || '').toLowerCase()) >= 0
    ? String(b.format).toLowerCase() : 'mp3'
  // 音频 base64：防呆——空的、太短的（<1KB）、离谱大的（>4MB）都挡掉
  if (audio.length < 1024 || audio.length > 4 * 1024 * 1024) {
    res.status(400).json({ ok: false, error: '音频数据不合法', hint: 'AudioTooLargeOrEmpty' })
    return
  }
  let buf
  try { buf = Buffer.from(audio, 'base64') } catch (e) {
    res.status(400).json({ ok: false, error: '音频解码失败' }); return
  }
  try {
    let text = ''
    if (ASR_CFG.style === 'json') {
      // JSON 直传：上游收 {audio, format}，回 {text} 或 {result}
      const r = await httpsPostBuf(ASR_CFG.url, Buffer.from(JSON.stringify({ audio, format: fmt }), 'utf8'), Object.assign(
        { 'Content-Type': 'application/json' },
        ASR_CFG.key ? { Authorization: 'Bearer ' + ASR_CFG.key } : {}
      ))
      if (r.status < 200 || r.status >= 300) throw new Error('asr-status-' + r.status)
      const j = JSON.parse(r.body)
      text = String((j && (j.text || j.result || j.transcript)) || '')
    } else {
      // OpenAI 兼容 audio/transcriptions：multipart/form-data，字段名 file
      const boundary = '----yunqiAsr' + Date.now().toString(36)
      const head = Buffer.from(
        '--' + boundary + '\r\n'
        + 'Content-Disposition: form-data; name="file"; filename="audio.' + fmt + '"\r\n'
        + 'Content-Type: audio/' + (fmt === 'm4a' ? 'mp4' : fmt) + '\r\n\r\n'
      )
      const modelPart = Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="model"\r\n\r\n' + ASR_CFG.model + '\r\n')
      const tail = Buffer.from('--' + boundary + '--\r\n')
      const multipart = Buffer.concat([head, buf, modelPart, tail])
      const r = await httpsPostBuf(ASR_CFG.url, multipart, Object.assign(
        { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
        ASR_CFG.key ? { Authorization: 'Bearer ' + ASR_CFG.key } : {}
      ))
      if (r.status < 200 || r.status >= 300) throw new Error('asr-status-' + r.status)
      const j = JSON.parse(r.body)
      text = String((j && j.text) || '')
    }
    text = text.replace(/\s+/g, ' ').trim().slice(0, 2000)
    if (!text) { res.json({ ok: false, error: '没听出内容', hint: '再说一次或改文字作答' }); return }
    res.json({ ok: true, text })
  } catch (e) {
    console.error('[asr]', e && e.message)
    res.status(502).json({ ok: false, error: '转写服务暂时不可用', hint: '请改用文字作答' })
  }
})

// ---------- 8.5 统一 LLM 代理（DeepSeek，密钥只在服务端）----------
// 小程序的 AI 能力（聊天/面试/课表 OCR/东盟问答）以前走 WorkBuddy 免密钥 SDK，
// 现统一改走这里：key 只存在云托管，前端永远拿不到，杜绝反编译盗刷。
//   优先级：环境变量 DS_KEY/DS_BASE/DS_MODEL > 同目录 llm.config.js
//   接口 OpenAI 兼容：POST https://api.deepseek.com/chat/completions
//   非流式返回完整文本，前端自行分段吐字保留打字机效果（callContainer 流式不稳）。
const DS = (function () {
  const env = { key: process.env.DS_KEY || '', base: process.env.DS_BASE || '', model: process.env.DS_MODEL || '' }
  let local = {}
  try { local = require('./llm.config') } catch (e) { /* 没配置文件也正常，可用环境变量 */ }
  return {
    key: env.key || local.key || '',
    base: (env.base || local.base || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: env.model || local.model || 'deepseek-flash',
  }
})()
const DS_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', disabled: false },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', disabled: false },
]

// GET /api/llm/models —— 前端模型选择用（不返回任何密钥）
app.get('/api/llm/models', (req, res) => {
  res.json({ ok: true, models: DS_MODELS })
})

// POST /api/llm —— { model?, messages, temperature?, max_tokens? } → { ok, content, model }
app.post('/api/llm', async (req, res) => {
  if (!DS.key) { res.status(503).json({ ok: false, error: 'AI 服务未配置密钥' }); return }
  const b = req.body || {}
  if (!Array.isArray(b.messages) || !b.messages.length) {
    res.status(400).json({ ok: false, error: '缺少 messages' }); return
  }
  const model = DS_MODELS.some((m) => m.id === b.model) ? b.model : DS.model
  // 只透传必要字段，防止前端塞奇怪参数；消息体限 1MB（课表 OCR 图片 base64 够用）
  const messages = b.messages.slice(0, 40).map((m) => ({
    role: ['system', 'user', 'assistant'].indexOf(m && m.role) >= 0 ? m.role : 'user',
    content: typeof (m && m.content) === 'string' ? m.content.slice(0, 1000000) : '',
  }))
  const payload = {
    model,
    messages,
    stream: false,
    temperature: typeof b.temperature === 'number' ? Math.max(0, Math.min(2, b.temperature)) : 0.7,
  }
  try {
    const r = await httpsPostBuf(DS.base + '/chat/completions', Buffer.from(JSON.stringify(payload), 'utf8'), {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DS.key,
    })
    if (r.status !== 200) {
      console.error('[llm] upstream', r.status, r.body.slice(0, 300))
      res.status(502).json({ ok: false, error: 'AI 服务暂时不可用', status: r.status }); return
    }
    const j = JSON.parse(r.body)
    const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
    res.json({ ok: true, content: String(content), model: j.model || model })
  } catch (e) {
    console.error('[llm]', e && e.message)
    res.status(502).json({ ok: false, error: 'AI 服务暂时不可用' })
  }
})

// POST /api/llm/stream —— 真流式：SSE 逐 token 吐给小程序（wx.request enableChunked）
// 每条消息形如 data:{"ok":true,"delta":"..."}\n\n，结束发 data:[DONE]\n\n。
// 密钥只在服务端；前端 enableChunked 走公网域名，失败会回落到非流式 /api/llm。
app.post('/api/llm/stream', async (req, res) => {
  if (!DS.key) { res.status(503).json({ ok: false, error: 'AI 服务未配置密钥' }); return }
  const b = req.body || {}
  if (!Array.isArray(b.messages) || !b.messages.length) {
    res.status(400).json({ ok: false, error: '缺少 messages' }); return
  }
  const model = DS_MODELS.some((m) => m.id === b.model) ? b.model : DS.model
  const messages = b.messages.slice(0, 40).map((m) => ({
    role: ['system', 'user', 'assistant'].indexOf(m && m.role) >= 0 ? m.role : 'user',
    content: typeof (m && m.content) === 'string' ? m.content.slice(0, 1000000) : '',
  }))
  const payload = {
    model,
    messages,
    stream: true,
    temperature: typeof b.temperature === 'number' ? Math.max(0, Math.min(2, b.temperature)) : 0.7,
  }
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // 关掉 nginx 缓冲，保证逐段到达
  res.flushHeaders && res.flushHeaders()
  const send = (obj) => { try { res.write('data:' + JSON.stringify(obj) + '\n\n') } catch (e) {} }
  try {
    await httpsPostStream(DS.base + '/chat/completions', Buffer.from(JSON.stringify(payload), 'utf8'), {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DS.key,
    }, (txt) => send({ ok: true, delta: txt, model }))
    send({ ok: true, delta: '', done: true })
    send({ done: true, signal: '[DONE]' })
  } catch (e) {
    console.error('[llm/stream]', e && (e.body || e.message))
    send({ ok: false, error: 'AI 服务暂时不可用' })
  }
  try { res.end() } catch (e) {}
})

// ---------- 9. 说明页 ----------
app.get('/', (req, res) => {
  res.type('text/html').send(
    '<meta charset="utf-8"><h3>数科云栖校园 · 云托管服务</h3>'
    + '<p>POST /api/wxlogin → openid（云托管注入 X-WX-OPENID）</p>'
    + '<p>GET  /api/health → 数据库连通性</p>'
    + '<p>POST /api/ticket 、GET /api/tickets → 报修工单</p>'
    + '<p>POST /api/post 、GET /api/posts → 校园互助（帖子带身份快照）</p>'
    + '<p>POST /api/profile 、GET /api/profile?openids=a,b → 按人存/取身份（班级/头衔/头像昵称）</p>'
    + '<p>GET  /api/express?no=单号&com=公司 → 快递轨迹</p>'
    + '<p>GET  /api/kb/search?q=关键词 → 百科检索（整站语料）</p>'
    + '<p>POST /api/asr —— 音频 base64 转文字（需配置 ASR_URL）</p>'
    + '<p>GET  /api/llm/models 、POST /api/llm —— 统一 DeepSeek 代理（密钥仅在服务端）</p>'
    + '<p>POST /api/llm/stream —— 真流式 SSE，逐 token 返回 delta</p>'
  )
})

const port = process.env.PORT || 80
app.listen(port, () => {
  console.log('[server] listening on ' + port + ' | db=' + (CFG ? CFG.host : 'not-configured'))
})
