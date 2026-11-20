// utils/route.js —— 办事路线编排
//
// 输入：若干件要办的事（data/guide.js 的 k）
// 输出：一条带时间窗的路线 + 需要合并准备的材料
//
// 设计原则（与全站一致）：
//   1. 只用数据里已有的信息推断，不编造办公时间；PLACES 里 known=false 的时段
//      标为"估算"，页面上会显示"约"和来源，不让估算冒充公示。
//   2. 不做"代你预约/代你排队"的承诺，只回答"先去哪、几点、带几份材料"。
//   3. 排不进的项明确说"今天办不完"，不硬塞一个假时间。

const { DAILY, PLACES, AT } = require('../data/guide')

const BY = {}
DAILY.forEach((d) => { BY[d.k] = d })

// 同一区域步行 5 分钟，跨区 10 分钟（估算，用于给出"大约几点到"）
const WALK_SAME = 5
const WALK_CROSS = 10

function toMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}
function toLabel(m) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm
}
// '09:00-11:30,14:30-17:00' → [{s,e}]
function parseWin(str) {
  if (!str) return null
  const out = []
  str.split(',').forEach((seg) => {
    const p = seg.trim().split('-')
    const s = toMin(p[0])
    const e = toMin(p[1])
    if (s !== null && e !== null) out.push({ s, e })
  })
  return out.length ? out : null
}
// 从 t 起找第一个塞得下 dur 的窗口
function nextSlot(wins, t, dur) {
  if (!wins) return { s: t, e: t + dur, flexible: true }
  for (let i = 0; i < wins.length; i++) {
    const s = Math.max(t, wins[i].s)
    if (s + dur <= wins[i].e) return { s, e: s + dur, flexible: false }
  }
  return null
}
function winLabel(str) {
  if (!str) return '按通知'
  return str.split(',').map((x) => x.trim().replace('-', '—')).join(' / ')
}

// 共用材料：这几件事都要带同一类东西，提醒别重复准备
const SHARED = [
  { k: 'idcard', re: /身份证/, label: '身份证 / 复印件' },
  { k: 'card', re: /学生证|校园卡/, label: '学生证 / 校园卡' },
  { k: 'photo', re: /照片|一寸/, label: '证件照' },
  { k: 'medical', re: /医院|校医|就诊|挂号/, label: '医院证明 / 就诊单' },
]

/**
 * @param {string[]} keys 选中的事项 k
 * @param {object} opt { start: '09:00' }
 */
