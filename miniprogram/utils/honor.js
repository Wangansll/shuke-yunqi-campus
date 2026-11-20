// utils/honor.js —— 五个荣誉 + 头衔
//
// 命名与配色按用户定的规则：
//   先驱者      —— 2026-12-20 前登入活动：金；之后登入：铜
//   资料补充者  —— 交课表 / 补材料 / 补上缺失的信息：铜
//   纠错贡献者  —— 订正错误、提交 bug、指出内容或页面问题并被采纳：铜
//   意见反馈者  —— 提改进建议、说体验问题（功能或流程上的意见）：铜
//   校园共建者  —— 前三项里参与过两项及以上，作为统称：银
//
// 头衔取「已获得里最高的那一枚」：金 > 银 > 铜；同样金属取排在前面的。

// 活动截止：2026-12-20 23:59:59（东八区）
const DEADLINE = Date.UTC(2026, 11, 20, 15, 59, 59)
const DEADLINE_TEXT = '2026-12-20'

const METALS = {
  gold: { k: 'gold', n: '金', em: '金', rank: 3 },
  silver: { k: 'silver', n: '银', em: '银', rank: 2 },
  bronze: { k: 'bronze', n: '铜', em: '铜', rank: 1 },
}

const HONORS = [
  {
    k: 'pioneer', n: '先驱者', metal: 'pioneer',
    d: '12 月 20 日前登入活动',
    long: '活动期内（' + DEADLINE_TEXT + ' 前）就登进来用过。这类人比谁都早，金色留给最早的一批；之后登入的是铜色，同样算参与过。',
    need: 1,
  },
  {
    k: 'docs', n: '资料补充者', metal: 'bronze',
    d: '交课表、补材料、补上缺失的信息',
    long: '提交过资料、课表或条目，把站里缺的东西补齐。',
    need: 1,
  },
  {
    k: 'fix', n: '纠错贡献者', metal: 'bronze',
    d: '订正错误、提交 bug',
    long: '指出内容错误或页面问题并被采纳，改掉的每一条都算。',
    need: 1,
  },
  {
    k: 'idea', n: '意见反馈者', metal: 'bronze',
    d: '提改进建议、说体验问题',
    long: '提交过功能或流程上的意见，不管是嫌哪一步麻烦还是想要什么。',
    need: 1,
  },
  {
    k: 'builder', n: '校园共建者', metal: 'silver',
    d: '前三项里有两项及以上',
    long: '资料、纠错、建议三项中参与过两项以上，作为前面几项的统称荣誉。',
    need: 2,
  },
]

// 统计口径：都由「本机真实发生过的动作」算，不写死
//   docs  资料：有课表算 1 条，加上「资料补充」类反馈、自己发过的互助条目
//   fixes 纠错：纠错类反馈
//   ideas 建议：建议类反馈
//   firstAt 首次登入时间
const compute = (stat, now) => {
  const s = stat || {}
  const t = now || Date.now()
  const docs = (Number(s.tt) > 0 ? 1 : 0) + (Number(s.fbDocs) || 0) + (Number(s.posts) || 0)
  const fixes = Number(s.fbFix) || 0
  const ideas = Number(s.fbIdea) || 0
  const parts = [docs > 0, fixes > 0, ideas > 0].filter(Boolean).length
  const firstAt = Number(s.firstAt) || 0

  return HONORS.map((h) => {
    let got = false
    let metal = h.metal
    let prog = ''
    if (h.k === 'pioneer') {
      got = firstAt > 0
      metal = firstAt > 0 && firstAt <= DEADLINE ? 'gold' : 'bronze'
      prog = got
        ? (metal === 'gold' ? '已在 ' + DEADLINE_TEXT + ' 前登入' : '在活动期之后登入')
        : '还没登入过'
    } else if (h.k === 'docs') {
      got = docs >= h.need
      prog = '资料 ' + docs + ' 条'
    } else if (h.k === 'fix') {
      got = fixes >= h.need
      prog = '纠错 ' + fixes + ' 条'
    } else if (h.k === 'idea') {
      got = ideas >= h.need
      prog = '建议 ' + ideas + ' 条'
    } else {
      got = parts >= 2
      prog = '已参与 ' + parts + '/3 项'
    }
    return {
      k: h.k, n: h.n, d: h.d, long: h.long, need: h.need,
      got, metal, metalName: METALS[metal].n, rank: METALS[metal].rank, prog,
      left: h.k === 'pioneer' ? 0 : Math.max(0, h.need - (h.k === 'docs' ? docs : h.k === 'fix' ? fixes : h.k === 'idea' ? ideas : parts)),
      deadline: h.k === 'pioneer' ? DEADLINE : 0,
      // 倒计时：还没到截止时提示还剩几天
      daysLeft: h.k === 'pioneer' ? Math.max(0, Math.ceil((DEADLINE - t) / 86400000)) : 0,
    }
  })
}

