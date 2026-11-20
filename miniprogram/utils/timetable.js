// utils/timetable.js —— 课表：数据结构、示例、四种录入的解析与本地存储
//
// 课程一条长这样：
//   { id, n 课名, t 教师, r 地点, day 1-7, s 起始大节 1-5, span 跨几个大节, w 周次数组, c 配色 }
// 大节固定 5 个（照学校作息：01,02 / 03,04 / 05,06 / 07,08 / 09,10,11）。

const SLOTS = [
  { k: 1, n: '第一大节', sg: '01,02小节', time: '08:20-10:00' },
  { k: 2, n: '第二大节', sg: '03,04小节', time: '10:20-12:00' },
  { k: 3, n: '第三大节', sg: '05,06小节', time: '14:00-15:40' },
  { k: 4, n: '第四大节', sg: '07,08小节', time: '16:00-17:40' },
  { k: 5, n: '第五大节', sg: '09,10,11小节', time: '19:00-21:35' },
]

const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
const DAY_S = ['一', '二', '三', '四', '五', '六', '日']

// 配色只决定色相，具体色值在 wxss 里，避免 js 里写一堆颜色
const COLORS = [
  { k: 'blue', n: '蓝' },
  { k: 'purple', n: '紫' },
  { k: 'pink', n: '粉' },
  { k: 'mint', n: '青' },
  { k: 'amber', n: '橙' },
]

const K_KEY = 'timetable'
const K_WEEK = 'timetableWeek'
const K_INIT = 'timetableInit'
const K_BLD = 'timetableBld'
const K_FILL = 'timetableFillV1'   // 旧示例「只有第11周」已一次性补全周次

// 楼栋：学校已统一改称，录课只让「选楼 + 填房间号」，不再手打「吉芯楼-吉芯楼103」
// 依据校园楼栋标识牌（utils/campus.js 的 BUILDINGS 同一套对照）
const BUILDINGS = [
  { n: '吉贤楼', old: '2 号教学楼', use: '上课 / 考场' },
  { n: '吉智楼', old: '3 号教学楼', use: '上课 / 考场' },
  { n: '吉芯楼', old: '6 号教学楼', use: '上课' },
  { n: '吉思楼', old: '7 号教学楼', use: '上课' },
  { n: '吉美楼', old: '综合楼', use: '行政 / 办事' },
  { n: '吉星楼', old: '图书馆', use: '借阅 / 自习' },
]
// 选择器里显示成「吉芯楼（原 6 教）」，让人知道和新名的对应
const B_NAMES = BUILDINGS.map((b) => b.n + '（原' + b.old.replace(/\s/g, '') + '）')
const B_OTHER = '其它地点'
const B_ALL = B_NAMES.concat([B_OTHER])

// 旧称 → 新称；顺带把「吉芯楼-吉芯楼103」这种重复楼名压掉
const ROOM_ALIAS = [
  { re: /6\s*号?教学楼|六教|吉芯楼/g, n: '吉芯楼' },
  { re: /7\s*号?教学楼|七教|吉思楼/g, n: '吉思楼' },
  { re: /3\s*号?教学楼|三教|吉智楼/g, n: '吉智楼' },
  { re: /2\s*号?教学楼|二教|吉贤楼/g, n: '吉贤楼' },
  { re: /综合楼|吉美楼/g, n: '吉美楼' },
  { re: /图书馆|吉星楼/g, n: '吉星楼' },
]
const normRoom = (s) => {
  let t = String(s || '').trim()
  if (!t) return ''
  // 「3-201」这种缩写：3 就是 3 号教学楼（吉智楼），2/6/7 同理
  const abbr = t.match(/^([2367])\s*[-－]\s*(\d{2,4})$/)
  if (abbr) {
    const b = BUILDINGS.find((x) => x.old.indexOf(abbr[1] + ' 号') === 0)
    if (b) return b.n + abbr[2]
  }
  ROOM_ALIAS.forEach((a) => { t = t.replace(a.re, a.n) })
  const hit = t.match(/^(吉[星美贤智芯思]楼)/)
  if (hit) {
    const b = hit[1]
    const rest = t.slice(b.length).split(b).join('').replace(/[（(]\s*[）)]/g, '').replace(/^[\s\-－—_·、,，]+/, '')
    t = b + rest
  }
  return t
}

