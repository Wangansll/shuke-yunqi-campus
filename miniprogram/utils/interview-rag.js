// utils/interview-rag.js —— 面试引擎：按岗位 JD 出题 + 检索资料 + 本地评分
//
// 为什么评分放在本地而不是全交给模型：
// 1) 分数要可解释——每一分都能对应到"有没有说清背景/结果、有没有答到 JD 要点"；
// 2) 模型偶尔不可用，练习不能因为网络问题就变成"没有分数"；
// 3) 本地分可以写进自检断言，改坏了会被测出来。
// 模型负责两件本地做不了的事：像面试官一样追问，以及写一段人话点评。
const { retrieve } = require('./rag')

// 能力要点词表：JD 里出现即算"这题该答到的点"。
// 不用分词器，直接用领域词表命中，宁可少认几个，也别把"公司"这类词当考点。
const SKILLS = [
  '客诉', '客户', '8D', 'ISO', '质量管理', '质检', '检验', '工艺', '生产', '设备', '成本', '预算',
  '报表', '凭证', '会计', '审计', '税务', '财务', '教学', '课程', '备课', '课堂', '学生', '家长',
  '招生', '教研', '班主任', '教师资格', '销售', '渠道', '推广', '运营', '活动', '文案', '新媒体',
  '短视频', '直播', '品牌', '市场', '数据', '分析', 'SQL', 'Excel', 'PPT', 'Python', 'Java', '前端',
  '后端', '测试', '需求', '原型', '项目管理', '实施', '交付', '运维', '网络', '电路', '硬件', '结构',
  '设计', '图纸', '翻译', '口译', '笔译', '外语', '外贸', '报关', '物流', '仓储', '采购', '供应链',
  '人力', '招聘', '培训', '绩效', '行政', '法务', '合同', '安全', '环保', '建筑', '施工', '造价',
  '测量', '协调', '沟通', '团队', '抗压', '学习能力', '责任心',
].sort((a, b) => b.length - a.length)

const LEVELS = [
  {
    k: 'normal',
    n: '普通面试',
    s: '通用行为面',
    d: '自我介绍、求职动机、一段经历、优劣势与规划，按校招常规节奏走 5 题。',
    qn: 5,
  },
  {
    k: 'pro',
    n: '专业面试',
    s: '按机会的岗位方向',
    d: '先选一条吉利机会，题目从它的岗位方向、面向对象与流程环节里出，考点贴这个项目。',
    qn: 5,
  },
  {
    k: 'stress',
    n: '压力面试',
    s: '连环追问',
    d: '每答必追一层：问细节、问数据、问反例，练临场不慌、不被问穿。',
    qn: 4,
  },
]

const COMMON_Q = [
  '先做一个简短的自我介绍，说说你的专业、擅长方向，以及一段最能代表你的经历。',
  '你为什么想投吉利？在吉利、领克、极氪这些品牌里，你对哪个更有感觉，为什么？',
  '讲一段你在课程项目、实习或社团里遇到困难的经历：当时什么情况，你怎么处理的，最后什么结果。',
  '你觉得自己最大的优势是什么？短板又是什么，有没有在改？',
  '如果入职后先从一线或基础岗位轮岗，你能接受吗？说说你的想法。',
  '未来两三年你想成为什么样的人？希望这份工作给你什么。',
]

const STRESS_Q = [
  '一分钟介绍你自己，只讲跟这个岗位有关的部分，别铺垫。',
  '你说你擅长这件事，那举一个你没做好的例子——别挑成功的讲。',
  '如果明天让你接手一个你完全不会的任务，两天后交付，你怎么安排？',
  '刚才你提到的结果，有多少是你个人做的，多少是团队做的？说清楚。',
  '如果面试官现在告诉你「你不太合适」，你觉得最可能的原因是什么？',
]

const cut = (s, n) => String(s || '').replace(/^[\d\s、.．)）]+/, '').replace(/[；;。]$/, '').trim().slice(0, n)

// 从 JD 里抽考点：词表命中，去重后取前 8 个
function pointsOf(job) {
  if (!job || !job.detail) return []
  const text = [].concat(job.detail.duty || [], job.detail.req || []).join(' ')
  const hit = []
  SKILLS.forEach((w) => {
    if (text.indexOf(w) >= 0 && !hit.some((h) => h.indexOf(w) >= 0 || w.indexOf(h) >= 0)) hit.push(w)
  })
  // 吉利项目这类没有标准 JD 的岗：词表命中太少时，直接把岗位方向当考点，避免整场无要点可评
  if (hit.length < 3 && job.dirs && job.dirs.length) {
    job.dirs.forEach((d) => {
      const k = String(d || '').trim()
      if (k && !hit.some((h) => h.indexOf(k) >= 0 || k.indexOf(h) >= 0)) hit.push(k)
    })
  }
  return hit.slice(0, 8)
}

