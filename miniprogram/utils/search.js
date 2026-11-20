// utils/search.js —— 办事指南的检索
//
// 学生不会照着你写的标题搜。他打的是"快递在哪取""医务室在哪""医保怎么报销"，
// 整句去匹配标题永远匹配不到。所以这里做三层，越往后越松：
//   1. 整句命中某个字段        —— 关键词查询（取件码、学信网）走这层，直接给 100 分
//   2. 别名覆盖                —— "菜鸟驿站"命中的是别名"菜鸟"+"驿站"，按覆盖字数算
//   3. 拆掉问法词后的实词      —— "在哪/怎么/几点"不是信息，去掉再拿剩下的词去找
//
// 松不等于滥：最后按"覆盖度"或"实词长度"卡一道，宁可返回空列表让他去百科搜，
// 也不要把"普通话考试报名"答成"重修怎么办"。
//
// 页面和评测脚本共用这一份，避免"评测用的检索"和"用户用的检索"是两套。

const plain = (s) => String(s || '').replace(/\*\*/g, '')

const FIELDS = [
  (d) => d.t,
  (d) => (d.tags || []).join(' '),
  (d) => (d.need || []).join(' '),
  (d) => (d.where || []).map((w) => w.n + ' ' + (w.d || '')).join(' '),
  (d) => (d.steps || []).join(' '),
  (d) => (d.tips || []).join(' '),
  (d) => (d.due || '') + ' ' + (d.src || ''),
]
const FIELD_LABEL = ['标题', '别名', '材料', '地点', '步骤', '提醒', '时间出处']
// 实词命中各字段的可信度：标题 > 别名 > 材料 > 地点 > 步骤 > 提醒 > 时间
const FIELD_SCORE = [70, 65, 60, 55, 40, 38, 20]

// 问法词：出现在句子里不代表要办这件事
const STOP = /(在哪里|在哪|哪里|怎么|怎样|如何|什么|多少|几点|几个|哪些|哪个|可以|能不能|能否|需要|要不要|的|了|吗|呢|吧|啊|请问|我想|想问|问一下|一下|时候|时间|地点|东西|找谁|在哪办)/g

// 去掉问法词后剩下的"信息字数"，用来判断这条命中有多可信
function content(q) {
  return plain(q).replace(STOP, '').replace(/[，。？、！；：\s]+/g, '')
}
function words(q) {
  return plain(q)
    .replace(STOP, ' ')
    .replace(/[，。？、！；：\s]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w))
}

// 整句是否出现在某个字段里
function exactField(d, q) {
  const k = plain(q)
  for (let i = 0; i < FIELDS.length; i++) {
    if (plain(FIELDS[i](d)).indexOf(k) >= 0) return i
  }
  return -1
}

// 别名覆盖：把命中的别名字符标出来，算覆盖了多少信息字
function tagHit(d, raw) {
  const tags = d.tags || []
  const seq = content(raw)
  if (!seq) return null
  const used = {}
  let chars = 0
  let longest = ''
  tags.forEach((t) => {
    if (!t || t.length < 2) return
    if (seq.indexOf(t) < 0) return
    if (t.length > longest.length) longest = t
    for (let i = 0; i < t.length; i++) {
      const c = t[i]
      if (!used[c]) { used[c] = 1; chars++ }
    }
  })
  if (!chars) return null
  return { tag: longest, cover: chars / seq.length }
}

// 二字片段覆盖：学生换个说法（"请假要带什么材料" vs 标题"请假要什么材料和流程"），
// 逐词匹配会落空，但相邻两字大半能对上。按覆盖比例算，过六成才认。
function gramHit(d, raw) {
  const q = content(raw)
  if (q.length < 3) return null
  let best = null
  for (let i = 0; i < FIELDS.length; i++) {
    const text = plain(FIELDS[i](d))
    if (text.length < 4) continue
    const seen = {}
    let hit = 0
    let total = 0
    for (let j = 0; j < q.length - 1; j++) {
      const g = q.slice(j, j + 2)
      if (seen[g]) continue
      seen[g] = 1
      total++
      if (text.indexOf(g) >= 0) hit++
    }
    const cover = total ? hit / total : 0
    if (cover >= 0.6 && (!best || cover > best.cover)) {
      best = { label: FIELD_LABEL[i], text, rank: i, score: 45 - i, key: '', cover }
    }
  }
  return best
}