// 地点 → 楼栋下标 + 房间号；认不出楼就是「其它地点」
const splitRoom = (r) => {
  const t = normRoom(r)
  for (let i = 0; i < BUILDINGS.length; i++) {
    if (t.indexOf(BUILDINGS[i].n) === 0) {
      return { bi: i, room: t.slice(BUILDINGS[i].n.length).trim() }
    }
  }
  return { bi: BUILDINGS.length, room: t }
}

// 楼栋 + 房间号 → 地点文字（只填了楼就只要楼名）
const joinRoom = (bi, room) => {
  const num = String(room || '').trim()
  const b = BUILDINGS[bi]
  if (!b) return num
  return num ? b.n + num : b.n
}

const range = (a, b) => {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

// 示例课表：照用户给的截图整理（同一门课跨两个大节的合并成一块），地点用改版后的楼名
// 周次默认铺满 1-16：这样切到任意一周都能看到课，不会「只有第 11 周有东西」
const DEMO = [
  { n: '嵌入式综合设计', t: '唐婉莎', r: '吉芯楼103', day: 3, s: 1, span: 2, w: range(1, 16), c: 'purple' },
  { n: '嵌入式综合设计', t: '唐婉莎', r: '吉芯楼103', day: 2, s: 5, span: 1, w: range(1, 16), c: 'purple' },
  { n: '软件工程', t: '王忠良', r: '吉芯楼202', day: 4, s: 3, span: 1, w: range(1, 16), c: 'pink' },
  { n: '移动互联网开发', t: '蔡迎华', r: '吉美楼311', day: 5, s: 3, span: 1, w: range(1, 16), c: 'pink' },
  { n: '马克思主义基本原理', t: '聂聪', r: '校内课程实践-思政课实践基地', day: 7, s: 3, span: 2, w: range(1, 16), c: 'pink' },
]

let seq = 0
const uid = () => 'c' + Date.now().toString(36) + (seq++).toString(36)

// 小节号 → 大节号：09/10/11 都算第五大节，不能简单除 2
const SLOT_OF_CODE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 5 }

const colorOf = (name) => {
  let h = 0
  const s = String(name || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
  return COLORS[h % COLORS.length].k
}

// ---------- 周次 ----------
// "1-16周" / "第1-16周" / "1-16周(单)" / "第11周" / "3,5,7周" / "1-16周(双)"
const parseWeeks = (str) => {
  const s = String(str || '').replace(/\s/g, '')
  if (!s) return []
  const odd = /单/.test(s) && !/双/.test(s)
  const even = /双/.test(s) && !/单/.test(s)
  const out = []
  // 只吃「数字 + 周」这一段，避免把前面的节次号（05-06小节）当成周次
  const withWk = s.match(/(\d{1,2}(?:[-–—~至]\d{1,2})?(?:[,，、]\d{1,2})*)(?=周)/g)
  const segs = withWk && withWk.length ? withWk : (/\d/.test(s) && !/周/.test(s) ? [s] : [])
  segs.forEach((seg) => {
    const re = /(\d{1,2})(?:[-–—~至](\d{1,2}))?/g
    let m
    while ((m = re.exec(seg))) {
      const a = Number(m[1])
      const b = m[2] ? Number(m[2]) : a
      for (let i = a; i <= b && i <= 30; i++) {
        if (odd && i % 2 === 0) continue
        if (even && i % 2 === 1) continue
        if (out.indexOf(i) < 0) out.push(i)
      }
    }
  })
  return out.sort((x, y) => x - y)
}

const weeksText = (w) => {
  if (!w || !w.length) return '未标周次'
  if (w.length === 1) return '第' + w[0] + '周'
  // 连续段压成 1-16 这种写法
  const parts = []
  let a = w[0]
  let b = w[0]
  for (let i = 1; i < w.length; i++) {
    if (w[i] === b + 1) { b = w[i]; continue }
    parts.push(a === b ? String(a) : a + '-' + b)
    a = w[i]
    b = w[i]
  }
  parts.push(a === b ? String(a) : a + '-' + b)
  return parts.join(',') + '周'
}

// ---------- 节次 ----------
// "05-06小节" / "05-06-07-08小节" / "第3大节" / "09,10小节"
const parseSlot = (str) => {
  const s = String(str || '')
  const big = s.match(/第([一二三四五12345])\s*大?节/)
  if (big) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 }
    const k = map[big[1]] || Number(big[1])
    if (k >= 1 && k <= 5) return { s: k, span: 1 }
  }
  // 只在「N 小节」这一段里取节次号，否则周次、教室号都会被当成小节
  const seg = s.match(/(\d{1,2}(?:\s*[-–—~至,、]\s*\d{1,2})*)\s*小节/)
  if (!seg) return null
  const codes = (seg[1].match(/\d{1,2}/g) || []).map(Number).filter((n) => n >= 1 && n <= 11)
  if (!codes.length) return null
  const slots = codes.map((c) => SLOT_OF_CODE[c]).filter(Boolean)
  if (!slots.length) return null
  const lo = Math.min.apply(null, slots)
  const hi = Math.max.apply(null, slots)
  return { s: lo, span: hi - lo + 1 }
}

