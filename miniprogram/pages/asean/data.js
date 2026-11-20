// pages/asean/data.js —— 东盟十国速查（本页独占，不改公共 utils/biz.js）
// 均为公开国情事实。签证/口岸政策易变，页面统一提示「以官方公告为准」。
// tz 为 UTC 偏移（小时），用于时差时钟；plug/voltage 供出行参考。

// 小程序不支持国旗 emoji 合成（会渲染成 TH/VN 字母），统一用单字徽标
const ABBR = { th: '泰', vn: '越', my: '马', sg: '新', id: '印', ph: '菲', kh: '柬', la: '老', mm: '缅', bn: '文' }

const COUNTRIES_RAW = [
  {
    id: 'th', n: '泰国', en: 'Thailand', flag: '🇹🇭',
    cap: '曼谷', lang: '泰语',
    cur: 'THB', curName: '泰铢', sym: '฿',
    tz: 7, code: '+66', voltage: '220V', plug: 'A/B/C 两脚扁插',
    visa: '互免', visaShort: '互免', visaNote: '中泰普通护照互免签证，停留期限以官方公告为准',
    best: '11月–次年2月', season: '凉季',
    tip: '佛教国家，进寺庙需遮肩过膝；小费非强制，打车优先用打表。',
  },
  {
    id: 'vn', n: '越南', en: 'Vietnam', flag: '🇻🇳',
    cap: '河内', lang: '越南语',
    cur: 'VND', curName: '越南盾', sym: '₫',
    tz: 7, code: '+84', voltage: '220V', plug: 'A/C 两脚',
    visa: '电子签/落地签', visaShort: '电子签', visaNote: '可申请电子签或按规定办理落地签，以使领馆公告为准',
    best: '11月–次年3月', season: '干季',
    tip: '盾面额大，换算先去掉三个零再除；河内与胡志明市气候差异明显。',
  },
  {
    id: 'my', n: '马来西亚', en: 'Malaysia', flag: '🇲🇾',
    cap: '吉隆坡', lang: '马来语',
    cur: 'MYR', curName: '林吉特', sym: 'RM',
    tz: 8, code: '+60', voltage: '240V', plug: 'G 型三脚（英标）',
    visa: '互免', visaShort: '互免', visaNote: '中马普通护照互免签证，停留期限以官方公告为准',
    best: '全年皆宜', season: '热带雨林',
    tip: '华人社区通行华语，槟城、马六甲饮食文化浓厚；需带英标转换头。',
  },
  {
    id: 'sg', n: '新加坡', en: 'Singapore', flag: '🇸🇬',
    cap: '新加坡', lang: '英语/华语',
    cur: 'SGD', curName: '新加坡元', sym: 'S$',
    tz: 8, code: '+65', voltage: '230V', plug: 'G 型三脚（英标）',
    visa: '互免', visaShort: '互免', visaNote: '中新普通护照互免签证，停留不超过30天，以官方公告为准',
    best: '全年皆宜', season: '热带',
    tip: '城市国家，地铁覆盖全岛；口香糖、榴莲在地铁内禁止；物价偏高。',
  },
  {
    id: 'id', n: '印度尼西亚', en: 'Indonesia', flag: '🇮🇩',
    cap: '雅加达', lang: '印尼语',
    cur: 'IDR', curName: '印尼盾', sym: 'Rp',
    tz: 7, code: '+62', voltage: '230V', plug: 'C/F 两脚圆插',
    visa: '落地签/电子签', visaShort: '落地签', visaNote: '可办理落地签或电子签，具体以使领馆公告为准',
    best: '5月–9月', season: '干季',
    tip: '横跨三个时区（本表按雅加达 UTC+7）；盾面额极大，注意数零。',
  },
  {
    id: 'ph', n: '菲律宾', en: 'Philippines', flag: '🇵🇭',
    cap: '马尼拉', lang: '菲律宾语/英语',
    cur: 'PHP', curName: '菲律宾比索', sym: '₱',
    tz: 8, code: '+63', voltage: '220V', plug: 'A/B/C 两脚',
    visa: '需签证', visaShort: '需签证', visaNote: '需提前办理签证，具体要求以使领馆公告为准',
    best: '11月–次年5月', season: '干季',
    tip: '英语普及率极高；群岛国家，岛间靠飞机与渡轮；夏秋多台风。',
  },
  {
    id: 'kh', n: '柬埔寨', en: 'Cambodia', flag: '🇰🇭',
    cap: '金边', lang: '高棉语',
    cur: 'KHR', curName: '瑞尔', sym: '៛',
    tz: 7, code: '+855', voltage: '230V', plug: 'A/C 两脚',
    visa: '电子签/落地签', visaShort: '电子签', visaNote: '可申请电子签或落地签，以使领馆公告为准',
    best: '11月–次年3月', season: '干季',
    tip: '美元在境内广泛流通，小额找零常用瑞尔；吴哥窟建议清晨入场。',
  },
  {
    id: 'la', n: '老挝', en: 'Laos', flag: '🇱🇦',
    cap: '万象', lang: '老挝语',
    cur: 'LAK', curName: '基普', sym: '₭',
    tz: 7, code: '+856', voltage: '230V', plug: 'A/B/C 两脚',
    visa: '落地签/电子签', visaShort: '落地签', visaNote: '可办理落地签或电子签，以官方公告为准',
    best: '11月–次年3月', season: '干季',
    tip: '东盟唯一内陆国；中老铁路已连通昆明与万象，陆路出行更方便。',
  },
  {
    id: 'mm', n: '缅甸', en: 'Myanmar', flag: '🇲🇲',
    cap: '内比都', lang: '缅甸语',
    cur: 'MMK', curName: '缅元', sym: 'K',
    tz: 6.5, code: '+95', voltage: '230V', plug: 'C/D/F 圆插',
    visa: '需签证', visaShort: '需签证', visaNote: '需提前办理签证；出行前请查看外交部安全提醒',
    best: '11月–次年2月', season: '凉季',
    tip: '东盟唯一 UTC+6:30 的半小时时区，比北京时间晚 1.5 小时。',
  },
  {
    id: 'bn', n: '文莱', en: 'Brunei', flag: '🇧🇳',
    cap: '斯里巴加湾市', lang: '马来语',
    cur: 'BND', curName: '文莱元', sym: 'B$',
    tz: 8, code: '+673', voltage: '240V', plug: 'G 型三脚（英标）',
    visa: '落地签', visaShort: '落地签', visaNote: '可办理落地签，具体停留期限以官方公告为准',
    best: '全年皆宜', season: '热带雨林',
    tip: '伊斯兰法国家，公共场所禁酒；文莱元与新加坡元等值互通。',
  },
]