// 专业面题目：每条都从这条机会的原文里长出来，不问它之外的东西。
// 岗位方向（dirs）是唯一能当"工作内容"问的东西；流程环节只做背景，不能当职责——
// 否则会问出"这个岗位第一件事是「宣讲与报名」"这种不像面试官的题。
function proQuestions(job, n) {
  const qn = n || LEVELS[1].qn
  const d = (job && job.detail) || {}
  const dirs = (job && job.dirs) || []
  const req = d.req || []
  const posName = job ? (job.pos || job.co) : '这个岗位'
  const out = [
    `先做个自我介绍，重点说你跟「${posName}」最相关的一段经历。`,
  ]
  if (dirs.length && dirs.length <= 4) {
    out.push(`这个机会按「${dirs.join('」「')}」方向走，你更想走哪个，为什么？`)
    out.push(`以「${dirs[0]}」为重点，你做过最接近的一件事是什么？当时具体负责什么，结果怎么样？`)
  } else {
    // 宣讲场次没有岗位方向，就问他准备带着什么问题去现场
    out.push('这场宣讲你最想问企业什么？为什么这几件事对你重要。')
  }
  if (req[0]) out.push(`它对申请人的要求是「${cut(req[0], 30)}」，你符合吗？用一段经历说明。`)
  out.push(`对照这个机会的要求，你觉得自己最欠缺哪一条？打算怎么补。`)
  return out.slice(0, qn + 1)
}

// 每档的题目数组
function buildQuestions(level, job) {
  if (level === 'pro') return proQuestions(job)
  if (level === 'stress') return STRESS_Q.slice(0, LEVELS[2].qn)
  return COMMON_Q.slice(0, LEVELS[0].qn)
}