function buildRoute(keys, opt) {
  const o = opt || {}
  const startAt = toMin(o.start || '09:00') || 540
  const picked = (keys || []).map((k) => BY[k]).filter(Boolean)
  if (!picked.length) return null

  // 1. 分开：要在宿舍线上办的 / 要出门的
  const online = []
  const offline = []
  picked.forEach((d) => {
    const pk = AT[d.k]
    if (!pk || !PLACES[pk]) {
      online.push({
        k: d.k, t: d.t, dur: 5,
        note: d.entry ? '在手机上办（' + d.entry.n + '）' : '在手机上办',
      })
      return
    }
    offline.push({ d, pk, p: PLACES[pk] })
  })

  // 2. 同一地点合并成一次到访
  const map = {}
  offline.forEach((x) => {
    if (!map[x.pk]) map[x.pk] = { pk: x.pk, p: x.p, items: [] }
    map[x.pk].items.push(x.d)
  })
  let groups = Object.keys(map).map((k) => map[k])
  groups.forEach((g) => {
    g.dur = g.items.reduce((a, d) => a + (g.p.dur || 20), 0)
    const wins = parseWin(g.p.win)
    g.wins = wins
    // 排序键：最早关门的先去；时间不固定的排最后
    g.key = wins ? Math.min.apply(null, wins.map((w) => w.e)) : 9999
    g.label = winLabel(g.p.win)
  })
  // 先按区域聚合（同一栋楼的两件事连在一起办，少走一趟），
  // 区域之间按"该区域最早关门时间"排，区域内同样按关门时间排。
  const areaKey = {}
  groups.forEach((g) => {
    if (areaKey[g.p.area] === undefined || g.key < areaKey[g.p.area]) areaKey[g.p.area] = g.key
  })
  groups.sort((a, b) => (areaKey[a.p.area] - areaKey[b.p.area]) || (a.key - b.key))

  // 3. 排程
  const steps = []
  const blocked = []
  let t = startAt
  let lastArea = ''
  groups.forEach((g) => {
    const walk = steps.length ? (lastArea === g.p.area ? WALK_SAME : WALK_CROSS) : WALK_CROSS
    const slot = nextSlot(g.wins, t + walk, g.dur)
    if (!slot) {
      // 今天排不进：说清是"已下班"还是"时间不够"，并给下一个可办时段
      const arrive = t + walk
      const lastEnd = g.wins ? g.wins[g.wins.length - 1].e : 0
      let why
      if (!g.wins) why = '时间地点由班级通知，不排进路线'
      else if (arrive >= lastEnd) why = '今天已下班（' + g.label + '），明天 ' + toLabel(g.wins[0].s) + ' 起'
      else why = '今天剩下的时间不够（这一件要 ' + g.dur + ' 分钟），明天 ' + toLabel(g.wins[0].s) + ' 起再来'
      blocked.push({
        place: g.p.n, area: g.p.area,
        items: g.items.map((d) => ({ k: d.k, t: d.t })),
        why,
      })
      return
    }
    steps.push({
      place: g.p.n, area: g.p.area, belt: g.p.b,
      arrive: toLabel(slot.s), leave: toLabel(slot.e),
      arriveM: slot.s, leaveM: slot.e,
      winRaw: g.p.win, winLabel: g.label, known: g.p.known, src: g.p.src,
      walk: walk,
      items: g.items.map((d) => ({ k: d.k, t: d.t, cat: d.cat, tip: (d.tips || [])[0] || '' })),
      tel: (g.items[0].where || []).filter((w) => w.tel).map((w) => w.tel)[0] || '',
    })
    t = slot.e
    lastArea = g.p.area
  })

  // 4. 材料合并
  const shared = SHARED.map((s) => {
    const hits = picked.filter((d) => (d.need || []).some((n) => s.re.test(n)))
    return hits.length >= 2
      ? { key: s.k, label: s.label, n: hits.length, items: hits.map((d) => ({ k: d.k, t: d.t })) }
      : null
  }).filter(Boolean)

  const totalMin = steps.reduce((a, s) => a + (s.leaveM - s.arriveM) + s.walk, 0)
    + online.reduce((a, x) => a + x.dur, 0)

  return {
    steps,
    online,
    blocked,
    shared,
    // 地点数按不同地点算，同地点合并过
    placeCount: steps.length,
    totalMin,
    firstAt: steps.length ? steps[0].arrive : '',
    lastAt: steps.length ? steps[steps.length - 1].leave : '',
    startAt: toLabel(startAt),
    offlineN: offline.length,
    onlineN: online.length,
  }
}

// 路线转成一段可直接发到群里的文字
function routeText(r) {
  if (!r) return ''
  const L = []
  L.push('办事路线（' + r.startAt + ' 出发，约 ' + r.totalMin + ' 分钟）')
  r.steps.forEach((s, i) => {
    L.push((i + 1) + '. ' + s.arrive + '—' + s.leave + '  ' + s.place + '（' + s.belt + '）')
    s.items.forEach((it) => L.push('   · ' + it.t + (it.tip ? '（注意：' + it.tip + '）' : '')))
    if (!s.known && s.winRaw) L.push('   · 时段为估算，以现场公示为准')
  })
  if (r.online.length) {
    L.push('不用出门（手机办）：')
    r.online.forEach((x) => L.push('   · ' + x.t))
  }
  r.blocked.forEach((b) => L.push('今天办不完：' + b.items.map((i) => i.t).join('、') + ' —— ' + b.why))
  r.shared.forEach((s) => L.push('共用材料：' + s.label + '（' + s.n + ' 件事都要）'))
  L.push('办公时间未公示处按工作日估算，以现场公示为准。')
  return L.join('\n')
}

module.exports = { buildRoute, routeText }
