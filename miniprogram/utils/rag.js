// utils/rag.js —— 极轻量中文检索（BM25），纯本地运行，无外部依赖
// 为什么不上向量库：知识库只有几十条、机器翻译级别的语义漂移在垂直领域反而更差，
// 而 BM25 + 同义词扩展在校内问答这种"关键词强相关"场景命中率高、可解释、零成本。
const { KB, KB_SIZE, KB_SCHOOL_SIZE, KB_ASEAN_SIZE, KB_GEELY_SIZE } = require('./kb')

// ---- 中文切分：英文/数字按词，中文按 bigram + 单字（单字权重低） ----
const STOP_BIGRAM = new Set([
  '什么', '怎么', '怎样', '如何', '可以', '是否', '请问', '我们', '你们', '他们',
  '这个', '那个', '一下', '一个', '有没', '没有', '是不', '不是', '的话', '我需',
  '想要', '我想', '能能', '不能', '能不', '么办', '哪些', '哪个', '多少', '为什',
  // 泛用动词/副词：几乎任何条目正文都会出现（"官方推荐 Chrome"），
  // 留着会让"推荐一部电影"这类无关问题被单凭一个词命中
  '推荐', '建议', '觉得', '认为', '一般', '需要', '应该', '可以', '直接', '方便',
  // 疑问/方位 bigram 没有主题信息，留着只会把"在哪""怎么去"打到所有含这些词的条目上
  '在哪', '儿有', '么去', '去学', '有没', '不有', '什么',
])

