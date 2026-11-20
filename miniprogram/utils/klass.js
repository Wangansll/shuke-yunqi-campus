// utils/klass.js —— 班级索引：《23计科4班》，也可只到年级专业《23计科》
//
// 四件事：
//   1) 班名归一成《年级 + 专业简称 [+ 班号] + 班》，如「23计算机科学与技术4班」→《23计科4班》
//      班号可省：写「23计科」就是只记年级专业，不带班
//   2) 建过的班不能再建，换个写法（全称/简称、04/4、带《》）也算同一个班，一并拦下
//   3) 存成一份本地索引，我的页里可以直接选一个当自己的班级
//   4) 也可以完全不用班级：选「不设班级」，课表就存一份公共的
//
// 专业简称取自学校招生网公布的本科专业（utils/kb-school.js 里那份名单），不是自己编的。

const K_LIST = 'class_index_v1'
const K_CUR = 'class_cur_v1'

// 专业：全称 / 常见写法 → 简称。匹配时取最长命中，避免「数字媒体技术」被「数字媒体艺术」截胡
const MAJORS = [
  { s: '计科', f: ['计算机科学与技术', '计算机科学技术', '计算机'] },
  { s: '软工', f: ['软件工程'] },
  { s: '网工', f: ['网络工程'] },
  { s: '人工智能', f: ['人工智能技术', '人工智能'] },
  { s: '机器人', f: ['机器人工程', '机器人'] },
  { s: '大数据', f: ['数据科学与大数据技术', '数据科学', '大数据'] },
  { s: '虚拟现实', f: ['虚拟现实技术', '虚拟现实'] },
  { s: '区块链', f: ['区块链工程', '区块链'] },
  { s: '数媒技', f: ['数字媒体技术'] },
  { s: '数媒艺', f: ['数字媒体艺术'] },
  { s: '安工', f: ['安全工程'] },
  { s: '法学', f: ['法学'] },
  { s: '营销', f: ['市场营销'] },
  { s: '财管', f: ['财务管理'] },
  { s: '物流', f: ['物流管理'] },
  { s: '供应链', f: ['供应链管理'] },
  { s: '旅管', f: ['旅游管理'] },
  { s: '烹饪', f: ['烹饪与营养教育'] },
  { s: '税收', f: ['税收学'] },
  { s: '国贸', f: ['国际经济与贸易'] },
  { s: '跨境电商', f: ['跨境电子商务'] },
  { s: '审计', f: ['审计学'] },
  { s: '汉文', f: ['汉语言文学'] },
  { s: '网媒', f: ['网络与新媒体'] },
  { s: '编导', f: ['广播电视编导'] },
  { s: '播音', f: ['播音与主持艺术'] },
  { s: '泰语', f: ['泰语'] },
  { s: '印尼语', f: ['印度尼西亚语'] },
  { s: '英语', f: ['英语'] },
  { s: '越南语', f: ['越南语'] },
  { s: '动画', f: ['动画'] },
  { s: '视传', f: ['视觉传达设计'] },
  { s: '环设', f: ['环境设计'] },
  { s: '产设', f: ['产品设计'] },
  { s: '服装', f: ['服装与服饰设计'] },
  { s: '舞蹈', f: ['舞蹈表演'] },
  { s: '艺教', f: ['艺术教育'] },
  { s: '社体', f: ['社会体育指导与管理'] },
  { s: '体教', f: ['体育教育'] },
]

// 用户可能写成「计科」「软工」这种简称，也要能反过来认出来
const SHORTS = MAJORS.map((m) => m.s)

const clean = (s) => String(s || '')
  .replace(/[《》〈〉<>「」【】\s·．.]/g, '')
  .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
  .replace(/[（(][^）)]*[）)]/g, '')
  .replace(/[级届]/g, '')
  .replace(/专业|学院|系/g, '')

const majorOf = (raw) => {
  const t = String(raw || '')
  if (!t) return null
  let best = null
  let bestLen = 0
  MAJORS.forEach((m) => {
    const names = m.f.concat([m.s])
    names.forEach((n) => {
      if (t.indexOf(n) >= 0 && n.length > bestLen) { best = m; bestLen = n.length }
    })
  })
  return best
}

// 「不使用班级」：当前班为空时的显示，课表存公共那份
const NONE_KEY = ''
const NONE_TEXT = '不设班级'

