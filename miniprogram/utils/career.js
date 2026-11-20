// utils/career.js —— 吉利校招 / 社招
//
// 只收吉利系：吉利控股、吉利汽车集团、吉利汽车研究院、极氪、领克、沃尔沃、极星、
// 路特斯、宝腾、吉利百矿、绿色慧联、远程新能源等。就业网上代发的其他企业招聘一概不进，
// 那些不是本项目的一手信息，装进来只会让人误以为是吉利的岗。
//
// 数据原则同全项目：每条都对应学校官网/吉利官网的一篇原文，岗位名、对象、流程照原文摘；
// 原文没写的（薪资、截止时间、名额）一律不补，也不替官方补年份。

// 吉利系企业名，用来兜底校验：将来加数据时若不在这个范围，自检会拦下来
const FAMILY_RE = /吉利|极氪|领克|沃尔沃|极星|路特斯|宝腾|百矿|耀宁|时空道宇|绿色慧联|睿蓝|远程新能源/

// 机会类型：培养项目排在最前（学校官网发得最多，也是本校学生真能报的），
// 「全部」永远第一格，想看完整 7 条点它
const KINDS = [
  { k: 'all', n: '全部' },
  { k: 'prog', n: '培养项目' },
  { k: 'job', n: '正式岗' },
  { k: 'intern', n: '实习' },
  { k: 'talk', n: '宣讲' },
]

const OPP = [
  {
    id: 'baikuang-2025',
    kind: 'job',
    title: '吉利百矿集团 2025 年春季校园招聘',
    org: '吉利百矿集团',
    d: '2025-04-27',
    target: '应届毕业生（财务管理、市场营销、金融工程等专业）',
    dirs: ['资金专员', '人力资源专员'],
    scale: '200 余个岗位',
    sum: '集团人才招聘经理到场宣讲，现场按「一对一」面试推进，重点考察专业理论、实践创新与团队协作。',
    flow: ['企业宣讲：发展历程、产业布局与人才需求', '现场一对一面试', '面试后按集团流程推进'],
    url: 'https://www.gxxshxy.edu.cn/info/1200/25550.htm',
  },
  {
    id: 'xingli-2026',
    kind: 'job',
    title: '吉利汽车研究院「基石计划·星砾」2026 届',
    org: '吉利汽车研究院（宁波）',
    d: '3月26日',
    target: '2026 届毕业生（已通过星砾项目全流程考核的学员）',
    dirs: ['人工智能', '车辆工程'],
    scale: '本校 5 人获研发岗 offer',
    sum: 'offer 授予仪式在宁波前湾新区研究院二期举行。星砾是研究院「基石计划」的核心组成，走的是从实习生到正式研发人才的内生培养路径。',
    flow: ['进入研究院实习', '星砾项目全流程考核', 'offer 授予与签约'],
    url: 'http://lgxy.xshxy.cn/info/1021/3530.htm',
  },
  {
    id: 'jike-intern',
    kind: 'intern',
    title: '极氪直播实习生项目',
    org: '极氪（浙江极氪智能科技）',
    d: '4月29日',
    target: '在校学生（宣讲在综合楼一楼报告厅，文传学院组织）',
    dirs: ['助理实习主播', '助理短视频编导'],
    scale: '',
    sum: '极氪与高校共同发起、以联合招生和定向培养为目的的汽车直播人才储备项目。宣讲现场讲了岗位要求、转正流程、薪资与福利。',
    flow: ['宣讲与报名', '联合招生 / 定向培养', '实习期考核', '转正'],
    url: 'https://www.gxxshxy.edu.cn/info/1200/23527.htm',
  },
  {
    id: 'fanxing-22',
    kind: 'prog',
    title: '吉利繁星「2+2」预备役',
    org: '吉利汽车集团（人才发展集团推进）',
    d: '9月13日',
    target: '大三学生，育人关口前置到大三学年',
    dirs: ['销售顾问', '新媒体运营', '区域储备营销大雁', '传播大雁'],
    scale: '',
    sum: '「基石计划」的重点产教融合项目，四段递进：校内专业积淀 → 门店实战历练 → 返校学业补全 → 大四岗位进阶。集训结营后进吉利各品牌一线门店做实岗。',
    flow: ['校内集训与专业能力认证', '一线门店岗位实战', '返校补全学业', '转繁星「3+1」做岗位进阶'],
    url: 'https://www.gxxshxy.edu.cn/info/1402/26795.htm',
  },
  {
    id: 'fanxing-3',
    kind: 'prog',
    title: '吉利繁星项目三期',
    org: '吉利汽车集团销售总公司',
    d: '9月13日',
    target: '繁星学员（新能源销售与新媒体方向）',
    dirs: ['新媒体运营', '零售管理'],
    scale: '',
    sum: '三期走「基石集训 — 岗前认证 — 门店淬炼」全链条，八天集训后做岗前认证，按知识、技能、实战、思维、职业素养五个维度认证，过线才进门店。',
    flow: ['开营与基石集训', '岗前认证（五维标准）', '门店淬炼'],
    url: 'https://www.gxxshxy.edu.cn/info/1402/26796.htm',
  },
  {
    id: 'xingrui-class',
    kind: 'prog',
    title: '吉利星睿数据智能创新班（第三期）',
    org: '吉利星睿数据智能产业学院（与吉利汽车研究院共建）',
    d: '3月12日',
    target: '大二、大三学生',
    dirs: ['数据智能', '项目实践'],
    scale: '',
    sum: '学院下设创新班与 X-Lab 菁英班，分别面向大二、大三，以项目化实践、学科竞赛、企业实习为主。宣讲里明确企业筛简历看三样：项目经历、竞赛获奖、组织协调。',
    flow: ['宣讲与报名', '进班做项目 / 参赛', '企业实习'],
    url: 'http://lgxy.xshxy.cn/info/1022/3517.htm',
  },
  {
    id: 'geely-global-25',
    kind: 'talk',
    title: '吉利控股集团 25 届全球校招高管校园见面会',
    org: '吉利控股集团',
    d: '10月9日',
    target: '25 届毕业生',
    dirs: [],
    scale: '授「吉利人才森林大学生人才供给基地」牌匾',
    sum: '远程新能源商用车集团副总裁、吉利汽车工程高研院执行院长到场宣讲。该计划面向 100 所高校，本校是吉利教育体系内 10 所受牌高校之一。',
    flow: ['高管宣讲与企业文化分享', '现场交流', '按官网批次网申'],
    url: 'https://www.gxxshxy.edu.cn/info/1199/24784.htm',
  },
]

