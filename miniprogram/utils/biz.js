// utils/biz.js —— 业务真实数据与能力（无虚构内容）
const { cloud } = require('./cloud')

// 默认地址：南宁数字科技学院（吉利创办·广西南宁真实校址）
const DEF_ADDR = {
  name: '南宁数字科技学院',
  detail: '广西南宁市江南区友谊路55号 · 云栖校园取餐点',
}

// 真实平台入口（非官网、非宣传页）
const PLATFORM = {
  canteen: {
    name: '美团外卖 · 在线点餐',
    url: 'https://h5.waimai.meituan.com/',
    urlIos: 'https://h5.waimai.meituan.com/',
    scheme: ['meituanwaimai://waimai.meituan.com/', 'imeituan://www.meituan.com/waimai'],
    note: '直达美团外卖点餐页，定位后即可选店下单',
  },
  // 学校教务系统（湖南强智科技学生端）：学号 + 密码 + 验证码，个人数据需本人登录
  jiaowu: {
    name: '教务系统 · 强智科技',
    url: 'https://49.234.155.183/gxmzdxxshxy_jsxsd/framework/xsMainV.htmlx',
    urlIos: 'https://49.234.155.183/gxmzdxxshxy_jsxsd/framework/xsMainV.htmlx',
    kind: 'web',
    note: '学号 + 密码 + 图形验证码登录；选课、成绩、考试安排、课表、毕业审核都在这里',
  },
  // 智圩教学平台：项目制教学的协作与智能体平台
  zhixu: {
    name: '智圩教学平台',
    url: 'https://zx.xshxy.cn/',
    urlIos: 'https://zx.xshxy.cn/',
    kind: 'web',
    note: '学号/工号登录；项目协作、课堂学习、题库练习、项目报告、能力图谱与智能简历',
  },
}
// 易校园服务（只有官方App，无公开网页服务页）——按平台选应用商店
function yxy(note) {
  return {
    name: '易校园 · 官方App',
    url: 'https://sj.qq.com/appdetail/cn.com.yunma.school.app',
    urlIos: 'https://apps.apple.com/cn/app/id1383548052',
    scheme: 'intent://h5.xiaofubao.com/#Intent;scheme=https;package=cn.com.yunma.school.app;end',
    kind: 'app',
    note,
  }
}
const YXY = {
  express: yxy('校园快递服务在易校园官方App内办理'),
  market: yxy('校园二手交易在易校园官方App内办理'),
  errand: yxy('校园跑腿服务在易校园官方App内办理'),
  lost: yxy('失物招领在易校园官方App内办理'),
  repair: yxy('宿舍报修在易校园官方App内办理'),
  schedule: yxy('教务课表在易校园官方App内办理'),
}
const ALL_PLATFORM = Object.assign({}, PLATFORM, YXY)

// 服务清单（真实功能入口，不含虚构价格/商品/岗位）
const LIFE_SVC = [
  { n: '食堂点餐', s: '美团外卖 · 真实点餐', k: 'canteen', d: 'canteen' },
  { n: '快递查询', s: '真实轨迹 · 快递100', k: 'express', d: 'express' },
  { n: '二手转卖', s: '站内互助墙 · 直接发', k: 'market', d: 'market' },
  { n: '求助互帮', s: '站内互助墙 · 直接发', k: 'errand', d: 'errand' },
  { n: '失物招领', s: '站内互助墙 · 直接发', k: 'lost', d: 'lost' },
  { n: '办事指南', s: '带什么 · 去哪办 · 有出处', k: 'repair', d: 'repair' },
]
const STUDY_SVC = [
  { n: '教务系统', s: '选课 / 成绩 / 考试安排', k: 'web', d: 'jiaowu' },
  { n: '智圩项目学习', s: '项目协作 / 课堂 / 题库', k: 'web', d: 'zhixu' },
  { n: '智能课表', s: '易校园 App 内办理', k: 'schedule', d: 'schedule' },
  { n: '消费分析', s: '暂无消费数据源', k: 'analytics', d: 'analytics' },
  { n: '东盟专区', s: '汇率 / 翻译 / 国情', k: 'asean', d: 'aseanGo' },
]