// 解析：认得出就返回 { ok:true, k, g, m, no, major }，认不出返回 { ok:false, why }
// 班号可省：写「23计科」得到 k='23计科'（只到年级专业），写「23计科4班」得到 k='23计科4班'
const parse = (input) => {
  const t = clean(input)
  if (!t) return { ok: false, why: '先写班级，如《23计科4班》或《23计科》' }
  // 「不使用班级」的几种写法
  if (/^(不设|不填|不用|无|公共|默认)(班级|班)?$/.test(t)) {
    return { ok: true, none: true, k: NONE_KEY, g: '', m: '', no: '' }
  }
  // 年级：23 / 2023 都收，统一成两位
  let g = ''
  let rest = t
  const m4 = t.match(/^(20\d{2})/)
  if (m4) { g = m4[1].slice(2); rest = t.slice(4) }
  else {
    const m2 = t.match(/^(\d{2})/)
    if (m2) { g = m2[1]; rest = t.slice(2) }
  }
  if (!g) return { ok: false, why: '缺年级，写成《23计科4班》，前面两位是入学年份' }
  // 班号可省：结尾的「4班」「4」都当班号；没有也能过（只到年级专业）
  const mn = rest.match(/(\d{1,2})班?$/)
  const no = mn ? String(Number(mn[1])) : ''
  const mid = mn ? rest.slice(0, rest.length - mn[0].length) : rest
  const major = majorOf(mid)
  const m = major ? major.s : mid
  if (!m) return { ok: false, why: '缺专业，写成《23计科4班》或《23计科》' }
  const k = g + m + (no ? no + '班' : '')
  return { ok: true, k, g, m, no, major: major ? major.s : '', custom: !major, whole: !!no }
}

const display = (k) => (k ? '《' + k + '》' : NONE_TEXT)

const read = () => {
  let v = null
  try { v = wx.getStorageSync(K_LIST) } catch (e) { v = null }
  return Array.isArray(v) ? v : []
}

const write = (list) => {
  try { wx.setStorageSync(K_LIST, (list || []).slice(0, 80)) } catch (e) {}
}

const has = (k) => read().some((x) => x.k === k)

// 新建：同班（含换个写法）一律不建，把已有的那个还回去，让用户直接选
// 「不使用班级」不进索引：它只是把当前班清空
const add = (input) => {
  const p = parse(input)
  if (!p.ok) return { ok: false, why: p.why }
  if (p.none) {
    try { wx.setStorageSync(K_CUR, NONE_KEY) } catch (e) {}
    return { ok: true, none: true, k: NONE_KEY }
  }
  const list = read()
  const hit = list.filter((x) => x.k === p.k)[0]
  if (hit) return { ok: false, why: 'exists', k: p.k, item: hit }
  const item = { k: p.k, g: p.g, m: p.m, no: p.no, whole: !!p.whole, custom: !!p.custom, ts: Date.now() }
  list.push(item)
  write(list)
  return { ok: true, k: p.k, item }
}

const current = () => {
  let k = null
  try { k = wx.getStorageSync(K_CUR) } catch (e) { k = null }
  // 没存过，或存的是已建过的班，都认；空串是用户主动选的「不设班级」
  if (k === NONE_KEY) return NONE_KEY
  return k && has(k) ? k : ''
}

const pick = (k) => {
  // 空串 = 不设班级，允许直接选
  if (k && k !== NONE_KEY && !has(k)) return { ok: false, why: '这个班还没建过' }
  try { wx.setStorageSync(K_CUR, k || NONE_KEY) } catch (e) {}
  return { ok: true, k: k || NONE_KEY }
}

// 我的页要用的整包：索引列表（首项是「不设班级」）+ 当前班
const snapshot = () => {
  const cur = current()
  const opts = [{ k: NONE_KEY, text: NONE_TEXT, none: true, cur: cur === NONE_KEY }]
  read().forEach((x) => opts.push(Object.assign({}, x, { text: display(x.k), cur: x.k === cur })))
  return { list: opts, cur, curText: display(cur) }
}

module.exports = {
  K_LIST, K_CUR, NONE_KEY, NONE_TEXT, MAJORS, SHORTS,
  parse, display, read, write, has, add, current, pick, snapshot, majorOf, clean,
}