function tokenize(text) {
  const out = []
  if (!text) return out
  const s = String(text).toLowerCase()
  // 英文单词 / 数字 / 型号（A100、3.17 等）
  const latin = s.match(/[a-z][a-z0-9+#._-]{1,}|\d+(?:\.\d+)?/g)
  if (latin) latin.forEach(w => out.push('#' + w))
  // 中文连续段：只取 bigram。单字（学/院/人/有）区分度太低，
  // 实测会把"今天天气怎么样"也打到地址条目上，一律丢弃。
  const runs = s.match(/[\u4e00-\u9fa5]+/g)
  if (runs) {
    runs.forEach(run => {
      for (let i = 0; i + 1 < run.length; i++) {
        const bg = run.slice(i, i + 2)
        if (!STOP_BIGRAM.has(bg)) out.push(bg)
      }
    })
  }
  return out
}

// ---- 同义词 / 口语扩展：用户不会说"馆藏"，只会问"图书馆有多少书" ----
const SYN = [
  ['食堂', '饭堂', '餐厅', '吃饭', '午饭', '晚饭', '吃点', '点什么', '外卖', '取餐'],
  ['快递', '取件', '驿站', '包裹'],
  ['报修', '维修', '坏了', '空调', '漏水'],
  ['课表', '课程表', '上课', '教务'],
  ['宿舍', '寝室', '住宿'],
  ['专业', '专业设置', '学什么', '有哪些专业'],
  ['学院', '院系', '哪个学院'],
  ['招生', '报考', '录取', '分数', '分数线', '专升本'],
  ['就业', '找工作', '实习', '校招', '毕业'],
  ['图书馆', '看书', '借书', '自习', '藏书', '吉星楼'],
  // 「能借几本书」切成 能借/借几/几本，与"借书"一个字都不重合，不加扩展检索不到；
  // 这里刻意不引"多少"，否则「学费多少钱」会被抬到借阅条目上
  ['借书', '续借', '借阅', '能借几本', '借几本'],
  ['地址', '在哪', '怎么走', '位置', '校址', '校区'],
  // 楼名 / 门名：简称（六教）与全称（6 号教学楼）必须能互相命中，否则检索不到对照条目
  ['吉贤楼', '吉智楼', '吉芯楼', '吉思楼', '2号教学楼', '3号教学楼', '6号教学楼', '7号教学楼',
    '2教', '3教', '6教', '7教', '二教', '三教', '六教', '七教'],
  ['吉美楼', '综合楼', '行政楼'],
  ['吉山门', '吉海门', '西北门', '北门', '校门', '大门', '校门口'],
  ['楼名', '改名', '更名', '楼栋', '楼宇'],
  // 东盟只扩到"东南亚"，不再把十国全拉进来——否则问"东盟旅游"会把十个国家条目一起抬上来
  ['东盟', '东南亚', '十国'],
  ['泰国', '曼谷', '泰铢', '泰语'],
  ['越南', '河内', '越南盾', '越南语'],
  ['马来西亚', '吉隆坡', '马币', '林吉特'],
  ['新加坡', '新元', '狮城'],
  ['印度尼西亚', '印尼', '雅加达', '印尼盾'],
  ['菲律宾', '马尼拉', '比索'],
  ['柬埔寨', '金边', '瑞尔', '吴哥窟'],
  ['老挝', '万象', '基普'],
  ['缅甸', '内比都', '缅元'],
  ['文莱', '斯里巴加湾', '文莱元'],
  ['签证', '免签', '落地签', '电子签', '护照'],
  ['汇率', '换钱', '换算', '兑换'],
  ['时区', '时差', '北京时间', '插座', '电压', '插头'],
  ['AI', '人工智能', '大模型', '算力', '超算'],
  ['校名', '学校叫什么', '南宁数字科技学院', '相思湖学院', '数科'],
  ['消费', '账单', '花了多少钱', '消费分析'],
  ['电话', '联系方式', '官网', '网址'],
]

// synIndex: token -> 同组其它 token 数组
const SYN_MAP = {}
SYN.forEach(group => {
  const flat = []
  group.forEach(g => tokenize(g).forEach(t => { if (!flat.includes(t)) flat.push(t) }))
  flat.forEach(t => {
    if (!SYN_MAP[t]) SYN_MAP[t] = []
    flat.forEach(o => { if (o !== t && SYN_MAP[t].indexOf(o) < 0) SYN_MAP[t].push(o) })
  })
})

function expand(tokens) {
  const extra = []
  tokens.forEach(t => {
    const m = SYN_MAP[t]
    if (m) m.forEach(o => extra.push(o))
  })
  return extra
}

// ---- 建索引（模块加载时一次，之后只读） ----
const K1 = 1.2
const B = 0.72
const W_TITLE = 2.2
const W_TAG = 1.6
const W_BODY = 1.0

const DOCS = []
const DF = {}
let AVGDL = 0

function addTerms(tf, text, weight) {
  tokenize(text).forEach(t => { tf[t] = (tf[t] || 0) + weight })
}

KB.forEach(item => {
  const tf = {}
  addTerms(tf, item.t, W_TITLE)
  addTerms(tf, (item.tags || []).join(' '), W_TAG)
  addTerms(tf, item.c, W_BODY)
  let dl = 0
  Object.keys(tf).forEach(t => { dl += tf[t] })
  const titleTokens = {}
  tokenize(item.t).forEach(t => { titleTokens[t] = 1 })
  DOCS.push({ item, tf, dl, titleTokens })
  Object.keys(tf).forEach(t => { DF[t] = (DF[t] || 0) + 1 })
})
AVGDL = DOCS.reduce((a, d) => a + d.dl, 0) / DOCS.length
const N = DOCS.length

// ---- 领域路由：问东盟就别让学院条目来抢，反之亦然 ----
// 语料只有 45 条时，跨域串味比召回不足更伤人（问"东盟旅游"答成插座电压）。
const SCHOOL_HINT = ['学校', '学院', '专业', '宿舍', '食堂', '图书馆', '实验室', '招生', '就业', '转专业', '校园', '学费', '老师', '课表', '报修', '快递', '校名', '校区', '实验']
const ASEAN_HINT = ['东盟', '东南亚', '泰国', '越南', '马来西亚', '新加坡', '印尼', '印度尼西亚', '菲律宾', '柬埔寨', '老挝', '缅甸', '文莱', '签证', '汇率', '货币', '口岸', 'rcep', '留学', '出国', '边检']

function countHints(q, hints) {
  let n = 0
  hints.forEach(h => { if (q.indexOf(h) >= 0) n++ })
  return n
}

// 口语问法短语：BM25 靠 bigram 抓不住"多少分能上"这类整句意图，
// 每条资料配几条常见问法，命中就保底进候选（norm 抬到 0.55）。
// 返回命中的短语长度而不是 true：短语越长意图越具体。
// "今年招多少人"会同时命中 办学规模 的"多少人"和 招生 的"招多少人"，
// 靠长度区分，后者优先，避免被泛化问法抢答。
function phraseHit(item, rawQuery) {
  const q = String(rawQuery || '').toLowerCase().replace(/\s+/g, '')
  if (!q) return 0
  const phrases = item.q || []
  let best = 0
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i].toLowerCase()
    if (q.indexOf(p) >= 0) {
      if (p.length > best) best = p.length
      continue
    }
    // 反向包含只在用户输入够长时才认，避免"学校"两个字把一堆条目都提上来
    if (q.length >= 4 && p.indexOf(q) >= 0) {
      // 反向匹配只算"部分命中"，长度打 6 折，排在正向命中之后
      const v = Math.floor(q.length * 0.6)
      if (v > best) best = v
    }
  }
  return best
}