const COUNTRIES = COUNTRIES_RAW.map((c) => Object.assign({}, c, { abbr: ABBR[c.id] || c.n.slice(0, 1) }))

// 场景短语：点击填入翻译输入框（不预置译文，避免出现错误机翻）
const PHRASES = [
  { g: '吃饭', list: ['这个多少钱？', '不要辣', '不要香菜', '我要一份这个', '可以打包吗'] },
  { g: '问路', list: ['洗手间在哪里？', '去这里怎么走？', '离这里远吗？', '请帮我叫一辆车'] },
  { g: '购物', list: ['能便宜一点吗？', '可以刷卡吗？', '有没有大一点的尺码？', '我只是看看'] },
  { g: '求助', list: ['请帮我报警', '我需要看医生', '我丢了护照', '我听不懂，请说慢一点'] },
]

// 出行清单（本机勾选，存 storage）
const CHECKLIST = [
  '护照有效期 6 个月以上，签证页已打印/截图',
  '已购买旅行意外险，保单存本地',
  '行程单、酒店地址已截图（离线可看）',
  '已保存中国领事服务网与 12308 热线',
  '带万能转换插头（新马文使用英标 G 型）',
  '兑换少量当地货币现金，小币种到当地换',
  '开通国际漫游或备好当地流量卡',
  '重要证件拍照存云端，与原件分开放',
]

// 快捷换算面额
const DENOMS = [100, 500, 1000, 2000]

module.exports = { COUNTRIES, PHRASES, CHECKLIST, DENOMS }