// 头衔只显示一枚：默认取最高的那一枚；用户可以从「已获得」里自己选一枚长期显示。
// 只存荣誉 key（不存金属色）——金属色随统计实时算：先驱者会因登入时间变金/铜，
// 所以选了也不会过期。选的头衔若哪天不再满足（数据被清），自动回退到最高级。

const K_PICK = 'honor_title_pick_v1'

// 选中的荣誉 key，按 openid（唯一键）分份存；没登录时用本机默认份。
// 只存 key 不存金属色——先驱者会因登入时间变金/铜，选了也不会过期。
// 注意：这里读写用 try 包住，Node 自检环境没有 wx 时取空，行为自动回退最高级。
const pickKey = (oid) => (oid ? K_PICK + '::' + oid : K_PICK)
const readPick = (oid) => {
  try {
    if (oid) {
      const own = wx.getStorageSync(pickKey(oid))
      if (own) return own // 这个账号自己选过
    }
    return wx.getStorageSync(K_PICK) || ''
  } catch (e) { return '' }
}
const writePick = (k, oid) => {
  try {
    wx.setStorageSync(K_PICK, k || '') // 本机默认份：给不带 openid 的调用方（发帖页）读
    if (oid) wx.setStorageSync(pickKey(oid), k || '') // 账号唯一键份：换设备登录能恢复
  } catch (e) {}
}
// 登录时把账号那份导入本机默认，让 titleOf() 无参调用也认当前账号的选择
const adoptPick = (oid) => {
  try {
    const own = oid && wx.getStorageSync(pickKey(oid))
    if (own !== undefined && own !== null) wx.setStorageSync(K_PICK, own || '')
  } catch (e) {}
}

// 已获得的荣誉，按金属等级从高到低
const gained = (stat, now) => compute(stat, now).filter((x) => x.got)
  .sort((a, b) => (b.rank - a.rank) || 0)

// 头衔：用户选的那枚仍在「已获得」里就用它，否则取最高的一枚。
// picked 显式传入时优先用它（方便调用方传临时值）；不传则读本机记忆。
const titleOf = (stat, now, picked) => {
  const g = gained(stat, now)
  if (!g.length) return null
  const want = picked || readPick()
  const chosen = (want && g.filter((x) => x.k === want)[0]) || g[0]
  return {
    k: chosen.k, n: chosen.n, metal: chosen.metal, metalName: chosen.metalName, rank: chosen.rank,
  }
}

const emptyTitle = { n: '新同学', metal: 'none', metalName: '', rank: 0 }

// 按头衔显示名反查金属色：旧帖只存了纯文字，拆回奖杯时用。
// 先驱者的金属随时间（活动截止）变，按当前时间给；其余用该荣誉的基准金属。
const hasName = (n) => HONORS.some((x) => x.n === String(n || '').trim())
const metalOfName = (n) => {
  const h = HONORS.filter((x) => x.n === String(n || '').trim())[0]
  if (!h) return ''
  if (h.k === 'pioneer') return Date.now() <= DEADLINE ? 'gold' : 'bronze'
  return h.metal
}

module.exports = {
  DEADLINE, DEADLINE_TEXT, METALS, HONORS, compute, gained, titleOf, emptyTitle,
  K_PICK, readPick, writePick, adoptPick, hasName, metalOfName,
}