function idf(t) {
  const df = DF[t] || 0
  if (!df) return 0
  // 加 0.5 平滑；df 越小越有区分度；本身命中不了的词直接 0 分
  return Math.log(1 + (N - df + 0.5) / (df + 0.5))
}

// bigram 之间的区分度差异：含虚词的 bigram 稍微降权
const WEAK_BIGRAM = /[的了是在和与及就都也还很太更最]/
function termWeight(t) {
  return WEAK_BIGRAM.test(t) ? 0.6 : 1
}

function scoreDoc(doc, qTokens, exTokens) {
  const norm = K1 * (1 - B + B * doc.dl / AVGDL)
  let s = 0
  qTokens.forEach(t => {
    const tf = doc.tf[t]
    if (!tf) return
    const w = idf(t) * termWeight(t)
    s += w * (tf * (K1 + 1)) / (tf + norm)
  })
  // 扩展词只给 0.28 权重，防止"东盟"把十国全捞出来
  exTokens.forEach(t => {
    const tf = doc.tf[t]
    if (!tf) return
    const w = idf(t) * termWeight(t) * 0.28
    s += w * (tf * (K1 + 1)) / (tf + norm)
  })
  return s
}

// 标题命中的比例：标题含用户问的词，通常就是正主
function titleRatio(doc, qTokens) {
  if (!qTokens.length) return 0
  let hit = 0
  qTokens.forEach(t => { if (doc.titleTokens[t]) hit++ })
  return hit / qTokens.length
}