/**
 * 返回 { label, text, rank, score, key } 或 null
 * key 是真正命中的那个词，页面拿它做高亮——整句问法在标题里是找不到的
 */
function matchOf(d, q) {
  const raw = String(q || '').trim()
  if (!raw) return null

  // 1 整句命中
  const ei = exactField(d, raw)
  if (ei >= 0) {
    return { label: FIELD_LABEL[ei], text: plain(FIELDS[ei](d)), rank: ei, score: 100 - ei, key: raw }
  }

  // 2 别名覆盖：至少盖住四成信息字才算，否则"报名"会把一切带报名的都捞出来
  const seq = content(raw)
  const th = tagHit(d, raw)
  if (th && (th.cover >= 0.4 || th.tag.length >= 3)) {
    return { label: '别名', text: th.tag, rank: 1, score: 88, key: th.tag }
  }

  // 3 实词：命中标题/材料/地点比命中步骤更说明问题
  let best = null
  words(raw).forEach((w) => {
    for (let i = 0; i < FIELDS.length; i++) {
      if (plain(FIELDS[i](d)).indexOf(w) >= 0) {
        const s = FIELD_SCORE[i]
        if (!best || s > best.score) {
          best = { label: FIELD_LABEL[i], text: plain(FIELDS[i](d)), rank: i, score: s, key: w }
        }
        break
      }
    }
  })
  if (best) {
    // 卡一道：命中的词要能代表整句问的是什么。
    // 标题/别名本身就够具体，覆盖四成就认；材料/地点要六成；
    // 步骤/提醒里顺带提一句的词最不可信（观光车的站点列表里有"食堂"，
    // 不代表这条讲的是食堂），必须三个字以上。"学校有几个学院"里的"学院"
    // 只出现在某条的材料清单里，就属于该被拒掉的那类。
    const cover = seq ? best.key.length / seq.length : 0
    const needCover = best.rank <= 1 ? 0.4 : best.rank <= 3 ? 0.6 : 1.01
    if (cover >= needCover || best.key.length >= 3) return best
  }

  // 4 换说法：整句、别名、词都对不上，退回二字覆盖
  return gramHit(d, raw)
}

// 列表排序：分数高的在前，同分保持原顺序
function search(list, q) {
  if (!String(q || '').trim()) return list.map((d) => ({ d, hit: null }))
  return list
    .map((d) => ({ d, hit: matchOf(d, q) }))
    .filter((x) => x.hit)
    .sort((a, b) => b.hit.score - a.hit.score)
}

// 一条都没搜到时的兜底：按"共同字数"找最接近的几件，别让用户对着空列表发呆
// 阈值放到 3 个字：只共用一个"报"字就推荐"重修"，比不推荐更糟
function suggest(list, q, n) {
  const seq = content(q)
  if (!seq) return []
  const set = {}
  for (let i = 0; i < seq.length; i++) set[seq[i]] = 1
  return list
    .map((d) => {
      const t = plain(d.t + ' ' + (d.tags || []).join(' '))
      const seen = {}
      let c = 0
      for (let i = 0; i < t.length; i++) {
        if (set[t[i]] && !seen[t[i]]) { seen[t[i]] = 1; c++ }
      }
      return { d, c }
    })
    .filter((x) => x.c >= 3)
    .sort((a, b) => b.c - a.c)
    .slice(0, n || 3)
    .map((x) => x.d)
}

module.exports = { matchOf, search, suggest, words, content, plain }