// RAG：把 JD 与知识库里相关的条目拼成资料块，交给模型当"面试官手里的材料"。
// 检索词用岗位名与职责原文，命中的是吉利文化、校企关系、专业设置这类站内事实。
function contextOf(job, level) {
  const lines = []
  if (job && job.detail) {
    const d = job.detail
    const join = (arr) => (arr || []).map((x) => String(x).replace(/[；;。]\s*$/, '')).join('；')
    lines.push('【岗位 JD】' + [
      job.pos || '',
      join(d.duty),
      join(d.req),
    ].filter(Boolean).join('｜'))
  }
  // 检索词不能拿整句岗位名去搜：JD 里的「6-8k 招聘1人」这类字会把匹配拉散，
  // 先取岗位核心词，再用一句通用探针兜底，两次结果去重。
  const probes = []
  if (job) {
    const core = String(job.pos || '')
      .replace(/\d+(\.\d+)?\s*k/gi, ' ')
      .replace(/招聘\s*\d+\s*人/g, ' ')
      .replace(/[|｜/]/g, ' ')
      .trim()
    if (core) probes.push(core)
  }
  probes.push('吉利 校园招聘 人才理念 企业文化')

  let hits = []
  probes.forEach((q) => {
    try {
      (retrieve(q, { topK: 2 }) || []).forEach((h) => {
        if (!hits.some((x) => x.id === h.id)) hits.push(h)
      })
    } catch (e) {}
  })
  hits.slice(0, 3).forEach((h) => {
    lines.push('【' + h.t + '】' + String(h.c || '').replace(/\s+/g, ' ').slice(0, 240))
  })
  return lines.join('\n')
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 单题评分：四个维度都是 0~1，加权成百分制。
// 有 JD 考点时，相关度占 28%；没有（普通面）就把权重让给结构与完整度。
function scoreAnswer(text, points, level) {
  const raw = String(text || '')
  const s = raw.replace(/\s+/g, '')
  const len = s.length
  const pts = points || []

  let fill = 0.18
  if (len >= 140) fill = 1
  else if (len >= 80) fill = 0.85
  else if (len >= 40) fill = 0.62
  else if (len >= 15) fill = 0.4

  const hitS = /当时|那时|背景|情况|学期|实习|项目里|在.{0,6}(期间|的时候)/.test(s)
  const hitT = /负责|任务|目标|要解决|需要|被安排/.test(s)
  const hitA = /我先|首先|然后|接着|最后|做法|方案|改成|调整|推动|拆成|沟通/.test(s)
  const hitR = /结果|最终|提升|下降|降低|达成|完成|拿到|节省|增长|缩短|从.{0,8}(到|变成)/.test(s)
  const struct = [hitS, hitT, hitA, hitR].filter(Boolean).length / 4

  const nums = (s.match(/\d+(\.\d+)?/g) || []).length
  const detail = Math.min(1, nums / 3) * 0.7 + (/因为|所以|导致|于是|原因是/.test(s) ? 0.3 : 0)

  const hit = pts.filter((p) => s.indexOf(p) >= 0)
  const miss = pts.filter((p) => s.indexOf(p) < 0)
  // 一道题只考一个侧面，不该要求它把整份 JD 的要点都覆盖：
  // 命中 1 个就有 50 分，2 个 72，3 个以上接近满分；一个没答到才 28。
  const rel = pts.length ? Math.min(1, 0.28 + 0.22 * hit.length) : null

  let score
  if (rel === null) score = fill * 0.34 + struct * 0.36 + detail * 0.3
  else score = fill * 0.24 + struct * 0.28 + detail * 0.2 + rel * 0.28
  if (len < 6) score = 0.08

  let tip = ''
  if (len < 15) tip = '太短了，面试官拿不到任何信息：先给结论，再补一个具体例子。'
  else if (!hitR) tip = '没有结果。补上可量化的变化，哪怕是「从 3 天缩到 1 天」。'
  else if (!hitS) tip = '没交代处境。先说清什么时候、什么场景、你面对什么约束。'
  else if (nums === 0) tip = '通篇没有数字，可信度会打折：人数、时长、比例，任选一个补上。'
  else if (rel !== null && miss.length && level === 'pro') tip = `这个岗位看重「${miss[0]}」，你的回答没提到，补一段相关经历。`
  else if (rel !== null && hit.length) tip = '答到点上了。再把「我做了什么」和「团队做了什么」分开，个人贡献更清楚。'
  else tip = '结构完整。可以再补一句「如果重来一次你会怎么改」，显得有复盘习惯。'

  return {
    pt: Math.round(clamp(score, 0, 1) * 100),
    dims: { fill, struct, detail, rel: rel === null ? fill : rel },
    hit,
    miss,
    tip,
    len,
  }
}

// 汇总：四项均分 + 总分 + 等级 + 一句总评
function summarize(records) {
  const rs = (records || []).filter((r) => r && r.dims)
  if (!rs.length) {
    return { total: 0, level: '未作答', dims: [], advice: '还没有作答记录。' }
  }
  const avg = (k) => rs.reduce((a, r) => a + (r.dims[k] || 0), 0) / rs.length
  const dims = [
    { k: 'struct', n: '结构与条理', v: Math.round(avg('struct') * 100) },
    { k: 'rel', n: '岗位匹配', v: Math.round(avg('rel') * 100) },
    { k: 'detail', n: '细节与数据', v: Math.round(avg('detail') * 100) },
    { k: 'fill', n: '表达完整度', v: Math.round(avg('fill') * 100) },
  ]
  const total = Math.round(dims.reduce((a, d) => a + d.v, 0) / dims.length)
  let level = '还需练习'
  if (total >= 85) level = '表现稳'
  else if (total >= 70) level = '有竞争力'
  else if (total >= 55) level = '能过关，要打磨'

  // 最弱的一项决定建议方向：分数低的那维优先补
  const weak = dims.slice().sort((a, b) => a.v - b.v)[0]
  const ADVICE = {
    struct: '最弱的是结构：每题按「什么情况 → 我要解决什么 → 我做了什么 → 结果如何」四句走。',
    rel: '最弱的是岗位匹配：把 JD 里的关键词逐个对上自己的经历，没经历的就说怎么补。',
    detail: '最弱的是细节：少说「提升了效率」，多说「从几小时压到几分钟、覆盖多少人」。',
    fill: '最弱的是完整度：回答别只一句，至少交代背景、动作、结果三层。',
  }
  return { total, level, dims, advice: ADVICE[weak.k] || '' }
}

module.exports = {
  LEVELS, SKILLS,
  pointsOf, proQuestions, buildQuestions, contextOf, scoreAnswer, summarize,
  COMMON_Q, STRESS_Q,
}