// 字面覆盖率：用户这句话里的相邻两字，有多少真的出现在这条资料里。
// BM25 归一化分数（norm）在"整句只有一个词进词表"时会虚高——问"学校考研率多少"
// 能对上"学校身份与办学性质"，norm 直接给到 1，看起来像完美命中。
// 单字覆盖也不够：中文里"我/一/写"这种字到处都有，问"帮我写一篇论文"会蹭到教师简介。
// 所以按二字片段算，覆盖不到四成就判定"资料没写这条"，宁可拒答。
const QSTOP = /[吗呢吧啊嘛哦呀的了着过是在有和与及或也都就还又很太更最？，。、！；：\s"'“”‘’（）()]/g

// 疑问结构词：它们正好卡在两个词的接缝上，切出的是假片段——"医保怎么报销"
// 会切出「怎么」「么报」，而「重修怎么报名」正文里全有，于是一条无关资料被顶成答案。
// 先摘掉结构词，剩下的才是用户真在问的东西：医保报销、食堂开门。
const QMODAL = /怎么办|怎么样|怎么|怎样|如何|在哪|哪里|哪儿|多少|几点|几个|多久|多远|哪些|什么|为什么|是不是|能不能|可不可以|有没有/g

function coreQuery(q) {
  return String(q || '').replace(QSTOP, '').replace(QMODAL, '')
}

function charCover(item, query) {
  const q = coreQuery(query)
  if (q.length < 2) return 0
  // 标签和登记问法也算"这条资料里写过"：报修条目把「空调」放在标签里，
  // 正文只说"智慧报修"，不让标签参与覆盖就会把"空调坏了找谁修"判成查无资料。
  // 这两处都是人工维护的同义词，放宽不会把无关问题放进来。
  const body = (item.t || '') + (item.c || '') + (item.tags || []).join('') + (item.q || []).join('')
  const seen = {}
  let hit = 0
  let total = 0
  for (let i = 0; i < q.length - 1; i++) {
    const g = q.slice(i, i + 2)
    if (seen[g]) continue
    seen[g] = 1
    total++
    if (body.indexOf(g) >= 0) hit++
  }
  // 分母封顶 4：问句尾巴（"怎么交""能办吗"）会拖长片段数，一条对得上的
  // 资料反而被判成覆盖不足。封顶后，"宿舍电费"这类两句拼接的问法不会被稀释。
  return total ? hit / Math.min(total, 4) : 0
}

// 查询里的二字片段（去重），用来算"这几条资料加起来覆盖了多少"
function queryGrams(query) {
  const q = coreQuery(query)
  const out = []
  const seen = {}
  for (let i = 0; i < q.length - 1; i++) {
    const g = q.slice(i, i + 2)
    if (seen[g]) continue
    seen[g] = 1
    out.push(g)
  }
  return out
}

/**
 * 检索
 * 分数归一化到 0~1：score / (2.2 * 查询词 idf 之和)，2.2 = BM25 的 (k1+1) 上限，
 * 所以 norm 近似"查询意图被这条资料覆盖的比例"，比裸 BM25 分好定阈值。
 * @param {string} query 用户原话
 * @param {object} opt { topK, minNorm }
 * @returns {Array} [{ id, t, c, s, score, norm }]
 */
function retrieve(query, opt) {
  const o = opt || {}
  const topK = o.topK || 3
  const minNorm = typeof o.minNorm === 'number' ? o.minNorm : 0.22
  const minCover = typeof o.minCover === "number" ? o.minCover : 0.4
  const qTokens = tokenize(query)
  if (!qTokens.length) return []
  const uniqQ = []
  qTokens.forEach(t => { if (uniqQ.indexOf(t) < 0) uniqQ.push(t) })
  // 只问了一两个 bigram 时不扩展，短查询一扩展就跑到别的领域去了
  const ex = uniqQ.length >= 3 ? expand(uniqQ) : []
  const EX_W = 0.28

  let idfSum = 0
  uniqQ.forEach(t => { idfSum += idf(t) * termWeight(t) })
  // 查询词全不在词表里（比如问"天气"），说明知识库压根不涉及该话题。
  // 例外：资料里登记过的口语问法（"能借几本书"切成 能借/借几/几本/本书，一个都不在词表里），
  // 这种情况靠短语命中兜住，但仍然不放词表外的自由扩展，避免串味。
  if (idfSum <= 0 && !DOCS.some(d => phraseHit(d.item, query) > 0)) return []
  // 归一化分母：原始词 + 扩展词各自能达到的 BM25 上限之和
  let exIdfSum = 0
  ex.forEach(t => { exIdfSum += idf(t) * termWeight(t) })
  const denom = 2.2 * (idfSum + EX_W * exIdfSum)

  // 领域路由系数
  const raw = String(query || '')
  const aHits = countHints(raw, ASEAN_HINT)
  const sHits = countHints(raw, SCHOOL_HINT)
  let bias = null // 'asean' | 'school' | null
  if (aHits > 0 && sHits === 0) bias = 'asean'
  else if (sHits > 0 && aHits === 0) bias = 'school'

  const scored = DOCS.map(d => {
    let base = scoreDoc(d, uniqQ, ex)
    base *= 1 + 0.9 * titleRatio(d, uniqQ)
    if (bias) {
      const cat = d.item.cat || 'school'
      const same = bias === 'asean' ? cat === 'asean' : cat !== 'asean'
      base *= same ? 1.3 : 0.6
    }
    const ph = phraseHit(d.item, query)
    return { d, score: base, ph }
  })
    .filter(x => x.score > 0 || x.ph > 0)
    // 单条覆盖太低的不进候选；登记过的口语问法（ph>0）除外，那是人工确认过的
    .filter(x => x.ph > 0 || charCover(x.d.item, query) >= minCover * 0.5)
    // 先比口语短语的具体程度，再比 BM25 分
    .sort((a, b) => (b.ph - a.ph) || (b.score - a.score))

  const ranked = scored
    .map(x => {
      let norm = x.score / denom
      if (x.ph > 0) norm = Math.max(norm, 0.55)
      return { x, norm: Math.min(1, norm) }
    })
    .filter(o2 => o2.norm >= minNorm)

  // 再看这几条合起来覆盖了用户问的多少：一条问"宿舍电费"，
  // "宿舍配置"讲床位数、"易校园能办哪些事"讲怎么充值，各覆盖一半，
  // 合起来才算答得上。所以判断用前 6 条，返回只给前 topK 条。
  // 合起来都不够四成，说明知识库没这条，返回空让上层说"资料里没写"
  if (ranked.length && !ranked.some(o2 => o2.x.ph > 0)) {
    const qg = queryGrams(query)
    if (qg.length) {
      const body = ranked.slice(0, 6).map(o2 => (o2.x.d.item.t || '') + (o2.x.d.item.c || '')).join('')
      let hit = 0
      qg.forEach(g => { if (body.indexOf(g) >= 0) hit++ })
      if (hit / Math.min(qg.length, 4) < minCover) return []
    }
  }

  // 价格意图：库里没有实时价格（打车费、配送费、二手行情都不收）。
  // 问"打车到客运站多少钱"命中"公交怎么坐"，答的是路线不是价钱，仍属答非所问。
  // 只在资料自己写了钱数时才答，否则当作资料里没写。
  const PRICE_ASK = /多少钱|价格|价位|收费|费用|贵不贵|票价|几块钱|花多少/
  const PRICE_BODY = /元|价格|收费|费用|学费|票价|免费/
  const kept = PRICE_ASK.test(String(query || ''))
    ? ranked.filter(o2 => PRICE_BODY.test((o2.x.d.item.t || '') + (o2.x.d.item.c || '')))
    : ranked
  if (!kept.length) return []

  const hits = kept.slice(0, topK)

  return hits.map(o2 => ({
    id: o2.x.d.item.id,
    t: o2.x.d.item.t,
    c: o2.x.d.item.c,
    s: o2.x.d.item.s,
    score: Math.round(o2.x.score * 100) / 100,
    norm: Math.round(o2.norm * 1000) / 1000,
  }))
}

// 把命中片段拼成给模型看的参考块
function buildContext(hits) {
  if (!hits || !hits.length) return ''
  const lines = hits.map((h, i) => {
    const src = h.s && h.s.title ? `（来源：${h.s.ch || '学校官网'} · ${h.s.title}）` : ''
    return `[资料${i + 1}] ${h.t}${src}\n${h.c}`
  })
  return lines.join('\n\n')
}

module.exports = {
  retrieve,
  buildContext,
  tokenize,
  KB_SIZE,
  KB_SCHOOL_SIZE,
  KB_ASEAN_SIZE,
  KB_GEELY_SIZE,
}
