// docs/eval/run_eval.js —— 可执行率评测（可复现）
//
// 做法：把 40 道真实问法分别送进两条检索路径（办事指南的七层匹配、校园百科的 BM25），
// 判定系统输出是否包含"照做"所需的三个要素：材料、地点/入口、时间/时段。
//
// 说明：这是"要素完备率"，衡量系统输出能不能直接照着做，不是用户满意度。
// 需要人主观打分的部分（1—3 档）另见表 a，本脚本只跑客观可复现的部分。
//
// 用法： node docs/eval/run_eval.js

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../miniprogram')
const { DAILY } = require(path.join(ROOT, 'data/guide'))
const rag = require(path.join(ROOT, 'utils/rag'))
// 直接引用线上那一份检索，不在这里另写一套：
// 评测跑的检索必须就是用户点进去用的检索，否则测出来的分数没有意义
const { search } = require(path.join(ROOT, 'utils/search'))
const QS = require('./questions.json').items

function guideHit(q) {
  const r = search(DAILY, q)
  if (!r.length) return null
  return { d: r[0].d, via: r[0].hit.label + ':' + r[0].hit.key, rank: r[0].hit.rank }
}

// 三个要素是否齐全
function elements(d) {
  return {
    need: !!(d.need && d.need.length),
    where: !!(d.where && d.where.length) || !!d.entry,
    time: !!(d.due && String(d.due).trim()),
    steps: !!(d.steps && d.steps.length >= 3),
  }
}

const rows = []
QS.forEach((it) => {
  const g = guideHit(it.q)
  const hits = rag.retrieve(it.q, { topK: 2 })
  const top = hits && hits.length ? hits[0] : null
  const score = top ? (top.norm || 0) : 0
  const el = g ? elements(g.d) : null
  const full = el ? (el.need && el.where && el.time) : false
  // 判定：guide 命中且材料/地点/时间齐 → 可照做；只命中 kb → 能回答但要再问去哪办；都没有 → 拒答
  let level
  if (g && full) level = 3
  else if (g) level = 2
  else if (top && score >= 0.22) level = 2
  else level = 1
  rows.push({
    id: it.id,
    q: it.q,
    expect: it.expect,
    guide: g ? g.d.k : '',
    guideT: g ? g.d.t : '',
    via: g ? g.via : '',
    need: el ? el.need : false,
    where: el ? el.where : false,
    time: el ? el.time : false,
    kb: top ? (top.t || top.id || '') : '',
    kbScore: Math.round(score * 100) / 100,
    level,
  })
})

const n = rows.length
const c3 = rows.filter((r) => r.level === 3).length
const c2 = rows.filter((r) => r.level === 2).length
const c1 = rows.filter((r) => r.level === 1).length
const guides = rows.filter((r) => r.guide)
const fullN = guides.filter((r) => r.need && r.where && r.time).length

// 与"期望"的一致性：该拒答的有没有拒答、该给的有没有给
let wrong = 0
rows.forEach((r) => {
  const gaveAnswer = r.level >= 2
  if (r.expect === 'refuse' && gaveAnswer) wrong++
  if ((r.expect === 'guide' || r.expect === 'kb') && !gaveAnswer) wrong++
})

const lines = []
lines.push('# 可执行率评测结果')
lines.push('')
lines.push('时间：' + new Date().toISOString().slice(0, 16).replace('T', ' '))
lines.push('题库：docs/eval/questions.json（' + n + ' 题）')
lines.push('判定：3 = 材料/地点/时间齐、可照做；2 = 能给方向但缺要素；1 = 答不出（应明确拒答）')
lines.push('')
lines.push('## 汇总')
lines.push('')
lines.push('| 指标 | 数值 |')
lines.push('|---|---|')
lines.push('| 可直接照做（3 分） | ' + c3 + ' / ' + n + '（' + Math.round((c3 / n) * 100) + '%） |')
lines.push('| 给方向但缺要素（2 分） | ' + c2 + ' / ' + n + ' |')
lines.push('| 答不出（1 分） | ' + c1 + ' / ' + n + ' |')
lines.push('| 命中办事条目 | ' + guides.length + ' / ' + n + ' |')
lines.push('| 条目里材料/地点/时间三项齐全 | ' + fullN + ' / ' + guides.length + ' |')
lines.push('| 与期望不一致（该拒答却答、该答却空） | ' + wrong + ' / ' + n + ' |')
lines.push('')
lines.push('## 逐题')
lines.push('')
lines.push('| # | 问题 | 期望 | 命中条目 | 匹配方式 | 材料 | 地点 | 时间 | 知识库 | 得分 |')
lines.push('|---|---|---|---|---|---|---|---|---|---|')
rows.forEach((r) => {
  lines.push('| ' + r.id + ' | ' + r.q + ' | ' + r.expect + ' | ' + (r.guideT || '—') +
    ' | ' + (r.via || '—') + ' | ' + (r.need ? '✓' : '—') + ' | ' + (r.where ? '✓' : '—') +
    ' | ' + (r.time ? '✓' : '—') + ' | ' + (r.kb || '—') + ' | ' + r.level + ' |')
})

fs.writeFileSync(path.join(__dirname, 'result.md'), lines.join('\n'), 'utf-8')
fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(rows, null, 1), 'utf-8')
console.log(lines.slice(8, 20).join('\n'))
console.log('\n已写出 docs/eval/result.md 与 result.json')