// 原文里出现过的去向，用来告诉学弟学妹「这些项目最后去哪些岗」
// 只摘原文写明的单位与岗位，不推断
const OUTCOMES = [
  { who: '信工 4 人', to: '吉利汽车研究院（宁波）', pos: '软件系统集成 / 座舱感知开发 / 系统维护', url: 'http://lgxy.xshxy.cn/info/1021/3535.htm' },
  { who: '数科 5 人', to: '吉利汽车研究院', pos: '研发岗（人工智能、车辆工程等）', url: 'http://lgxy.xshxy.cn/info/1021/3530.htm' },
  { who: '26 届 1 人', to: '杭州吉利共享服务有限公司', pos: '项目管理（走「基石计划」入职）', url: 'http://lgxy.xshxy.cn/info/1025/3553.htm' },
]

// 社招：只放吉利自己的官方入口。岗位由官网实时发布，本应用不转录、不猜在招状态。
const SOCIAL = [
  {
    id: 's-holding',
    n: '吉利控股集团社会招聘',
    u: 'job.geely.com',
    url: 'https://job.geely.com/',
    d: '控股集团层面的社招入口，覆盖汽车、科技、商用车等业务集团，可按业务集团与企业筛岗位。',
  },
  {
    id: 's-auto',
    n: '吉利汽车集团社会招聘',
    u: 'autojob.geely.com',
    url: 'https://autojob.geely.com/',
    d: '吉利汽车集团单独发布的社招入口，与控股入口分开，投递前先确认岗位归属哪个集团。',
  },
]

// 校招官网：网申、笔试测评、面试安排都在里面推进
const CAMPUS = {
  n: '吉利校园招聘官网',
  u: 'campus.geely.com',
  url: 'https://campus.geely.com/',
  d: '面向应届生与在校实习生。批次、岗位、笔试与面试安排由官网实时更新，本应用只做入口，不抄它的岗位表。',
}

const kindName = (k) => {
  const x = KINDS.find((i) => i.k === k)
  return x ? x.n : ''
}