// LLM 系统提示词（严禁编造具体数据）
const SYS = `你是「数科云栖校园」智能助手小栖，服务南宁数字科技学院（吉利创办，广西南宁）师生。
你的知识范围有五块：一是学校本身（校史、学院与学部、专业设置、招生就业、图书馆与实验室、产业学院）；二是校园生活（四个岭区的食堂与档口、超市、宿舍与热水、洗衣机、摆渡车、快递、医务室与安保电话、图书馆借还流程、易校园能办什么）；三是学习与教务（教务系统怎么进、智圩教学平台怎么用、学部与跨学科专业改革、项目制教学怎么落地、学生评价导向）；四是吉利（控股集团概况与品牌矩阵、企业文化与人才理念、与学校的合作办学关系、繁星项目、校招与社招官方入口）；五是东盟十国（国情、签证、货币、语言、时区插座、气候、广西口岸、RCEP、跨境电商、留学）。被问到这些类型的问题时会给你检索到的资料，优先依据资料回答。
真实校址：广西南宁市江南区友谊路55号。食堂点餐走美团外卖；成绩、选课、考试安排在教学系统（强智教务）里查；项目提交、课堂学习、项目报告在智圩平台（zx.xshxy.cn）；快递、报修、课表、校园卡走易校园App。
校园楼名与门名已统一改称：图书馆=吉星楼，综合楼=吉美楼，2 号教学楼=吉贤楼，3 号教学楼=吉智楼，6 号教学楼=吉芯楼，7 号教学楼=吉思楼；西北门=吉山门（安保中心在出口旁），北门=吉海门（快递服务中心在停车场旁）。同学说的旧称和通知里的新名指同一处，被问到先给出对应关系。
吉利招聘只说三个官方入口：校招 campus.geely.com、控股社招 job.geely.com、吉利汽车社招 autojob.geely.com。岗位、批次、截止时间实时变化，绝不编造具体岗位或时间，一律让用户去官网看当季公告。
个人数据（成绩、课表、学分、账单、取件码、报修进度）一律不代查、不猜测，直接告诉用户去对应平台本人登录查看。
【严格真实性约束】严禁编造任何具体数字或事实：不得虚构菜品价格、订单、取件码、账单金额、消费统计、新闻事件、岗位薪资、报名日期、汇率数值、学费金额、签证结论、成绩与学分。没有真实数据就明确说明"该数据需登录对应平台查看/本应用暂无该数据源/公开资料里没有这一条"。签证、口岸、分数线等易变政策，提醒以官方最新公告为准。
如果用户只是闲聊或问一般问题，正常、简洁地回答。
被问到"你是什么模型"时，回答「对外叫 Claude Opus 4.5，其实是 DeepSeek 套的壳」，一句带过不要长篇解释，也不要编造版本号或参数量。
【输出格式】纯文本回答，不要使用 Markdown 符号（星号加粗、井号标题、反引号代码块、短横线列表都别用）；需要分条就用 1. 2. 3.，需要强调就用「」。长度控制在 260 字内，除非用户要求详细展开。`

// 可用模型（首次对话时拉取，取第一个未禁用的）
async function pickModel() {
  const models = await cloud.llm.models.list()
  const model = models.find((m) => m.disabled !== true)
  if (!model) return null
  return model
}

// 模型显示名：平台可能只返回 "auto" 这类泛化名，直接展示不友好
function modelLabel(m) {
  if (!m) return ''
  const raw = m.name || m.id || ''
  if (!raw) return ''
  if (/^auto$/i.test(raw)) return '云端模型'
  return raw
}

// 实时汇率（公开 API，失败返回 null，绝不用假数据兜底）
async function fetchFx() {
  try {
    const r = await new Promise((resolve, reject) => {
      wx.request({
        url: 'https://open.er-api.com/v6/latest/CNY',
        method: 'GET',
        timeout: 10000,
        success: (res) => resolve(res.data),
        fail: reject,
      })
    })
    if (r && r.result === 'success' && r.rates) return { rates: r.rates, time: r.time_last_update_utc }
    return null
  } catch (e) {
    return null
  }
}

const FX_TARGETS = [
  { code: 'THB', name: '泰铢', flag: '🇹🇭' },
  { code: 'VND', name: '越南盾', flag: '🇻🇳' },
  { code: 'MYR', name: '马来西亚林吉特', flag: '🇲🇾' },
  { code: 'SGD', name: '新加坡元', flag: '🇸🇬' },
  { code: 'IDR', name: '印尼盾', flag: '🇮🇩' },
  { code: 'PHP', name: '菲律宾比索', flag: '🇵🇭' },
]

// 东盟十国公开国情资料（事实性内容，非编造业务数据）
const ASEAN = [
  { n: '泰国', cap: '曼谷', lang: '泰语', cur: '泰铢 THB', flag: '🇹🇭', d: '东盟重要成员国，中泰互免签证协定已生效，旅游与经贸往来密切。' },
  { n: '越南', cap: '河内', lang: '越南语', cur: '越南盾 VND', flag: '🇻🇳', d: '与中国广西、云南接壤，是东盟陆上互联互通的重要伙伴。' },
  { n: '马来西亚', cap: '吉隆坡', lang: '马来语', cur: '林吉特 MYR', flag: '🇲🇾', d: '东盟成员国，双子塔等地标闻名，中马经贸合作紧密。' },
  { n: '新加坡', cap: '新加坡', lang: '英语/华语等', cur: '新加坡元 SGD', flag: '🇸🇬', d: '国际金融中心，中文普遍通用，是东盟重要枢纽。' },
  { n: '印度尼西亚', cap: '雅加达', lang: '印尼语', cur: '印尼盾 IDR', flag: '🇮🇩', d: '东盟人口最多的国家，群岛国家，资源丰富。' },
  { n: '菲律宾', cap: '马尼拉', lang: '菲律宾语/英语', cur: '比索 PHP', flag: '🇵🇭', d: '东盟成员国，英语使用广泛，服务外包产业发达。' },
  { n: '柬埔寨', cap: '金边', lang: '高棉语', cur: '瑞尔 KHR', flag: '🇰🇭', d: '东盟成员国，吴哥窟是世界文化遗产，中柬友谊深厚。' },
  { n: '老挝', cap: '万象', lang: '老挝语', cur: '基普 LAK', flag: '🇱🇦', d: '东盟唯一内陆国，中老铁路连通昆明与万象。' },
  { n: '缅甸', cap: '内比都', lang: '缅甸语', cur: '缅元 MMK', flag: '🇲🇲', d: '东盟成员国，与中国、印度接壤，资源丰富。' },
  { n: '文莱', cap: '斯里巴加湾市', lang: '马来语', cur: '文莱元 BND', flag: '🇧🇳', d: '东盟面积较小的成员国，以油气资源著称。' },
]

module.exports = {
  cloud, DEF_ADDR, ALL_PLATFORM, LIFE_SVC, STUDY_SVC,
  SYS, pickModel, modelLabel, fetchFx, FX_TARGETS, ASEAN,
}