const parseDay = (str) => {
  const s = String(str || '')
  const m = s.match(/(?:星期|周)([一二三四五六日天])/)
  if (!m) return 0
  const ch = m[1]
  if (ch === '天') return 7
  return DAY_S.indexOf(ch) + 1
}

const cleanName = (s) => String(s || '')
  .replace(/[（(]\s*[）)]/g, '')
  .replace(/^(课程|课名|名称)[:：]\s*/, '')
  .replace(/教师[:：].*$/, '')
  .replace(/老师[:：].*$/, '')
  .replace(/地点[:：].*$/, '')
  .replace(/教室[:：].*$/, '')
  .replace(/第?\s*\d{1,2}\s*[-–—~至]\s*\d{1,2}\s*小节.*$/, '')
  .replace(/星期.*$/, '')
  .replace(/周[一二三四五六日天].*$/, '')
  .replace(/[\s|｜]+$/, '')
  .trim()

const parseTeacher = (s) => {
  const m = String(s || '').match(/(?:教师|老师|授课教师)[:：]?\s*([^\s|｜,，、;；]{1,8})/)
  return m ? m[1] : ''
}

const parseRoom = (s) => {
  // 先剥掉「05-06小节」这类节次段，不然 05-06 会被当成教室号
  const str = String(s || '').replace(/\d{1,2}(?:\s*[-–—~至,、]\s*\d{1,2})*\s*小节/g, ' ')
  const m = str.match(/(?:地点|教室|上课地点)[:：]?\s*([^\s|｜,，;；]{1,16})/)
  if (m) return normRoom(m[1])
  const m2 = str.match(/([A-Za-z]?\d{1,2}[-－]\d{3,4})/)
  if (m2) return normRoom(m2[1])
  // 「6号教学楼103」「综合楼412」「吉芯楼-吉芯楼103」这类
  const m3 = str.match(/((?:[2367]\s*号?教学楼|[二三六七]教|综合楼|图书馆|吉[星美贤智芯思]楼)[\s\-－]*\d{2,4})/)
  if (m3) return normRoom(m3[1])
  // 不是教室的地点（思政课实践基地、报告厅这类）照原文留着
  const m4 = str.match(/([^\s|｜,，;；]{2,20}?(?:基地|报告厅|会议室|实验室|实训室|场馆))/)
  return m4 ? normRoom(m4[1]) : ''
}

// 前面几行里挑课名：跳过「教师：」「地点：」这类标签行
const pickName = (buf) => {
  for (let i = buf.length - 1; i >= 0; i--) {
    if (/^(教师|老师|授课教师|地点|教室|周次|学分|备注)[:：]/.test(buf[i])) continue
    const c = cleanName(buf[i])
    if (c) return c
  }
  return ''
}