// 列表项：补上类型名与「原文日期」，模板直接用
const LIST = OPP.map((o) => Object.assign({}, o, {
  kindName: kindName(o.kind),
  dirTxt: (o.dirs || []).join(' / '),
}))

function byKind(k, kw) {
  const q = String(kw || '').trim().toLowerCase()
  return LIST.filter((o) => {
    if (k && k !== 'all' && o.kind !== k) return false
    if (!q) return true
    const s = [o.title, o.org, o.target, o.dirTxt, o.sum].join(' ').toLowerCase()
    return s.indexOf(q) >= 0
  })
}

const findById = (id) => LIST.find((o) => o.id === id) || null

// 面试引擎要的岗位形态：环节当职责、面向对象与方向当要求。
// 只搬原文写过的内容，不把「规模」「来源」这类元信息塞进 JD —— 那会让面试官问出
// 「你怎么证明本校 5 人拿到 offer」这种不像话的题。
function asJob(id) {
  const o = findById(id)
  if (!o) return null
  const duty = (o.flow || []).slice()
  const req = []
  // 要求只取面向对象；方向单独走 job.dirs 出题，否则同一句会被问两遍
  if (o.target) req.push('面向' + o.target)
  else if (o.dirs && o.dirs.length) req.push('方向：' + o.dirs.join(' / '))
  return {
    url: o.id,
    co: o.org,
    pos: o.title,
    d: o.d,
    dirs: o.dirs || [],
    detail: { duty, req, intro: o.sum },
  }
}

// —— 本地状态：收藏、投递进度、准备清单 ——
// 都只存本机，不代投、不上传。页面上要跟用户讲清这一点，不能让人以为点了就投出去了。
const K_FAV = 'careerFav'
const K_APPLY = 'careerApply'
const K_PREP = 'careerPrep'

const readFav = () => wx.getStorageSync(K_FAV) || []
const readApply = () => wx.getStorageSync(K_APPLY) || {}
const readPrep = () => wx.getStorageSync(K_PREP) || {}

function toggleFav(id) {
  const fav = readFav()
  const i = fav.indexOf(id)
  if (i >= 0) fav.splice(i, 1)
  else fav.unshift(id)
  wx.setStorageSync(K_FAV, fav)
  return fav.indexOf(id) >= 0
}

// 投递进度：未记录 → 已投递 → 进面试 → 有结果 → 未记录（点一下推进一档）
const APPLY_STEPS = [
  { k: '', n: '未记录', cls: '' },
  { k: 'sent', n: '已投递', cls: 'st-sent' },
  { k: 'iv', n: '进面试', cls: 'st-iv' },
  { k: 'done', n: '有结果', cls: 'st-done' },
]
function applyOf(id) {
  const map = readApply()
  const k = map[id] || ''
  return APPLY_STEPS.find((s) => s.k === k) || APPLY_STEPS[0]
}
function nextApply(id) {
  const map = readApply()
  const i = APPLY_STEPS.findIndex((s) => s.k === (map[id] || ''))
  const nx = APPLY_STEPS[(i + 1) % APPLY_STEPS.length]
  if (!nx.k) delete map[id]
  else map[id] = nx.k
  wx.setStorageSync(K_APPLY, map)
  return nx
}

// 投递材料清单：吉利校招/社招都要的东西，勾选状态存本机
const PREP_ITEMS = [
  { k: 'cv', n: '简历（一页，写清项目与实习）', d: '吉利筛简历看项目经历、竞赛、组织协调三样' },
  { k: 'score', n: '成绩单', d: '教务系统可导出，盖章以学校要求为准' },
  { k: 'xueji', n: '学籍在线验证报告', d: '学信网申请，有效期通常 6 个月' },
  { k: 'cert', n: '证书与作品', d: '四六级、竞赛、直播/短视频作品链接' },
  { k: 'id', n: '身份证与照片', d: '正反面扫描件、白底证件照' },
  { k: 'jd', n: '把项目要求存下来', d: '面试前对着岗位方向与环节逐条准备例子' },
]

module.exports = {
  OPP: LIST, KINDS, OUTCOMES, SOCIAL, CAMPUS, APPLY_STEPS, PREP_ITEMS,
  FAMILY_RE, byKind, findById, asJob, kindName,
  readFav, readApply, readPrep, toggleFav, applyOf, nextApply,
  K_FAV, K_APPLY, K_PREP,
}