// ---------- 文本解析：粘贴教务课表 / 聊天里复制的一段 ----------
// 支持每门课一段（课名一行、教师一行、星期节次一行），也支持一门课全在一行
const parseText = (text) => {
  const raw = String(text || '').replace(/\r/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean)
  const list = []
  const bad = []
  let buf = []

  raw.forEach((line) => {
    const hasDay = /(?:星期|周)[一二三四五六日天]/.test(line)
    const hasSlot = /小节|第[一二三四五]大节/.test(line)
    if (hasDay && hasSlot) {
      // 这一行能定位，课名可能在同一行，也可能在前面几行
      const name = cleanName(line) || pickName(buf)
      const slot = parseSlot(line)
      const day = parseDay(line)
      if (!name || !slot || !day) { bad.push(line); buf = []; return }
      const tIn = parseTeacher(line) || parseTeacher(buf.join(' '))
      const w = parseWeeks(line)
      list.push({
        id: uid(), n: name, t: tIn, r: parseRoom(line),
        day, s: slot.s, span: slot.span,
        w: w.length ? w : range(1, 16),
        c: colorOf(name),
      })
      buf = []
      return
    }
    if (hasDay && !hasSlot) { bad.push(line); buf = []; return }
    buf.push(line)
    if (buf.length > 4) buf.shift()
  })

  // 收尾还留在缓冲里的行：没跟着「星期 + 节次」的，如实算没认出来
  buf.forEach((l) => {
    if (!/^(教师|老师|授课教师|地点|教室|周次|学分|备注)[:：]/.test(l)) bad.push(l)
  })

  return { list, bad }
}

// 识别结果（模型按约定吐 JSON 行）→ 课程：一条一行，字段用 n/t/r/day/s/span/w
const parseJsonLines = (text) => {
  const out = []
  const bad = []
  String(text || '').split('\n').forEach((line) => {
    const s = line.trim().replace(/^```(json)?/i, '').replace(/```$/, '').replace(/^[-*]\s*/, '')
    if (!s || s === '[' || s === ']') return
    let o = null
    try { o = JSON.parse(s.replace(/,$/, '')) } catch (e) { o = null }
    if (!o) { if (s.length > 2) bad.push(s); return }
    const day = Number(o.day) || parseDay(o.day || '')
    const slot = parseSlot(String(o.s || o.slot || '')) || { s: Number(o.s) || 1, span: Number(o.span) || 1 }
    const n = cleanName(o.n || o.name || '')
    if (!day || !n) { bad.push(s); return }
    const w = parseWeeks(o.w || o.weeks || '')
    out.push({
      id: uid(), n, t: o.t || o.teacher || '', r: o.r || o.room || '',
      day, s: slot.s, span: Math.max(1, Number(o.span) || slot.span || 1),
      w: w.length ? w : range(1, 16),
      c: colorOf(n),
    })
  })
  return { list: out, bad }
}

// ---------- 存储 ----------
// 课表按班级分份：不设班级存公共那份（沿用旧 key，兼容老数据），
// 选了班级就存 timetable::<班级key>，切班级换对应那份。
const storeKey = (k) => (k ? K_KEY + '::' + k : K_KEY)
const initKey = (k) => (k ? K_INIT + '::' + k : K_INIT)

const read = (k) => {
  let v = null
  try { v = wx.getStorageSync(storeKey(k)) } catch (e) { v = null }
  if (!v || !v.length) return []
  return v.map((x) => Object.assign({}, x, { w: x.w || [] }))
}

const write = (list, k) => {
  try {
    wx.setStorageSync(storeKey(k), list || [])
    wx.setStorageSync(initKey(k), 1)
  } catch (e) {}
}

// 区分「还没开过课表」和「开过又清空了」：前者首页按示例计数，后者老老实实 0 节
const inited = (k) => {
  try { return !!wx.getStorageSync(initKey(k)) } catch (e) { return false }
}

const readWeek = () => {
  let v = 0
  try { v = Number(wx.getStorageSync(K_WEEK)) || 0 } catch (e) { v = 0 }
  return v || 11
}

const writeWeek = (n) => {
  try { wx.setStorageSync(K_WEEK, Number(n) || 11) } catch (e) {}
}

// 上次选过的楼：下次开表单直接带出来，少点一次选择器（没存过就默认吉芯楼）
const readBld = () => {
  let raw = null
  try { raw = wx.getStorageSync(K_BLD) } catch (e) { raw = null }
  const v = Number(raw)
  const bad = raw === '' || raw === null || raw === undefined || isNaN(v) || v < 0 || v >= BUILDINGS.length
  return bad ? 2 : v
}

const writeBld = (i) => {
  try { wx.setStorageSync(K_BLD, Number(i) || 0) } catch (e) {}
}

// 老用户本机那份旧示例：4 门课只标了第 11 周，导致别周空。
// 只把「还是原示例」的那份补成 1-16 全周，且只补一次；用户自己录入/改过的课绝不碰。
const fillOldDemoWeeks = (k) => {
  const fk = K_FILL + (k ? '::' + k : '')
  let done = false
  try { done = !!wx.getStorageSync(fk) } catch (e) {}
  if (done) return false
  const list = read(k)
  // 认示例：课的条数和每门课的名字都对得上，且确实存在只标第 11 周的课
  const names = DEMO.map((d) => d.n)
  const isDemo = list.length === DEMO.length &&
    list.every((c) => names.indexOf(c.n) >= 0) &&
    list.some((c) => c.w && c.w.length === 1 && c.w[0] === 11)
  if (isDemo) {
    const filled = list.map((c, i) => Object.assign({}, c, { w: (DEMO[i] && DEMO[i].w) || range(1, 16) }))
    write(filled, k)
  }
  try { wx.setStorageSync(fk, 1) } catch (e) {}
  return isDemo
}

// 这份列表是否还是系统预置示例（没被用户改过）：用于荣誉统计——示例不算「交课表」贡献。
// 按 课名+教师+地点 逐条比对，周次不算（老示例铺满周次后仍是示例）。
const isDemo = (list) => {
  const a = list || []
  if (a.length !== DEMO.length) return false
  const key = (c) => String(c && c.n || '') + '|' + String(c && c.t || '') + '|' + String(c && c.r || '')
  const demoKeys = DEMO.map(key).sort()
  return a.map(key).sort().every((k, i) => k === demoKeys[i])
}

// 某一周要上的课
const ofWeek = (list, week) => (list || []).filter((c) => !c.w || !c.w.length || c.w.indexOf(week) >= 0)

// 排到网格坐标：col 0-6（周一为 0），row 0-4
const layout = (list, week) => {
  const out = []
  ofWeek(list, week).forEach((c) => {
    const row = Math.max(0, Math.min(4, (c.s || 1) - 1))
    const span = Math.max(1, Math.min(5 - row, c.span || 1))
    const col = Math.max(0, Math.min(6, (c.day || 1) - 1))
    out.push(Object.assign({}, c, {
      row, col, span,
      wTxt: weeksText(c.w),
      sgTxt: SLOTS[row].sg,
    }))
  })
  return out
}

const todayCol = () => {
  const d = new Date().getDay() // 0 周日
  return d === 0 ? 6 : d - 1
}

module.exports = {
  SLOTS, DAYS, DAY_S, COLORS, DEMO, K_KEY, K_WEEK, K_INIT, K_BLD, K_FILL, storeKey, initKey,
  BUILDINGS, B_NAMES, B_ALL, B_OTHER, normRoom, splitRoom, joinRoom,
  uid, range, colorOf, weeksText, parseWeeks, parseSlot, parseDay,
  parseText, parseJsonLines, read, write, inited, readWeek, writeWeek, readBld, writeBld,
  fillOldDemoWeeks, isDemo, ofWeek, layout, todayCol,
}
