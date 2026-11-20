// _pagecheck.js —— 页面行为自测（wx mock，不需要开发者工具）
//
// 为什么要这个：静态检查只保证"标签闭合、语法没问题"，但抓不到两类真 bug：
//   1. WXML 里 bindtap="xxx" 绑了一个 JS 里不存在的方法（点了没反应，最容易漏）；
//   2. 页面逻辑在"云端不可用"时该降级却没降级（本机会不会丢数据、会不会假装成功）。
// 这个脚本把 wx 换成内存 mock，真跑 onShow / submit / load，断言结果。
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, 'miniprogram')
let PASS = 0
let FAIL = 0
function ok(name, cond, extra) {
  if (cond) { PASS++; console.log('  ok  ' + name) }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')) }
}
function eq(name, actual, expect) {
  ok(name + ' = ' + JSON.stringify(expect), JSON.stringify(actual) === JSON.stringify(expect), 'got ' + JSON.stringify(actual))
}

// ---------- wx mock ----------
const store = {}
const calls = { toast: [], nav: [], phone: [], clip: [] }
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  showToast: (o) => { calls.toast.push(o && o.title) },
  showModal: (o) => { if (o && o.success) o.success({ confirm: false }) },
  navigateTo: (o) => { calls.nav.push(o.url) },
  switchTab: (o) => { calls.nav.push(o.url) },
  makePhoneCall: (o) => { calls.phone.push(o.phoneNumber) },
  setClipboardData: (o) => { calls.clip.push(o.data); if (o.success) o.success() },
  pageScrollTo: (o) => { if (o && o.success) o.success() },
  chooseMedia: () => {},
  getSystemInfoSync: () => ({ platform: 'android', windowWidth: 375 }),
  setNavigationBarTitle: () => {},
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wx5cbc370db8d288e9' } }),
  getFileSystemManager: () => ({ saveFileSync: () => {} }),
  env: { USER_DATA_PATH: '/tmp' },
  cloud: undefined,   // 关键：默认没有云开发，走本机降级分支
}
global.getApp = () => ({
  pendingQuestion: '',
  authReady: Promise.resolve({ data: null }),
  ensureSession: () => Promise.resolve({ data: null }),
  resetSession: () => {},
})
global.getCurrentPages = () => [{ route: 'pages/home/index' }]

// ---------- 页面加载器 ----------
function loadPage(rel) {
  const abs = path.join(ROOT, rel)
  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(abs)]
  require(abs)
  if (!cfg) throw new Error('Page() 没有被调用：' + rel)
  return cfg
}
function instance(cfg) {
  const inst = Object.assign({}, cfg)
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}))
  inst.setData = function (patch, cb) { Object.assign(this.data, patch); if (cb) cb() }
  return inst
}
// wxml 里绑定的方法，JS 里必须存在
function checkHandlers(rel, cfg) {
  const wxml = fs.readFileSync(path.join(ROOT, rel.replace(/\.js$/, '.wxml')), 'utf8')
  const re = /\b(?:bind|catch):?([a-zA-Z]+)\s*=\s*"([A-Za-z_$][\w$]*)"/g
  let m
  const missing = []
  while ((m = re.exec(wxml))) {
    const fn = m[2]
    if (typeof cfg[fn] !== 'function') missing.push(fn)
  }
  return Array.from(new Set(missing))
}

console.log('\n=== 1. 数据模块：校园资料 ===')
const campus = require('./miniprogram/utils/campus')
ok('四岭齐全', campus.ZONES.length === 4, 'got ' + campus.ZONES.length)
eq('每个岭都有设施', campus.ZONES.map((z) => z.items.length > 0), [true, true, true, true])
eq('食堂按岭对应', campus.CANTEENS.map((c) => c.zone), ['一岭', '二岭', '三岭', '四岭', '数科'])
ok('摆渡车时刻来自原文', campus.SHUTTLE.hours === '7:20—22:40', campus.SHUTTLE.hours)
ok('医务室电话可拨', campus.PHONES.some((p) => p.tel === '0771-4772523'))
ok('没有编造食堂价格', JSON.stringify(campus.CANTEENS).indexOf('元') < 0, '出现了"元"字，可能在编价格')

console.log('\n=== 2. utils/db：云端不可用时必须落本机且不假装成功 ===')
const db = require('./miniprogram/utils/db')
;(async () => {
  const r1 = await db.add(db.REPAIR, { zone: '三岭', room: '3 栋 412', type: '水电（跳闸 / 漏水 / 水压）', desc: '洗手台下面漏水', urgent: false })
  eq('云端没开时 synced', r1.synced, false)
  ok('有降级原因', !!r1.why, 'why 为空')
  ok('工单号可读', /^BX/.test(r1.no), r1.no)
  const mine1 = await db.mine(db.REPAIR, 10)
  eq('本机能读回自己那单', mine1.items.length, 1)
  eq('单号一致', mine1.items[0].no, r1.no)

  console.log('\n=== 3. 办事指南页（25 件事：带什么 / 怎么办 / 去哪办 / 出处） ===')
  const guideCfg = loadPage('pages/guide/index.js')
  const missingG = checkHandlers('pages/guide/index.js', guideCfg)
  eq('wxml 绑定的方法都存在', missingG, [])
  // 先把数据本身审一遍：办事指南的底线是"每件都说清带什么、去哪办、依据什么"
  const DAILY = require('./miniprogram/data/guide').DAILY
  eq('25 件事', DAILY.length, 25)
  ok('每件都有出处', DAILY.every((x) => !!x.src))
  ok('每件至少 3 步', DAILY.every((x) => (x.steps || []).length >= 3))
  ok('每件都有材料清单', DAILY.every((x) => Array.isArray(x.need)))
  ok('每件都写了办理方式', DAILY.every((x) => ['线上', '线下', '线上+线下'].indexOf(x.way) >= 0))
  ok('每件都写了去哪办', DAILY.every((x) => (x.where || []).length > 0))
  ok('相关事项都真实存在', DAILY.every((x) => (x.rel || []).every((r) => DAILY.some((y) => y.k === r))))
  ok('没有编造的手机号', DAILY.every((x) => !/1\d{10}/.test(JSON.stringify(x))))
  // 报修与交电费：两件最常办的事，得能在办事页里照着做，而不是只给一句话
  const dRepair = DAILY.find((x) => x.k === 'repair')
  const dPower = DAILY.find((x) => x.k === 'power')
  ok('报修与交电费都进了办事指南', !!dRepair && !!dPower)
  ok('报修给到校园管理部的真号码', !!dRepair && JSON.stringify(dRepair.where).indexOf('0771-4772547') >= 0)
  ok('交电费写清了四项要填对', !!dPower && dPower.steps.join('').indexOf('楼层') >= 0)
  ok('报修不承诺上门时限', !!dRepair && dRepair.due.indexOf('没有公开承诺') >= 0)
  ok('两件事互相指得到', !!dRepair && !!dPower && dRepair.rel.indexOf('power') >= 0 && dPower.rel.indexOf('repair') >= 0)
  const gsr = require('./miniprogram/utils/search').search
  // 新增四件日常事：热水 / 洗衣机 / 共享电单车 / 改版楼名，全部取自已有校园资料
  const dWater = DAILY.find((x) => x.k === 'water')
  const dLaundry = DAILY.find((x) => x.k === 'laundry')
  const dBike = DAILY.find((x) => x.k === 'bike')
  const dBuild = DAILY.find((x) => x.k === 'buildings')
  ok('热水直饮水有 App 与供水时段', !!dWater && dWater.steps.join('').indexOf('慧生活798') >= 0 && /06:00/.test(dWater.due))
  ok('洗衣机按岭分品牌', !!dLaundry && /小依/.test(dLaundry.steps.join('')) && /企鹅/.test(dLaundry.steps.join('')) && /蓝牙/.test(dLaundry.steps.join('')))
  ok('电单车讲清 P 点与禁停区', !!dBike && /P 点/.test(dBike.steps.join('')) && /禁停/.test(dBike.steps.join('')))
  ok('楼名对照覆盖吉美吉贤吉智吉芯吉思', !!dBuild && ['吉星楼', '吉美楼', '吉贤楼', '吉智楼', '吉芯楼', '吉思楼', '吉山门', '吉海门'].every((n) => dBuild.steps.join('').indexOf(n) >= 0))
  eq('“洗澡没热水”去热水', ((gsr(DAILY, '宿舍洗澡没热水')[0] || {}).d || {}).k, 'water')
  eq('“洗衣机怎么用”去洗衣', ((gsr(DAILY, '洗衣机怎么用')[0] || {}).d || {}).k, 'laundry')
  eq('“电单车怎么还”去电单车', ((gsr(DAILY, '共享电单车怎么还车')[0] || {}).d || {}).k, 'bike')
  eq('“吉美楼在哪”去楼名对照', ((gsr(DAILY, '吉美楼在哪')[0] || {}).d || {}).k, 'buildings')
  ok('热门词收录新事项', /热水/.test(fs.readFileSync(path.join(ROOT, 'pages/guide/index.js'), 'utf8')))
  // 第二批：有出处的站内流程 3 件 + 仅入口卡 3 件
  const dCard = DAILY.find((x) => x.k === 'card')
  const dMed = DAILY.find((x) => x.k === 'medical')
  const dSick = DAILY.find((x) => x.k === 'sicknote')
  ok('校园卡挂失补办有真电话和工本费', !!dCard && /卡挂失/.test(dCard.steps.join('')) && /20 元/.test(dCard.steps.join('')) && /0771-4772547/.test(JSON.stringify(dCard.where)))
  ok('医保明确写细则未公开、先打电话', !!dMed && /没有收录/.test(dMed.steps.join('')) && /0771-4772523/.test(JSON.stringify(dMed.where)))
  ok('病假条衔接医务室与销假', !!dSick && /校医室/.test(dSick.steps.join('')) && /销假/.test(dSick.steps.join('')))
  const entries = DAILY.filter((x) => x.entryOnly)
  eq('仅入口卡正好 3 件', entries.length, 3)
  ok('入口卡都标 entryOnly 且带外链', entries.every((x) => x.entryOnly === true && x.entry && x.entry.kind === 'link'))
  ok('入口卡都写明不代查/不代登录', entries.every((x) => /本人登录/.test(x.steps.join('')) && /不代查/.test(x.steps.join(''))))
  ok('入口卡有个人登录电话', entries.every((x) => (x.where || []).some((w) => w.tel)))
  eq('“学费怎么交”进学费入口卡', ((gsr(DAILY, '学费怎么交')[0] || {}).d || {}).k, 'fee')
  eq('“成绩在哪查”进成绩入口卡', ((gsr(DAILY, '成绩在哪里查')[0] || {}).d || {}).k, 'scores')
  ok('页面渲染仅入口徽标与提示条',
    /entry-only/.test(fs.readFileSync(path.join(ROOT, 'pages/guide/index.wxml'), 'utf8')) &&
    /entry-note/.test(fs.readFileSync(path.join(ROOT, 'pages/guide/index.wxml'), 'utf8')))
  const routeOf = (q) => (gsr(DAILY, q)[0] || {}).d
  eq('“宿舍没电了”去交电费', (routeOf('宿舍没电了怎么办') || {}).k, 'power')
  eq('“宿舍空调坏了”去报修', (routeOf('宿舍空调坏了') || {}).k, 'repair')
  eq('“宿舍灯不亮”去报修', (routeOf('宿舍灯不亮') || {}).k, 'repair')
  eq('“宿舍欠费了”去交电费', (routeOf('宿舍欠费了') || {}).k, 'power')
  const gd = instance(guideCfg)
  gd.onLoad({})
  eq('默认筛选是全部', gd.data.filter, '全部')
  eq('列表默认 25 条', gd.data.view.length, 25)
  gd.pickFilter({ currentTarget: { dataset: { k: '教务' } } })
  eq('教务筛选生效', gd.data.view.length, 8)
  const firstK = gd.data.view[0].k
  gd.toggle({ currentTarget: { dataset: { k: firstK } } })
  eq('展开生效', gd.data.openK, firstK)
  ok('展开后有材料清单', Array.isArray(gd.data.open.need) && gd.data.open.need.length > 0)
  ok('展开后有去处', Array.isArray(gd.data.open.where) && gd.data.open.where.length > 0)
  gd.toggleNeed({ currentTarget: { dataset: { k: firstK, i: 0 } } })
  eq('勾材料后进度记上', gd.data.open.doneN, 1)
  gd.toggleFav({ currentTarget: { dataset: { k: firstK } } })
  eq('收藏进我的办事', gd.data.favCards.length, 1)
  gd.setData({ q: '请假', filter: '全部' })
  gd.refresh()
  ok('搜索标题能命中', gd.data.view.some((x) => /请假/.test(x.t)), JSON.stringify(gd.data.view.map((x) => x.k)))
  gd.setData({ q: '取件码' })
  gd.refresh()
  ok('搜材料名也能命中', gd.data.view.length === 1 && gd.data.view[0].k === 'express', JSON.stringify(gd.data.view.map((x) => x.k)))
  gd.setData({ q: '' })
  gd.refresh()
  gd.toggle({ currentTarget: { dataset: { k: firstK } } })
  eq('再点收起', gd.data.openK, '')

  // ---- 路线编排：地点表 + 排程行为 + 页面交互 ----
  const G = require('./miniprogram/data/guide')
  const { buildRoute, routeText } = require('./miniprogram/utils/route')
  ok('地点表覆盖全部线下事项', G.DAILY.every((d) => !G.AT[d.k] || !!G.PLACES[G.AT[d.k]]))
  ok('纯线上事项没有地点', !G.AT.retake && !G.AT.xueji && !G.AT.mind)
  ok('每个地点都标了时段来源', Object.keys(G.PLACES).every((k) => G.PLACES[k].known === true || typeof G.PLACES[k].src === 'string'))
  const rt1 = buildRoute(['leave', 'exam', 'clinic'], { start: '09:00' })
  eq('同栋楼的两件事排在相邻时段', rt1.steps[0].area, rt1.steps[1].area)
  ok('每步都有时段', rt1.steps.every((x) => !!x.winLabel))
  ok('估算时段被标出来', rt1.steps.some((x) => x.known === false))
  ok('共用材料能识别', rt1.shared.length >= 1, JSON.stringify(rt1.shared.map((x) => x.label)))
  const rt2 = buildRoute(['exam', 'leave'], { start: '17:00' })
  ok('下班后不硬塞时间', rt2.blocked.length === 1 && rt2.steps.length === 1)
  ok('排不进时说明了原因', /下班|时间不够/.test(rt2.blocked[0].why), rt2.blocked[0].why)
  const rt3 = buildRoute(['retake', 'xueji', 'mind'])
  eq('纯线上不出门', rt3.steps.length, 0)
  eq('纯线上都归到手机办', rt3.online.length, 3)
  const rt4 = buildRoute(['leave', 'exam', 'clinic', 'express']).steps
  ok('路线里同一个地点只出现一次', rt4.every((x, i) => rt4.findIndex((y) => y.place === x.place) === i))
  ok('路线文本没有未渲染的星号', routeText(rt1).indexOf('**') < 0)
  gd.startRoute()
  eq('进入选择态', gd.data.routeOn, true)
  gd.pickItem({ currentTarget: { dataset: { k: 'leave' } } })
  gd.pickItem({ currentTarget: { dataset: { k: 'express' } } })
  eq('选中 2 件', gd.data.picked.length, 2)
  gd.pickItem({ currentTarget: { dataset: { k: 'leave' } } })
  eq('再点取消选中', gd.data.picked.length, 1)
  gd.pickItem({ currentTarget: { dataset: { k: 'leave' } } })
  gd.genRoute()
  ok('生成了路线', !!(gd.data.route && gd.data.route.steps.length), JSON.stringify(gd.data.route && gd.data.route.steps.map((x) => x.place)))
  ok('路线可复制成文本', String(gd.data.routeTxt).indexOf('办事路线') === 0)
  gd.setStart({ detail: { value: '11:00' } })
  ok('改出发时间会重算', gd.data.route.steps[0].arrive !== '09:10')
  gd.closeRoute()
  eq('关闭后回到列表', gd.data.route, null)
  gd.stopRoute()
  eq('退出选择态', gd.data.routeOn, false)

  console.log('\n=== 4. 互助墙页 ===')
  const boardCfg = loadPage('pages/board/index.js')
  const missingB = checkHandlers('pages/board/index.js', boardCfg)
  eq('wxml 绑定的方法都存在', missingB, [])
  const bd = instance(boardCfg)
  bd.onLoad({})
  await bd.load()
  eq('初始无内容', bd.data.items.length, 0)
  bd.data.title = '捡到一把钥匙'
  bd.data.desc = '一岭三栋楼下花坛边上，挂着熊猫挂件'
  bd.data.contact = '微信 xiaoqi'
  await bd.submit()
  eq('发布后列表 1 条', bd.data.items.length, 1)
  ok('分类名渲染正确', bd.data.items[0].catName === '失物招领', bd.data.items[0].catName)
  ok('标记为自己发的', bd.data.items[0].isMine === true)
  ok('云端不通时给了说明', !!bd.data.cloudNote, 'cloudNote 为空')
  // 分类筛选
  bd.data.catIndex = 1
  bd.data.title = '出个台灯'
  bd.data.desc = '九成新，四岭自提'
  await bd.submit()
  bd.data.curCat = 'lost'
  await bd.load()
  eq('筛失物招领只剩 1 条', bd.data.items.length, 1)
  bd.data.curCat = 'all'
  await bd.load()
  eq('切回全部 2 条', bd.data.items.length, 2)

  console.log('\n=== 5. 校园导览页 ===')
  const lifeCfg = loadPage('pages/life/index.js')
  const missingL = checkHandlers('pages/life/index.js', lifeCfg)
  eq('wxml 绑定的方法都存在', missingL, [])
  const lf = instance(lifeCfg)
  eq('四个岭都带上图标', lf.data.zones.every((z) => z.items.every((i) => !!i.icon)), true)
  lf.dial({ currentTarget: { dataset: { tel: '0771-4770110' } } })
  eq('拨号走了 makePhoneCall', calls.phone[calls.phone.length - 1], '0771-4770110')
  lf.dial({ currentTarget: { dataset: {} } })
  eq('没电话的条目不会瞎拨', calls.phone.length, 1)
  lf.pickTab({ currentTarget: { dataset: { k: 'food' } } })
  eq('切换 tab', lf.data.tab, 'food')

  console.log('\n=== 6. 首页 / 服务页 / 我的页：新入口接线 ===')
  for (const p of ['pages/home/index.js', 'pages/service/index.js', 'pages/me/index.js', 'pages/express/index.js']) {
    const cfg = loadPage(p)
    const miss = checkHandlers(p, cfg)
    eq(p + ' wxml 绑定的方法都存在', miss, [])
  }
  const homeCfg = loadPage('pages/home/index.js')
  const h = instance(homeCfg)
  h.goReport()
  h.goLife()
  ok('首页能进办事指南', calls.nav.indexOf('/pages/guide/index') >= 0, JSON.stringify(calls.nav))
  ok('首页能进导览', calls.nav.indexOf('/pages/life/index') >= 0, JSON.stringify(calls.nav))

  const svcCfg = loadPage('pages/service/index.js')
  const sv = instance(svcCfg)
  sv.openDetail({ currentTarget: { dataset: { d: 'repair' } } })
  sv.openDetail({ currentTarget: { dataset: { d: 'lost' } } })
  sv.openDetail({ currentTarget: { dataset: { d: 'market' } } })
  sv.openDetail({ currentTarget: { dataset: { d: 'errand' } } })
  ok('服务页报修位进办事指南', calls.nav.indexOf('/pages/guide/index') >= 0)
  ok('服务页失物进互助墙', calls.nav.indexOf('/pages/board/index?cat=lost') >= 0)
  ok('服务页二手进互助墙', calls.nav.indexOf('/pages/board/index?cat=second') >= 0)
  ok('服务页求助进互助墙', calls.nav.indexOf('/pages/board/index?cat=help') >= 0)
  sv.openDetail({ currentTarget: { dataset: { d: 'canteen' } } })
  ok('食堂点餐进站内档口页', calls.nav.indexOf('/pages/canteen/index') >= 0)
  sv.openDetail({ currentTarget: { dataset: { d: 'express' } } })
  ok('快递进查询页', calls.nav.indexOf('/pages/express/index') >= 0)

  console.log('\n=== 7. 互助墙带分类参数进来 ===')
  const bd2 = instance(boardCfg)
  bd2.onLoad({ cat: 'second' })
  eq('URL 参数生效', bd2.data.curCat, 'second')
  bd2.onLoad({ cat: 'second', new: '1' })
  eq('new=1 直接展开发布面板', bd2.data.showForm, true)

  console.log('\n=== 8. 页面路径：代码里跳到的地方必须真存在 ===')
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  const declared = new Set(appJson.pages)
  const jsFiles = []
  ;(function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f)
      if (fs.statSync(p).isDirectory()) {
        if (f === 'node_modules' || f === 'miniprogram_npm') continue
        walk(p)
      } else if (p.endsWith('.js')) jsFiles.push(p)
    }
  })(ROOT)
  const badPaths = []
  const seen = new Set()
  for (const f of jsFiles) {
    const s = fs.readFileSync(f, 'utf8')
    const re = /['"](\/pages\/[A-Za-z0-9_]+)\/index(?:\?[^'"]*)?['"]/g
    let m
    while ((m = re.exec(s))) {
      const route = m[1].replace(/^\//, '') + '/index'
      seen.add(route)
      if (!declared.has(route)) badPaths.push(route + ' ← ' + path.relative(ROOT, f))
    }
  }
  eq('所有跳转目标都在 app.json 里', Array.from(new Set(badPaths)), [])
  ok('确实扫到了跳转（不是空跑）', seen.size >= 6, '只扫到 ' + seen.size + ' 个路由')

  console.log('\n=== 9. 环境自检脚本本身不能崩 ===')
  const health = require('./miniprogram/utils/health')
  const hr = await health.runChecks()
  eq('自检项都返回了结果', hr.items.length, 8)
  ok('能算出正常项数', typeof hr.okCount === 'number' && hr.total === 8)
  ok('没有云开发时不会误报全绿', hr.allOk === false, '竟然全绿了')
  ok('每项都有中文说明', hr.items.every((x) => !!x.n && !!x.d), JSON.stringify(hr.items.map((x) => x.n)))

  console.log('\n=== 10. 小栖"接着办"：一句话要能接到具体页面 ===')
  const { actsFor } = require('./miniprogram/utils/acts')
  eq('报修类 → 办事指南', actsFor('宿舍洗手台漏水了怎么办').map((a) => a.u), ['/pages/guide/index'])
  eq('失物类 → 互助墙失物', actsFor('捡到一把钥匙交到哪').map((a) => a.u), ['/pages/board/index?cat=lost'])
  eq('二手类 → 互助墙二手', actsFor('想收个二手台灯').map((a) => a.u), ['/pages/board/index?cat=second'])
  eq('食堂类 → 校园导览', actsFor('三食堂有什么好吃的').map((a) => a.u), ['/pages/life/index'])
  eq('点餐类 → 服务页并定位食堂', actsFor('中午想吃外卖').map((a) => a.u), ['/pages/service/index?focus=canteen'])
  eq('闲聊不给按钮', actsFor('你是什么模型'), [])

  const chatCfg = loadPage('pages/chat/index.js')
  eq('chat wxml 绑定的方法都存在', checkHandlers('pages/chat/index.js', chatCfg), [])
  const ch = instance(chatCfg)
  ch.goAct({ currentTarget: { dataset: { u: '/pages/life/index' } } })
  ok('动作能跳导览', calls.nav.indexOf('/pages/life/index') >= 0)
  ch.goAct({ currentTarget: { dataset: { u: '/pages/service/index?focus=canteen' } } })
  eq('tab 页动作会先记焦点再 switchTab', store.serviceFocus, 'canteen')
  ok('空动作不会瞎跳', (function () { const n = calls.nav.length; ch.goAct({ currentTarget: { dataset: {} } }); return calls.nav.length === n })())

  console.log('\n=== 11. 办事指南检索：学生怎么问，就得怎么搜到 ===')
  const { search: gSearch, suggest: gSuggest } = require('./miniprogram/utils/search')
  const { DAILY: GD } = require('./miniprogram/data/guide')
  eq('问句“快递在哪取”→ 快递', gSearch(GD, '快递在哪取').slice(0, 1).map((x) => x.d.k), ['express'])
  eq('问句“医务室在哪”→ 校医院', gSearch(GD, '医务室在哪').slice(0, 1).map((x) => x.d.k), ['clinic'])
  eq('问句“医保怎么报销”→ 校医院', gSearch(GD, '医保怎么报销').slice(0, 1).map((x) => x.d.k), ['clinic'])
  eq('换说法“请假要带什么材料”→ 请假', gSearch(GD, '请假要带什么材料').slice(0, 1).map((x) => x.d.k), ['leave'])
  eq('关键词“取件码”→ 快递', gSearch(GD, '取件码').slice(0, 1).map((x) => x.d.k), ['express'])
  ok('不沾边的不硬答：学院数量没有办事条目', gSearch(GD, '学校有几个学院').length === 0)
  ok('不沾边的不硬答：食堂开门时间不属于办事', gSearch(GD, '食堂几点开门').length === 0)
  ok('只有共同两个字才给建议', gSuggest(GD, '校园卡丢了怎么办', 3).every((d) => d && d.t))

  const gCfg = loadPage('pages/guide/index.js')
  const gp = instance(gCfg)
  gp.onInput({ detail: { value: '快递在哪取' } })
  eq('页面搜“快递在哪取”只留快递一条', gp.data.view.map((x) => x.k), ['express'])
  ok('搜索态下的分类自动回到全部', gp.data.filter === '全部')
  gp.onInput({ detail: { value: '校园卡丢了怎么办' } })
  eq('“校园卡丢了怎么办”现在能搜到补办', ((require('./miniprogram/utils/search').search(GD, '校园卡丢了怎么办')[0] || {}).d || {}).k, 'card')
  // 换一个真正搜不到的词验证空列表 + 建议
  gp.onInput({ detail: { value: '量子纠缠实验装置' } })
  eq('搜不到时列表为空', gp.data.view.length, 0)
  ok('搜不到时给“沾点边”建议而不是空白', Array.isArray(gp.data.miss))
  gp.goWiki()
  ok('搜不到能带着词去百科', calls.nav.some((u) => u.indexOf('/pages/wiki/index?q=') === 0))
  gp.onInput({ detail: { value: '' } })
  eq('清空搜索恢复全部条目', gp.data.view.length, GD.length)

  console.log('\n=== 12. 小栖检索：资料里没有就说没有 ===')
  const rag2 = require('./miniprogram/utils/rag')
  ok('“帮我写一篇论文”不硬凑校内资料', rag2.retrieve('帮我写一篇论文', { topK: 3 }).length === 0)
  ok('“学校考研率多少”不硬凑校内资料', rag2.retrieve('学校考研率多少', { topK: 3 }).length === 0)
  ok('问得清的照常答：“图书馆能借几本书”', rag2.retrieve('图书馆能借几本书', { topK: 3 }).length > 0)
  ok('跨两条资料的问法也能拼出来：“宿舍电费怎么交”', rag2.retrieve('宿舍电费怎么交', { topK: 3 }).length > 0)

  // 问法与资料的三个接缝问题：疑问词的假片段、只在标签里的同义词、库里没有的价格
  const rAir = rag2.retrieve('空调坏了找谁修', { topK: 2 })
  ok('“空调坏了找谁修”能查到报修（标签里的空调也算数）', rAir.length > 0 && rAir.some((x) => x.t.indexOf('报修') >= 0), rAir.map((x) => x.t))
  const rYb = rag2.retrieve('医保怎么报销', { topK: 2 })
  ok('“医保怎么报销”不会被“怎么报名”带成重修', rYb.length > 0 && rYb.every((x) => x.t.indexOf('重修') < 0), rYb.map((x) => x.t))
  const rJw = rag2.retrieve('教务处电话', { topK: 2 })
  ok('“教务处电话”先给联系方式，不把补考顶到第一', rJw.length > 0 && rJw[0].t === '官方渠道与联系方式', rJw.map((x) => x.t))
  ok('没有价格数据的问法直接拒答：“打车到江南客运站多少钱”', rag2.retrieve('打车到江南客运站多少钱', { topK: 2 }).length === 0)
  ok('资料自己写了收费口径的照答：“学费多少”', rag2.retrieve('学费多少', { topK: 2 }).length > 0)
  const rOut = rag2.retrieve('校门口有什么吃的', { topK: 2 })
  ok('“校门口有什么吃的”命中新增的校门口条目', rOut.length > 0 && rOut[0].id === 'food-outside', rOut[0] && rOut[0].t)
  ok('“学校有几个食堂”命中的是食堂条目', (rag2.retrieve('学校有几个食堂', { topK: 2 })[0] || {}).t === '食堂点餐怎么用')

  // 官网查得到的就写死，查不到的不许编（2026-11-19 复核官网「管理机构」页）
  const KB_ALL = require('./miniprogram/utils/kb').KB
  const cContact = KB_ALL.find((x) => x.id === 'school-contact')
  ok('教务处电话来自官网（0771-4772509）', !!cContact && cContact.c.indexOf('0771-4772509') >= 0)
  ok('联系方式条目挂了官网机构页作为来源', !!cContact && /gxxshxy\.edu\.cn\/gljg\.htm/.test(cContact.c))
  const cYxy = KB_ALL.find((x) => x.id === 'campus-yixiaoyuan')
  ok('校园卡补办先说挂失（易校园「卡挂失」）', !!cYxy && cYxy.c.indexOf('卡挂失') >= 0)
  ok('补办窗口没公开就不编，只给电话让人去问', !!cYxy && cYxy.c.indexOf('没有写') >= 0 && cYxy.c.indexOf('0771-4772547') >= 0)
  ok('旧校区的补办口径标了时效', !!cYxy && cYxy.c.indexOf('老校区') >= 0)
  const rCt = rag2.retrieve('食堂几点开门', { topK: 2 })
  ok('食堂没公布开餐时间时给管理部电话，不硬猜时间', rCt.length > 0 && rCt[0].c.indexOf('0771-4772547') >= 0 && rCt[0].c.indexOf('以现场为准') >= 0)

  console.log('\n=== 13. 去美团：只做出入口，不做假下单 ===')
  const mt = require('./miniprogram/utils/meituan')
  ok('用的是美团外卖小程序 appid', /^wx[0-9a-f]{16}$/.test(mt.MEITUAN_APPID), mt.MEITUAN_APPID)
  const foodCfg = loadPage('pkgFood/pages/food/index.js')
  eq('美食页 wxml 绑定的方法都存在', checkHandlers('pkgFood/pages/food/index.js', foodCfg), [])
  ok('美食页确实有 goMeituan', typeof foodCfg.goMeituan === 'function')
  const fp = instance(foodCfg)

  const c0 = calls.clip.length
  fp.goMeituan()
  eq('跳不了小程序时复制美团链接兜底', calls.clip.slice(c0), [mt.MEITUAN_LINK])

  global.wx.navigateToMiniProgram = (o) => { calls.mini = calls.mini || []; calls.mini.push(o && o.appId) }
  const c1 = calls.clip.length
  fp.goMeituan()
  ok('能跳小程序时先跳小程序', (calls.mini || []).length === 1)
  ok('能跳小程序时不打扰剪贴板', calls.clip.length === c1)
  // 用户按取消：不该拿"链接已复制"的弹窗追着他
  global.wx.navigateToMiniProgram = (o) => { o && o.fail && o.fail({ errMsg: 'navigateToMiniProgram:fail cancel' }) }
  const c2 = calls.clip.length
  fp.goMeituan()
  ok('用户取消跳转时不弹「链接已复制」', calls.clip.length === c2)
  // 真跳不过去（未关联 / 基础库太老）才兜底复制
  global.wx.navigateToMiniProgram = (o) => { o && o.fail && o.fail({ errMsg: 'navigateToMiniProgram:fail invalid appid' }) }
  const c3 = calls.clip.length
  fp.goMeituan()
  ok('跳转失败才复制链接兜底', calls.clip.length === c3 + 1)
  delete global.wx.navigateToMiniProgram

  const foodWxml = fs.readFileSync(path.join(ROOT, 'pkgFood/pages/food/index.wxml'), 'utf8')
  ok('页头有「开饭」按钮', foodWxml.indexOf('开饭') >= 0 && foodWxml.indexOf('h-order') >= 0)
  ok('按钮下面有「跳转美团」小字', /ho-s[^>]*>跳转美团/.test(foodWxml), foodWxml.match(/ho-s[^>]*>[^<]*/))
  ok('美食页没有购物车/立即下单这类假按钮', !/购物车|立即下单|加入篮子/.test(foodWxml))

  // 贴纸：文件要在分包里、体积要可控（分包上限 2 MB，别为一张图把包撑爆）
  const gifAbs = path.join(ROOT, 'pkgFood/images/order.gif')
  const gifSize = fs.existsSync(gifAbs) ? fs.statSync(gifAbs).size : 0
  ok('贴纸文件在分包里', gifSize > 0)
  ok('贴纸体积压住了（< 120 KB）', gifSize > 0 && gifSize < 120 * 1024, Math.round(gifSize / 1024) + ' KB')
  ok('wxml 引用的是这张贴纸', foodWxml.indexOf('/pkgFood/images/order.gif') >= 0)
  ok('贴纸是真 GIF（不是改了后缀的 PNG）', (function () {
    if (!gifSize) return false
    const b = Buffer.alloc(6)
    const fd = fs.openSync(gifAbs, 'r'); fs.readSync(fd, b, 0, 6, 0); fs.closeSync(fd)
    return b.toString('ascii', 0, 3) === 'GIF'
  })())

  const homeWxml = fs.readFileSync(path.join(ROOT, 'pages/home/index.wxml'), 'utf8')
  ok('首页不再挂「点外卖」按钮（出口已挪到美食页）', homeWxml.indexOf('jumpMeituan') < 0 && homeWxml.indexOf('chip-order') < 0)

  // 发光：贴纸会亮。光层只做视觉，不能抢点击、不能盖住文字
  const foodWxss = fs.readFileSync(path.join(ROOT, 'pkgFood/pages/food/index.wxss'), 'utf8')
  ok('按钮背后有一团呼吸光晕（ho-glow）', foodWxml.indexOf('class="ho-glow"') >= 0)
  ok('外面还有一圈扩散光环（ho-ring）', foodWxml.indexOf('class="ho-ring"') >= 0)
  const KF = ['hoGlow', 'hoRing', 'hoHalo', 'hoWord']
  eq('四段光效关键帧都定义了', KF.filter((n) => !new RegExp('@keyframes\\s+' + n + '\\b').test(foodWxss)), [])
  ok('关键帧都真挂到元素上了', KF.every((n) => new RegExp('animation:\\s*' + n + '\\b').test(foodWxss)))
  ok('光层不抢点击（pointer-events:none）', (foodWxss.match(/pointer-events:\s*none/g) || []).length >= 2)
  ok('光层永远在贴纸和文字下面', /\.ho-glow[^}]*z-index:\s*0/.test(foodWxss)
    && /\.ho-badge[^}]*z-index:\s*1/.test(foodWxss)
    && /\.ho-tx[^}]*z-index:\s*1/.test(foodWxss))
  ok('加动画后贴纸尺寸没被改小', /\.ho-badge[^}]*width:\s*104rpx/.test(foodWxss) && /\.ho-gif[^}]*104rpx/.test(foodWxss))
  const periods = (foodWxss.match(/animation:\s*ho\w+\s+([\d.]+)s/g) || []).map((s) => parseFloat(s.match(/([\d.]+)s/)[1]))
  ok('四段动画周期一致且不超过 3s（同拍才像一口气）', periods.length >= 4 && periods.every((n) => n > 0 && n <= 3), periods)

  console.log('\n=== 14. 吉利专区：只放官网原文的动态 ===')
  const GL = require('./miniprogram/data/geely-live')
  ok('动态搬进来不止五条', GL.NEWS.length >= 20, 'got ' + GL.NEWS.length)
  // 就业网代发的「网招」不是吉利的岗，整块撤出主包，别再让人误认
  ok('招聘数据整块撤出主包', GL.JOBS === undefined)
  ok('每条动态都有原文链接', GL.NEWS.every((n) => /^https?:\/\//.test(n.url)))
  ok('动态的日期要么是真日期要么空着，不猜年份', GL.NEWS.every((n) => !n.d || /^\d{4}-\d{2}-\d{2}$/.test(n.d)))
  ok('动态里有极氪/吉利相关的真事', GL.NEWS.some((n) => /极氪|吉利/.test(n.t)))
  const geelyJs = fs.readFileSync(path.join(ROOT, 'pages/geely/index.js'), 'utf8')
  ok('页面不再硬编码五条静态动态', geelyJs.indexOf('const EVENTS') < 0)
  ok('页面从数据文件读', geelyJs.indexOf("data/geely-live") >= 0)
  const geelyWxml = fs.readFileSync(path.join(ROOT, 'pages/geely/index.wxml'), 'utf8')
  ok('吉利页不再摆就业网的招聘列表', geelyWxml.indexOf("tab==='job'") < 0 && geelyWxml.indexOf('pickJob') < 0)
  ok('招聘不再靠「去校招」跳走，改成页内折叠', geelyWxml.indexOf('goCareer') < 0 && geelyWxml.indexOf('bindtap="toggleOpp"') >= 0)
  ok('社招岗位也列在页内，不是只给入口链接', geelyWxml.indexOf('bindtap="toggleSoc"') >= 0 && geelyWxml.indexOf('socView') >= 0)
  ok('动态列表带摘要', geelyWxml.indexOf('ev-abs') >= 0)
  ok('没日期的条目如实显示', geelyWxml.indexOf("item.d || '—'") >= 0)
  const gg = instance(loadPage('pages/geely/index.js'))
  gg.onShow()
  eq('默认停在校园招聘', gg.data.tab, 'campus')
  eq('四个页签：校招 社招 动态 我的投递', (geelyWxml.match(/class="tab /g) || []).length, 4)
  eq('校招列表默认先筛培养项目', gg.data.kind, 'prog')
  eq('默认列表里只剩培养项目', gg.data.oppView.every((o) => o.kind === 'prog'), true)
  ok('默认不再把 7 条全堆出来，但也不空', gg.data.oppView.length > 0 && gg.data.oppView.length < gg.data.oppN, gg.data.oppView.length + '/' + gg.data.oppN)
  ok('只筛一类时留了「看全部」出口', geelyWxml.indexOf('bindtap="pickAll"') >= 0)
  ok('社招列表有官网在招的岗位', gg.data.socView.length >= 10, 'got ' + gg.data.socView.length)
  // AI 面试卡只该挨着机会列表，不该被「校内动作」「投递四件事」顶到页尾
  const iIv = geelyWxml.indexOf('<template is="ivCard" wx:if="{{tab===\'campus\'}}"')
  const iHire = geelyWxml.indexOf('吉利在校内的招聘动作')
  const iPrep = geelyWxml.indexOf('投递前先看这四件事')
  ok('AI 面试紧跟机会列表', iIv > geelyWxml.indexOf('class="crows"'), 'iv@' + iIv)
  ok('校内动作与投递清单排在面试入口后面', iIv > 0 && iHire > iIv && iPrep > iIv)
  ok('其它页签也留面试入口', geelyWxml.indexOf("wx:if=\"{{tab!=='campus'}}\"") >= 0)
  // 校内动作改成「标题一行 + 日期栏目一行」，不再用固定日期列宽挤正文
  ok('校内动作不再按日期列宽排版', /\.hi \{ padding:/.test(fs.readFileSync(path.join(ROOT, 'pages/geely/index.wxss'), 'utf8')) && geelyWxml.indexOf('class="hi-m"') >= 0)
  ok('校招页有吉利在招的动作（宣讲会/实习生/offer 榜）', gg.data.hireN >= 8, 'got ' + gg.data.hireN)
  ok('招聘动作都是从动态里筛的，没有另编一份', gg.data.hires.every((h) => GL.NEWS.some((n) => n.url === h.url)))
  ok('校园招聘页把招聘动作接上了', geelyWxml.indexOf('吉利在校内的招聘动作') >= 0)

  console.log('\n=== 15. 吉利机会详情 + 三档面试 + 本地评分 ===')
  const CR0 = require('./miniprogram/utils/career')
  // —— 机会详情：7 条吉利机会都要能点进去，且都落在吉利系 ——
  ok('每条机会都在吉利系范围内', CR0.OPP.every((o) => CR0.FAMILY_RE.test(o.org + o.title)), CR0.OPP.filter((o) => !CR0.FAMILY_RE.test(o.org + o.title)).map((o) => o.org))
  ok('每条机会都带官网原文链接', CR0.OPP.every((o) => /^https?:\/\//.test(o.url)))
  ok('每条机会都标了原文日期', CR0.OPP.every((o) => !!o.d))
  // 这几家是就业网代发过的非吉利企业，一个都不许留在数据里
  ok('非吉利企业的招聘不在数据里', !/岑科|爱华|玉柴|明大|雅尔亨|新言星语|钦州数研|年盈航空/.test(JSON.stringify(CR0.OPP)))
  const appJson2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  ok('不再有单独的校招页与机会详情页', appJson2.pages.indexOf('pages/career/index') < 0 && appJson2.pages.indexOf('pages/job/index') < 0)
  ok('页面文件也删干净了，不留死代码', !fs.existsSync(path.join(ROOT, 'pages/career/index.js')) && !fs.existsSync(path.join(ROOT, 'pages/job/index.js')))
  const svcJs = fs.readFileSync(path.join(ROOT, 'pages/service/index.js'), 'utf8')
  ok('服务页的招聘入口改落在吉利专区的校招页签', svcJs.indexOf('pages/geely/index?tab=campus') >= 0)

  // —— 三档 ——
  const IR = require('./miniprogram/utils/interview-rag')
  eq('三档数量', IR.LEVELS.length, 3)
  eq('三档顺序', IR.LEVELS.map((l) => l.k).join(','), 'normal,pro,stress')
  const proJob = CR0.asJob('xingli-2026')
  ok('机会能拼成面试用的岗位上下文', !!proJob && proJob.detail.duty.length >= 2 && proJob.detail.req.length >= 1)
  ok('专业面题目长在机会原文上', (() => {
    const qs = IR.buildQuestions('pro', proJob)
    // 题目里引用的必须是这条机会原文里的片段（环节、面向对象或方向），不能凭空出题
    const parts = (proJob.detail.duty || []).concat(proJob.detail.req || [], proJob.dirs || [])
    return qs.filter((q) => parts.some((p) => {
      const frag = String(p).slice(0, 6)
      return frag.length >= 2 && q.indexOf(frag) >= 0
    })).length >= 3
  })(), '题目：' + IR.buildQuestions('pro', proJob).slice(0, 2).map((x) => x.slice(0, 24)))
  ok('有岗位方向时会单独问方向偏好', proJob.dirs.length > 0 && IR.buildQuestions('pro', proJob).some((q) => q.indexOf(proJob.dirs[0]) >= 0))

  // —— RAG 上下文 ——
  const ctx = IR.contextOf(proJob, 'pro')
  ok('RAG 带上了岗位 JD', ctx.indexOf('【岗位 JD】') >= 0)
  ok('RAG 也检索了站内资料', ctx.split('【').length >= 3)

  // —— 本地评分：好答案必须明显高于空答，且要点命中能区分 ——
  const pts = IR.pointsOf(proJob)
  ok('从机会里抽到了考点', pts.length >= 2, pts.join('/'))
  const good = '我在吉利汽车研究院实习时做的是人工智能方向的车载项目，负责车辆工程相关的感知模块。先把需求拆成三个子任务，用 Python 跑了基线模型，然后把标注流程重做了一遍，最后把推理时延从 120ms 降到 80ms，团队验收通过后上线到两个车型。'
  const bad = '我比较努力。'
  const empty = ''
  const sg = IR.scoreAnswer(good, pts, 'pro')
  const sb = IR.scoreAnswer(bad, pts, 'pro')
  const se = IR.scoreAnswer(empty, pts, 'pro')
  ok('好答案得分明显高于空答', sg.pt >= 60 && se.pt <= 20, sg.pt + ' vs ' + se.pt)
  ok('空答不会崩，也不给分', se.pt <= 20 && se.dims)
  ok('答到要点会被记命中', sg.hit.length + sg.miss.length === pts.length)
  ok('短答被点出问题', sb.tip.length > 0 && sb.pt < 60, sb.pt)
  ok('好答案的提示不是骂人，是下一步', sg.tip.length > 0)

  // —— 汇总 ——
  const sum = IR.summarize([sg, sb])
  ok('总分在 0~100', sum.total >= 0 && sum.total <= 100, sum.total)
  eq('四维齐全', sum.dims.length, 4)
  ok('总分等于四维均值', Math.abs(sum.total - Math.round(sum.dims.reduce((a, d) => a + d.v, 0) / 4)) <= 1)
  ok('空记录也能给出结构，不崩', IR.summarize([]).total === 0)
  ok('最弱一维会给出对应建议', sum.advice.length > 10)

  // —— 入口与页面 ——
  const ivWxml = fs.readFileSync(path.join(ROOT, 'pages/interview/index.wxml'), 'utf8')
  ok('面试页有准备/答题/复盘三段', ivWxml.indexOf("step==='setup'") >= 0 && ivWxml.indexOf("step==='chat'") >= 0 && ivWxml.indexOf("step==='report'") >= 0)
  ok('复盘页画了四维条', ivWxml.indexOf('summary.dims') >= 0 && ivWxml.indexOf('dm-in') >= 0)
  ok('复盘页逐题给分', ivWxml.indexOf('item.pt') >= 0)
  const ivJs = fs.readFileSync(path.join(ROOT, 'pages/interview/index.js'), 'utf8')
  // 语音作答：接云托管 ASR，且只对专业面试档开放
  const asrJs = fs.readFileSync(path.join(ROOT, 'utils/asr.js'), 'utf8')
  const srvJs = fs.readFileSync(path.join(ROOT, '../cloudrun/wxlogin/server.js'), 'utf8')
  ok('云托管有 /api/asr 转写接口', /app\.post\('\/api\/asr'/.test(srvJs))
  ok('云托管 ASR 走 X-WX-OPENID 鉴权', /\/api\/asr[\s\S]{0,240}X-WX-OPENID/.test(srvJs))
  ok('云托管 ASR 未配上游时明确降级、不假装成功', /ASR_CFG\.url[\s\S]{0,160}语音识别未配置/.test(srvJs))
  ok('云托管能放大音频包（base64）', /limit: '6mb'/.test(srvJs))
  ok('前端 ASR 封装读录音并走云托管', /readFile[\s\S]{0,80}base64/.test(asrJs) && /wxhost\.call\('\/api\/asr'/.test(asrJs))
  ok('前端 ASR 失败如实降级到文字', /hint: '改文字作答'/.test(asrJs))
  ok('面试页接了 ASR 并把结果填进作答框', ivJs.indexOf('ASR.transcribe') >= 0 && ivJs.indexOf("input: text.slice(0, 3000)") >= 0)
  ok('语音按钮/模式卡只在专业档显示', /level==='pro'/.test(ivWxml) && ivWxml.indexOf("mode==='voice' && level==='pro'") >= 0)
  ok('切到非专业档强制回文字', /if \(k !== 'pro'\) patch\.mode = 'text'/.test(ivJs) && /if \(m === 'voice' && this\.data\.level !== 'pro'\)/.test(ivJs))
  // 音频直入探测：先验证模型能不能吃 input_audio，再决定要不要改作答链路
  const probeJs = fs.readFileSync(path.join(ROOT, 'utils/audio-probe.js'), 'utf8')
  const Probe = require('./miniprogram/utils/audio-probe')
  const tone = Buffer.from(Probe.testToneB64(0.4), 'base64')
  ok('探测能生成合法 WAV 测试音', tone.toString('ascii', 0, 4) === 'RIFF' && tone.toString('ascii', 8, 12) === 'WAVE' && tone.readUInt16LE(34) === 16)
  ok('探测用 input_audio 把音频直送模型', /type: 'input_audio'/.test(probeJs) && /input_audio: \{ data, format: 'wav' \}/.test(probeJs))
  ok('探测明确区分 接了/拒绝/无法确认 三态', /supported: true/.test(probeJs) && /supported: rejected \? false : null/.test(probeJs) && /supported: null/.test(probeJs))
  ok('面试页有探测入口且只对专业档显示', ivJs.indexOf('Probe.probe') >= 0 && /class="probe" wx:if="\{\{level==='pro'\}\}"/.test(ivWxml))
  ok('分数由本地算', ivJs.indexOf('RAG.scoreAnswer') >= 0 && ivJs.indexOf('RAG.summarize') >= 0)
  ok('复盘文字由模型写、分数不交给模型', ivJs.indexOf('feedbackSys(this.data.level, sum') >= 0)
  const homeWxml2 = fs.readFileSync(path.join(ROOT, 'pages/home/index.wxml'), 'utf8')
  ok('首页吉利盒子里有 AI 面试入口', homeWxml2.indexOf('goInterviewAi') >= 0 && homeWxml2.indexOf('AI 模拟面试') >= 0)
  ok('盒子里的面试条阻止冒泡（不误进专区）', homeWxml2.indexOf('catchtap="goInterviewAi"') >= 0)
  const svcWxml = fs.readFileSync(path.join(ROOT, 'pages/service/index.wxml'), 'utf8')
  ok('服务页有独立面试入口', svcWxml.indexOf('bindtap="goInterview"') >= 0)
  const glWxml = fs.readFileSync(path.join(ROOT, 'pages/geely/index.wxml'), 'utf8')
  const geelyWxml2 = glWxml
  ok('吉利页面试卡是三档', glWxml.indexOf('data-track="pro"') >= 0 && glWxml.indexOf('data-track="stress"') >= 0)

  console.log('\n=== 16. 吉利招聘（只收吉利系 / 筛选 / 收藏与投递记录） ===')
  const CR = require('./miniprogram/utils/career')
  eq('机会总数', CR.OPP.length, 7)
  eq('正式岗 2 条', CR.OPP.filter((o) => o.kind === 'job').length, 2)
  eq('实习 1 条', CR.OPP.filter((o) => o.kind === 'intern').length, 1)
  eq('培养项目 3 条', CR.OPP.filter((o) => o.kind === 'prog').length, 3)
  eq('宣讲 1 条', CR.OPP.filter((o) => o.kind === 'talk').length, 1)
  ok('每条都有单位与标题', CR.OPP.every((o) => o.org && o.title))
  ok('每条都有岗位方向或面向对象', CR.OPP.every((o) => (o.dirs && o.dirs.length) || o.target))
  ok('岗位方向是从原文摘的，不是空的占位', CR.OPP.filter((o) => o.dirs.length).length >= 5)

  eq('社招只放吉利自己的入口', CR.SOCIAL.length, 2)
  ok('社招入口都是 geely.com 域名', CR.SOCIAL.every((s) => /geely\.com/.test(s.url)))
  ok('校招官网也在', /campus\.geely\.com/.test(CR.CAMPUS.url))

  // 筛选与搜索
  eq('按正式岗筛', CR.byKind('job', '').length, 2)
  eq('搜「极氪」只剩极氪那条', CR.byKind('all', '极氪').length, 1)
  eq('搜非吉利企业搜不到', CR.byKind('all', '岑科电子').length, 0)
  eq('类型名能反查', CR.kindName('intern'), '实习')
  ok('asJob 不往 JD 里塞规模/来源（会让面试官问怪题）', (() => {
    const j = CR.asJob('xingli-2026')
    const txt = (j.detail.duty || []).concat(j.detail.req || []).join('')
    return txt.indexOf('规模') < 0 && txt.indexOf('来源') < 0 && txt.indexOf('岗位方向：') < 0
  })())
  ok('不存在的 id 返回空，不抛错', CR.findById('nope') === null && CR.asJob('nope') === null)

  // 收藏：点一下加、再点一下取消，落本机
  const testId = CR.OPP[0].id
  eq('初始没有收藏', CR.readFav().length, 0)
  eq('第一次点收藏', CR.toggleFav(testId), true)
  eq('收藏写进了本机', CR.readFav().indexOf(testId) >= 0, true)
  eq('第二次点取消', CR.toggleFav(testId), false)
  eq('取消后本机也清了', CR.readFav().length, 0)

  // 投递进度：四档循环回起点，不会卡死
  eq('初始未记录', CR.applyOf(testId).k, '')
  eq('第一档已投递', CR.nextApply(testId).k, 'sent')
  eq('第二档进面试', CR.nextApply(testId).k, 'iv')
  eq('第三档有结果', CR.nextApply(testId).k, 'done')
  eq('再点回到未记录', CR.nextApply(testId).k, '')
  eq('清空后本机没有残留', Object.keys(CR.readApply()).length, 0)

  const gcfg = loadPage('pages/geely/index.js')
  eq('吉利页 wxml 绑定的方法都存在', checkHandlers('pages/geely/index.js', gcfg), [])
  const g = instance(gcfg)
  g.onShow()
  eq('进来默认在校招页签', g.data.tab, 'campus')
  eq('进来默认只筛培养项目', g.data.oppView.every((o) => o.kind === 'prog'), true)
  g.pickAll()
  eq('点「全部」把 7 条机会都摆上', g.data.oppView.length, CR.OPP.length)
  eq('初始没有展开项', g.data.openId, '')
  g.toggleOpp({ currentTarget: { dataset: { id: testId } } })
  eq('点一行就地展开', g.data.openId, testId)
  g.toggleOpp({ currentTarget: { dataset: { id: testId } } })
  eq('再点一下收起', g.data.openId, '')
  g.onKw({ detail: { value: '繁星' } })
  eq('搜索真的过滤了列表', g.data.oppView.length, 2)
  g.onKw({ detail: { value: '' } })
  g.pickKind({ currentTarget: { dataset: { k: 'prog' } } })
  eq('切类型后只剩培养项目', g.data.oppView.every((o) => o.kind === 'prog'), true)
  g.pickKind({ currentTarget: { dataset: { k: 'all' } } })

  // 收藏与投递记录：改在吉利页上操作，本机状态要跟着变
  g.toggleFav({ currentTarget: { dataset: { id: testId } } })
  eq('收藏后收藏数变了', g.data.favN, 1)
  g.cycleApply({ currentTarget: { dataset: { id: testId } } })
  eq('记进度后已投数变了', g.data.mineN, 1)
  eq('分组里出现了「已投递」', g.data.applyGroups.some((x) => x.k === 'sent' && x.cnt === 1), true)
  eq('已记录的不会再出现在「收藏待投」', g.data.favPosts.length, 0)
  g.togglePrep({ currentTarget: { dataset: { k: 'cv' } } })
  eq('勾一项材料清单', g.data.prepDone, 1)
  g.togglePrep({ currentTarget: { dataset: { k: 'cv' } } })
  eq('再点取消勾选', g.data.prepDone, 0)

  // 社招：搜索与折叠
  const SOC0 = require('./miniprogram/data/geely-soc')
  ok('社招数据是从官网抓的，带发布时间与单位', SOC0.SOC.length >= 10 && SOC0.SOC.every((j) => j.t && j.org && /^\d{2}-\d{2}$/.test(j.d)))
  ok('社招岗位都属于吉利系企业', SOC0.SOC.every((j) => /吉利|极氪|领克|沃尔沃|极星|路特斯|宝腾|商用车|睿蓝/.test(j.org)), SOC0.SOC.map((j) => j.org).filter((x) => !/吉利|极氪|领克|沃尔沃|极星|路特斯|宝腾|商用车|睿蓝/.test(x)))
  ok('社招总数照官网抄，不自己编', SOC0.SOC_META.total >= SOC0.SOC.length, SOC0.SOC_META.total)
  g.onSocKw({ detail: { value: '算法' } })
  ok('社招能按岗位名搜', g.data.socView.length >= 1 && g.data.socView.length < g.data.soc.length, g.data.socView.length)
  g.clearSocKw()
  eq('清空后回到全部社招', g.data.socView.length, g.data.soc.length)
  g.switchTab({ currentTarget: { dataset: { tab: 'social' } } })
  g.toggleSoc({ currentTarget: { dataset: { id: SOC0.SOC[0].id } } })
  eq('社招岗位也能就地展开', g.data.openSoc, SOC0.SOC[0].id)
  g.switchTab({ currentTarget: { dataset: { tab: 'campus' } } })
  eq('切页签时收起所有展开项', g.data.openSoc + g.data.openId, '')

  ok('页面上明写记录只在本机', geelyWxml2.indexOf('不上传、不代投') >= 0)
  ok('页面上明写社招不代投', geelyWxml2.indexOf('站内只做目录') >= 0)
  ok('展开的机会能直接练面试', geelyWxml2.indexOf('catchtap="goInterview"') >= 0)
  const svcWxml2 = fs.readFileSync(path.join(ROOT, 'pages/service/index.wxml'), 'utf8')
  ok('服务页的招聘入口指向吉利专区', svcWxml2.indexOf('bindtap="goCareer"') >= 0 && svcWxml2.indexOf('吉利招聘') >= 0)

  console.log('\n=== 17. 课表：四种录入都落到同一份数据 ===')
  const TT = require('./miniprogram/utils/timetable')
  eq('五大节照学校作息', TT.SLOTS.map((s) => s.sg), ['01,02小节', '03,04小节', '05,06小节', '07,08小节', '09,10,11小节'])
  eq('一周七天从星期一开始', TT.DAYS[0] + '/' + TT.DAYS[6], '星期一/星期日')
  const ttWxml = fs.readFileSync(path.join(ROOT, 'pages/timetable/index.wxml'), 'utf8')
  const ttJs = fs.readFileSync(path.join(ROOT, 'pages/timetable/index.js'), 'utf8')
  const ttWxss = fs.readFileSync(path.join(ROOT, 'pages/timetable/index.wxss'), 'utf8')
  const appJson3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  ok('课表页已注册', appJson3.pages.indexOf('pages/timetable/index') >= 0)
  ok('示例默认铺满 1-16 周', TT.DEMO.every((c) => c.w.length === 16))
  ok('有一次性补全旧示例的逻辑', ttJs.indexOf('fillOldDemoWeeks') >= 0 && TT.fillOldDemoWeeks !== undefined)
  ok('能识别示例课表（荣誉统计要排除它）', typeof TT.isDemo === 'function' && TT.isDemo(TT.DEMO) === true && TT.isDemo([{ n: '我自己的课', t: '', r: '' }]) === false)
  ok('常驻声明：非校方接口 / 自定义 / 无法实时更新 / 注意变化',
    /src-note/.test(ttWxml) && /未接校方教务接口/.test(ttWxml) && /无法实时更新/.test(ttWxml) && /注意课程变化/.test(ttWxml) && /\.src-note\s*\{/.test(ttWxss))
  ;['openForm', 'openImport', 'doOcr', 'doParse', 'confirmImport', 'saveForm', 'delCourse'].forEach((m) => {
    ok('四路录入的方法都在：' + m, ttJs.indexOf(m + '(') >= 0 || ttJs.indexOf(m + ' (' ) >= 0)
  })
  ok('添加 / 导入 / 识别 / 手动输入四个入口都在页面上', ['添加', '导入', '识别', '手动输入'].every((x) => ttWxml.indexOf(x) >= 0))
  // 点空格子带出星期与大节，不是让用户自己填
  ok('点空格子会带出星期与大节', /data-day="\{\{item\.day\}\}" data-s="\{\{item\.s\}\}" bindtap="openForm"/.test(ttWxml))

  // 解析：单行、多行、跨两个大节、单双周
  const one = TT.parseText('软件工程 教师：王忠良 星期四 05-06小节 第11周 3-201')
  eq('单行能认出课名/教师/星期', one.list.map((x) => [x.n, x.t, x.day].join('|')), ['软件工程|王忠良|4'])
  eq('05-06 小节落在第三大节', one.list[0].s, 3)
  eq('教室不会把节次号当成教室，旧缩写换成改版楼名', one.list[0].r, '吉智楼201')
  eq('周次只取「周」前面那段', one.list[0].w, [11])
  const multi = TT.parseText('嵌入式综合设计\n教师：唐婉莎\n星期三 09-10小节 第11周')
  eq('课名在上一行也能认出来', multi.list.map((x) => [x.n, x.t, x.s].join('|')), ['嵌入式综合设计|唐婉莎|5'])
  eq('09-10 小节算第五大节', TT.parseSlot('09-10小节'), { s: 5, span: 1 })
  eq('05-08 小节跨两个大节', TT.parseSlot('05-06-07-08小节'), { s: 3, span: 2 })
  eq('单周只留奇数周', TT.parseWeeks('1-8周(单)'), [1, 3, 5, 7])
  eq('周次区间压成 1-16 周', TT.weeksText(TT.range(1, 16)), '1-16周')
  const junk = TT.parseText('今天中午吃什么')
  eq('认不出的行不硬塞，单独计数', junk.list.length + junk.bad.length, 1)

  // 网格坐标：星期三第一二大节要合成一块，别拆成两块
  const laid = TT.layout(TT.DEMO, 11)
  eq('示例课表第 11 周 5 块', laid.length, 5)
  eq('跨两节的课是一块 span=2', laid.filter((c) => c.span === 2).length, 2)
  ok('星期三的课落在第 3 列（下标 2）', laid.filter((c) => c.day === 3).every((c) => c.col === 2))
  eq('不是本周的课不排进来', TT.layout([{ n: 'x', day: 1, s: 1, span: 1, w: [5] }], 11).length, 0)

  // 存储：没开过 vs 清空过
  ok('读出来的是数组', Array.isArray(TT.read()))
  ok('示例数据只照截图里的课，没有编别的学校', TT.DEMO.every((c) => /嵌入式|软件工程|移动互联网|马克思/.test(c.n)))

  // 地点：先选楼、再填房间号，楼名一律用改版后的叫法
  eq('楼栋只收学校改版后的六个楼', TT.BUILDINGS.map((b) => b.n), ['吉贤楼', '吉智楼', '吉芯楼', '吉思楼', '吉美楼', '吉星楼'])
  eq('选择器里带原楼号，省得对不上', TT.B_ALL[2] + '/' + TT.B_ALL[4], '吉芯楼（原6号教学楼）/吉美楼（原综合楼）')
  eq('选择器最后一项是其它地点', TT.B_ALL[TT.B_ALL.length - 1], '其它地点')
  eq('6 号教学楼换成吉芯楼', TT.normRoom('6号教学楼103'), '吉芯楼103')
  eq('综合楼换成吉美楼', TT.normRoom('综合楼412'), '吉美楼412')
  eq('重复楼名压成一个', TT.normRoom('吉芯楼-吉芯楼103'), '吉芯楼103')
  eq('「3-201」按 3 号教学楼理解', TT.normRoom('3-201'), '吉智楼201')
  eq('不是教室的地点原样留着', TT.normRoom('校内课程实践-思政课实践基地'), '校内课程实践-思政课实践基地')
  eq('地点能拆回「哪栋楼 + 哪间」', TT.splitRoom('吉芯楼103'), { bi: 2, room: '103' })
  eq('认不出楼的地点落到其它地点', TT.splitRoom('思政课实践基地').bi, TT.BUILDINGS.length)
  eq('只选楼不填房间号就只留楼名', TT.joinRoom(4, ''), '吉美楼')
  eq('示例课表地点用改版楼名', TT.DEMO.filter((c) => /吉(芯|美)楼/.test(c.r)).length, 4)
  ok('地点是选楼 + 填房间号，不是自由文本框', ttWxml.indexOf('bindchange="fBuilding"') >= 0 && ttWxml.indexOf('type="number"') >= 0)

  // 页面实例：点空格 → 填 → 存 → 删，一条龙
  const tcfg = loadPage('pages/timetable/index.js')
  eq('课表页 wxml 绑定的方法都存在', checkHandlers('pages/timetable/index.js', tcfg), [])
  delete store.timetable
  delete store.timetableInit
  delete store.timetableWeek
  const tp = instance(tcfg)
  tp.onLoad()
  eq('头一次进来给示例课表', tp.data.blocks.length, 5)
  eq('示例会标明可清空', tp.data.isDemo, true)
  tp.openForm({ currentTarget: { dataset: { day: 2, s: 2 } } })
  eq('点空格带出星期与大节', tp.data.form.day + '/' + tp.data.form.s, '2/2')
  tp.fName({ detail: { value: '数据结构' } })
  tp.fTeacher({ detail: { value: '李伟' } })
  tp.fBuilding({ detail: { value: 0 } })
  eq('选楼会把上一间的房间号清掉', tp.data.form.room, '')
  tp.fRoom({ detail: { value: '105' } })
  tp.fWeeks({ detail: { value: '1-16' } })
  tp.saveForm()
  eq('保存后多一块', tp.data.blocks.length, 6)
  eq('地点是「楼名＋房间号」', tp.data.blocks.filter((b) => b.n === '数据结构').map((b) => b.r), ['吉贤楼105'])
  // left 相对 .gc 容器算，不再叠 TIME_W；星期二(col=1)=132+3=135，第二大节(row=1)top=188
  eq('新块落在星期二第二大节的格子里', tp.data.blocks.filter((b) => b.n === '数据结构').map((b) => b.left + ',' + b.top), ['135,188'])
  eq('自己加过之后不再是示例', tp.data.isDemo, false)
  const keep = global.wx.showModal
  global.wx.showModal = (o) => { if (o && o.success) o.success({ confirm: true }) }
  const delId = tp.data.blocks.filter((b) => b.n === '数据结构')[0].id
  tp.editCourse({ currentTarget: { dataset: { id: delId } } })
  tp.delCourse()
  global.wx.showModal = keep
  eq('确认后删掉那一块', tp.data.blocks.length, 5)
  // 周次：示例默认铺满 1-16，翻到任意一周都该有完整 5 块
  tp.nextWeek()
  eq('翻到第 12 周', tp.data.week, 12)
  eq('翻周后仍铺满 5 块（默认填满）', tp.data.blocks.length, 5)
  ok('第 12 周仍能看到软件工程这类全周课', tp.data.blocks.some((b) => b.n === '软件工程'))
  tp.prevWeek()
  // 识别：mock 里没有相册，不能假装成功，也不能卡在忙碌态
  tp.doOcr()
  await new Promise((r) => setTimeout(r, 60))
  eq('识别拿不到图时不假装成功', tp.data.ocrBusy, false)

  console.log('\n=== 18. 首页入口换位 + 图册点开 ===')
  const hmWxml = fs.readFileSync(path.join(ROOT, 'pages/home/index.wxml'), 'utf8')
  const hmJs = fs.readFileSync(path.join(ROOT, 'pages/home/index.js'), 'utf8')
  ok('首页常用入口有课表', hmWxml.indexOf('bindtap="goTimetable"') >= 0 && hmJs.indexOf('pages/timetable/index') >= 0)
  ok('课表卡把四路录入写在脸上', /tt-tags/.test(hmWxml) && /添加[\s\S]*导入[\s\S]*识别[\s\S]*手动/.test(hmWxml))
  ok('办事指南与快递并排占半格', hmWxml.indexOf('class="b-pair"') >= 0 && /b-pair[\s\S]*goGuide[\s\S]*goExpress/.test(hmWxml))
  ok('首页不再有独立的快递小格占位', hmWxml.indexOf('goExpress') > hmWxml.indexOf('b-pair'))
  ok('课表卡显示第几周与几节', /ttWeek/.test(hmWxml) && /ttCnt/.test(hmWxml))
  ok('指南角标不写死、从数据实时算',
    /guideN/.test(hmWxml) && /data\/guide/.test(hmJs) && /GUIDE_DAILY\.length/.test(hmJs) &&
    hmWxml.indexOf('15 件') < 0)
  ok('课表校准进页面就跑（不等 onShow）', /onLoad[\s\S]{0,120}syncTimetable\(\)/.test(hmJs))
  ok('服务页指南描述件数动态', /DAILY\.length/.test(fs.readFileSync(path.join(ROOT, 'pages/service/index.js'), 'utf8')))

  const wkJs = fs.readFileSync(path.join(ROOT, 'pages/wiki/index.js'), 'utf8')
  const wkWxml = fs.readFileSync(path.join(ROOT, 'pages/wiki/index.wxml'), 'utf8')
  const wkWxss = fs.readFileSync(path.join(ROOT, 'pages/wiki/index.wxss'), 'utf8')
  ok('图册点一下铺满、再点收回', /tapCard\(e\)[\s\S]*this\.data\.wide === k \? '' : k/.test(wkJs))
  ok('铺满时那张提到最前，避免半格空', wkJs.indexOf('orderOf') >= 0 && wkWxml.indexOf('galleryView') >= 0)
  ok('铺满样式是整行', /\.g-card\.wide \{ width: 100%/.test(wkWxss))
  ok('放大走原生 previewImage（可双指缩放）', wkJs.indexOf('wx.previewImage') >= 0)
  ok('放大按钮单独接了 catchtap，不会误触铺满', /catchtap="zoom"/.test(wkWxml))
  ok('旧的 lightbox 已拆干净', wkWxml.indexOf('lightbox') < 0 && wkWxss.indexOf('.lightbox') < 0)

  console.log('\n=== 19. 班级索引：建过的不能再建 ===')
  const KL = require('./miniprogram/utils/klass')
  delete store[KL.K_LIST]
  delete store[KL.K_CUR]
  eq('班名归一成《23计科4班》', KL.display(KL.parse('23计算机科学与技术4班').k), '《23计科4班》')
  eq('2023级 也认', KL.parse('2023级计算机科学与技术4班').k, '23计科4班')
  eq('04 和 4 是同一个班', KL.parse('23计科04班').k, '23计科4班')
  eq('带书名号也认', KL.parse('《23计科4班》').k, '23计科4班')
  eq('数字媒体技术 / 艺术 不会互相截胡', KL.parse('23数媒技3班').k + '/' + KL.parse('23数媒艺3班').k, '23数媒技3班/23数媒艺3班')
  eq('缺年级要报错', KL.parse('计科4班').ok, false)
  eq('班号可省：只到年级专业也能建', KL.parse('23计科').ok, true)
  eq('只到年级专业的 key 不带班号', KL.parse('23计科').k, '23计科')
  eq('「不设班级」被识别为清除当前班', KL.parse('不设班级').none, true)
  eq('只写专业没年级仍报错', KL.parse('计科4班').ok, false)
  const zc1 = KL.add('23计科4班')
  eq('第一个班建成功', zc1.ok, true)
  const zc2 = KL.add('23计算机科学与技术4班')
  eq('换个写法不重复建', zc2.ok, false)
  eq('并且把已有的那个还回去', zc2.why + ':' + zc2.k, 'exists:23计科4班')
  const zc3 = KL.add('23软工1班')
  eq('不同班照建', zc3.ok, true)
  eq('索引里就两个班', KL.read().length, 2)
  eq('选班要选建过的', KL.pick('23网工1班').ok, false)
  eq('选中建过的班', KL.pick('23软工1班').ok, true)
  eq('当前班级记住了', KL.current(), '23软工1班')
  eq('快照里带书名号与选中标记', KL.snapshot().list.filter((x) => x.cur).map((x) => x.text), ['《23软工1班》'])

  console.log('\n=== 20. 五个荣誉：金 / 银 / 铜 ===')
  const HO = require('./miniprogram/utils/honor')
  eq('五个荣誉', HO.HONORS.map((h) => h.n), ['先驱者', '资料补充者', '纠错贡献者', '意见反馈者', '校园共建者'])
  eq('活动截止 2026-12-20', HO.DEADLINE_TEXT, '2026-12-20')
  const now0 = new Date('2026-11-19T23:00:00+08:00').getTime()
  const early = new Date('2026-11-01T10:00:00+08:00').getTime()
  const late = new Date('2026-12-25T10:00:00+08:00').getTime()
  const zhl = HO.compute({ firstAt: early, tt: 5, fbDocs: 0, fbFix: 0, fbIdea: 0, posts: 0 }, now0)
  eq('12-20 前登入，先驱者是金色', zhl[0].metal + '/' + zhl[0].got, 'gold/true')
  const zhl2 = HO.compute({ firstAt: late, tt: 0, fbDocs: 0, fbFix: 0, fbIdea: 0, posts: 0 }, now0)
  eq('活动之后登入是铜色', zhl2[0].metal + '/' + zhl2[0].got, 'bronze/true')
  const zhl3 = HO.compute({ firstAt: 0, tt: 0, fbDocs: 0, fbFix: 0, fbIdea: 0, posts: 0 }, now0)
  eq('没登入过就没有先驱者', zhl3[0].got, false)
  eq('有课表就算资料补充者', zhl[1].got, true)
  const zhl4 = HO.compute({ firstAt: 0, tt: 0, fbDocs: 0, fbFix: 1, fbIdea: 1, posts: 0 }, now0)
  eq('纠错 + 建议 两条腿 → 校园共建者（银）', zhl4[4].metal + '/' + zhl4[4].got, 'silver/true')
  eq('只有一条腿不算共建', HO.compute({ firstAt: 0, tt: 0, fbDocs: 0, fbFix: 1, fbIdea: 0, posts: 0 }, now0)[4].got, false)
  eq('头衔取最高：金压银', HO.titleOf({ firstAt: early, tt: 1, fbFix: 1, fbIdea: 1 }, now0).n, '先驱者')
  eq('没有金时取银', HO.titleOf({ firstAt: 0, tt: 0, fbFix: 1, fbIdea: 1 }, now0).n, '校园共建者')
  eq('只有铜时取先亮的那枚', HO.titleOf({ firstAt: 0, tt: 0, fbDocs: 0, fbFix: 0, fbIdea: 2 }, now0).n, '意见反馈者')
  eq('什么都没做没有头衔', HO.titleOf({ firstAt: 0, tt: 0 }, now0), null)

  // 头衔只显示一枚：可从已获得里选，选中失效自动回退最高
  const rich = { firstAt: early, tt: 1, fbDocs: 1, fbFix: 1, fbIdea: 1 }
  eq('默认仍取最高级（金）', HO.titleOf(rich, now0).n, '先驱者')
  eq('选一枚已获得的铜头衔', HO.titleOf(rich, now0, 'docs').n, '资料补充者')
  eq('选中的银头衔生效', HO.titleOf(rich, now0, 'builder').metal, 'silver')
  eq('选一个没获得的头衔被忽略、回退最高', HO.titleOf({ firstAt: 0, tt: 1 }, now0, 'pioneer').n, '资料补充者')
  ok('有选中记忆的读写键', typeof HO.readPick === 'function' && typeof HO.writePick === 'function' && HO.K_PICK === 'honor_title_pick_v1')

  console.log('\n=== 20b. 奖杯图标 + 小横条牌匾头衔 ===')
  const meJs2 = fs.readFileSync(path.join(ROOT, 'pages/me/index.js'), 'utf8')
  const meWxml2 = fs.readFileSync(path.join(ROOT, 'pages/me/index.wxml'), 'utf8')
  const meWxss2 = fs.readFileSync(path.join(ROOT, 'pages/me/index.wxss'), 'utf8')
  ;['gold', 'silver', 'bronze'].forEach((m) => {
    ok('奖杯图标 trophy_' + m + '.png 存在', fs.existsSync(path.join(ROOT, 'images/icons/trophy_' + m + '.png')))
    ok('金属 ' + m + ' 映射到奖杯', meJs2.indexOf("trophy_" + m + ".png") >= 0)
  })
  ok('头衔不再显示金银铜文字（hp-m 已移除）', meWxml2.indexOf('hp-m') < 0)
  ok('荣誉列表改用奖杯图标', meWxml2.indexOf('hg-cup') >= 0 && meWxml2.indexOf('item.cupSrc') >= 0)
  ok('小横条牌匾结构（tplate + 奖杯 + 名字）', meWxml2.indexOf('class="tplate') >= 0 && meWxml2.indexOf('tp-cup') >= 0 && meWxml2.indexOf('tp-name') >= 0)
  ok('牌匾小巧横条（高度收窄、左对齐头像下方）', /\.hp-row[\s\S]{0,160}justify-content:\s*flex-start/.test(meWxss2) && /\.tplate[\s\S]{0,120}height:\s*36rpx/.test(meWxss2))
  ok('菱形大牌匾已移除', meWxml2.indexOf('plaque-flower') < 0 && meWxss2.indexOf('.plaque-row') < 0)
  // 互助墙发帖身份也用同款小牌匾
  const bdWxml2 = fs.readFileSync(path.join(ROOT, 'pages/board/index.wxml'), 'utf8')
  const bdJs2 = fs.readFileSync(path.join(ROOT, 'pages/board/index.js'), 'utf8')
  ok('发帖列表身份带奖杯牌匾', bdWxml2.indexOf('class="tplate') >= 0 && bdWxml2.indexOf('item.cupSrc') >= 0)
  ok('发帖身份兼容旧纯文字格式', bdJs2.indexOf("typeof w === 'string'") >= 0 && bdJs2.indexOf('whoText') >= 0)
  ok('发帖预览也用小牌匾', bdWxml2.indexOf('{{honor.n}}') >= 0)

  // 头衔只显示一枚：点头衔牌匾从已获得里选
  ok('牌匾可点开选择（openTitle + tap 样式）', /bindtap="openTitle"/.test(meWxml2) && meJs2.indexOf('openTitle()') >= 0 && meWxss2.indexOf('.tplate.tap') >= 0)
  ok('有头衔选择弹层', meWxml2.indexOf('选择显示的头衔') >= 0 && meWxml2.indexOf('showTitle') >= 0)
  ok('选择只列已获得（titleOptions 来自 honors.filter got）', /titleOptions: got/.test(meJs2) && /honors\.filter\(\(x\) => x\.got\)/.test(meJs2))
  ok('有自动档回退最高级', meWxml2.indexOf('自动 · 最高一级') >= 0 && meJs2.indexOf('autoCur') >= 0)
  ok('荣誉列表已获得项可直接点选', /data-k="\{\{item\.k\}\}" bindtap="pickTitle"/.test(meWxml2) && meWxml2.indexOf('hg-pick') >= 0)
  ok('展示中高亮 + 列表里也有自动档可选', meWxml2.indexOf('展示中') >= 0 && /data-k="" bindtap="pickTitle"/.test(meWxml2))
  ok('未登录也能选（荣誉是本机动作，与登录无关）', meJs2.indexOf('openTitle() {') >= 0 && meJs2.indexOf("if (!this.data.user)") < 0)
  ok('选择按 openid 唯一键存（writePick/adoptPick 带 openid）', /H\.writePick\(k, myOid\(\)\)/.test(meJs2) && meJs2.indexOf('H.adoptPick(oid)') >= 0 && /const writePick = \(k, oid\)/.test(fs.readFileSync(path.join(ROOT, 'utils/honor.js'), 'utf8')))
  ok('选择写入记忆并只允许已获得', meJs2.indexOf('H.writePick(k, myOid())') >= 0 && meJs2.indexOf('titleOptions.some((x) => x.k === k)') >= 0)
  ok('发帖头衔随选择走（titleOf 内部读 pick）', bdJs2.indexOf('H.titleOf(stat)') >= 0 && meJs2.indexOf('H.titleOf(stat)') >= 0)

  console.log('\n=== 20d. 身份绑人（openid）而非绑帖子 ===')
  const srvBind = fs.readFileSync(path.join(ROOT, '../cloudrun/wxlogin/server.js'), 'utf8')
  ok('新表 user_profile 按 openid 存身份', /CREATE TABLE IF NOT EXISTS user_profile/.test(srvBind) && /openid VARCHAR\(64\) NOT NULL PRIMARY KEY/.test(srvBind))
  ok('旧表补身份列（ALTER 兼容）', /ALTER TABLE board_posts ADD COLUMN klass/.test(srvBind))
  ok('发帖写入身份字段', /INSERT INTO board_posts[\s\S]{0,120}honor_metal/.test(srvBind))
  ok('查询读回身份字段', /const cols[^\n]*honor_metal/.test(srvBind) && /SELECT \$\{cols\} FROM board_posts/.test(srvBind))
  ok('POST /api/profile 按人存', srvBind.indexOf("app.post('/api/profile'") >= 0 && /ON DUPLICATE KEY UPDATE/.test(srvBind))
  ok('GET /api/profile 支持按 openids 批量取', srvBind.indexOf("app.get('/api/profile'") >= 0 && srvBind.indexOf('openids') >= 0)
  const idJs = fs.readFileSync(path.join(ROOT, 'utils/identity.js'), 'utf8')
  ok('前端有 identity 绑人工具', /bindMine/.test(idJs) && /fetchMany/.test(idJs))
  ok('绑定走 openid（取自 wxhost）', /myOpenid[\s\S]{0,160}getSaved/.test(idJs))
  ok('列表固定发布当时状态（不按 openid 实时切）',
    bdJs2.indexOf('profiles[it.openid]') < 0 && bdJs2.indexOf('ID.fetchMany') < 0 &&
    /it\.honor \|\|/.test(bdJs2) && /it\.honorMetal \|\|/.test(bdJs2) && /it\.klass \|\|/.test(bdJs2) &&
    /发布当时的快照/.test(bdJs2))
  ok('旧帖纯文字拆回奖杯牌匾', /parseOldWho/.test(bdJs2) && /hasName/.test(bdJs2) &&
    /metalOfName/.test(bdJs2) && /typeof w === 'string'/.test(bdJs2) &&
    /writeWho\(it\.id/.test(bdJs2))
  ok('进页与发帖都绑定身份', (bdJs2.match(/ID\.bindMine/g) || []).length >= 2)
  ok('未登录不挂金属头衔（登录后显示）', meWxml2.indexOf('登录后显示头衔') >= 0 && /user && title/.test(meWxml2))

  console.log('\n=== 20d-2. 头像昵称真绑定 openid（不再只存本机） ===')
  ok('user_profile 加头像昵称列', /ALTER TABLE user_profile ADD COLUMN nickname/.test(srvBind) && /ALTER TABLE user_profile ADD COLUMN avatar/.test(srvBind))
  ok('POST profile 接收昵称头像', /nickname: String\(b\.nickname/.test(srvBind) && /avatar: cleanAvatar/.test(srvBind))
  ok('头像只收 data:image base64 且限体积', /data:image\//.test(srvBind) && /900000/.test(srvBind))
  ok('云端空值不覆盖旧资料', /nickname=IF\(VALUES\(nickname\)/.test(srvBind) && /avatar=IF\(VALUES\(avatar\)/.test(srvBind))
  ok('GET profile 返回头像昵称', /author, nickname, avatar/.test(srvBind))
  ok('授权确认后头像昵称上云（走 openid）', /avatarDataUrl/.test(meJs2) && /wxhost\.call\('\/api\/profile', \{ nickname: nick, avatar: avatar \}, 'POST'\)/.test(meJs2))
  ok('换设备从云端恢复头像昵称', /restoreProfileFromCloud/.test(meJs2) && /body\.profiles\[oid\]/.test(meJs2))
  ok('云端资料回写本机缓存', /setStorageSync\(PROFILE_KEY, \{ name: nick, avatarUrl: av/.test(meJs2))
  ok('没拿到 openid 不冒充已绑定', meJs2.indexOf('已存本机（未绑账号）') >= 0)
  ok('去掉"不上传服务器"误导文案', meWxml2.indexOf('不上传服务器') < 0 && meWxml2.indexOf('换设备登录自动恢复') >= 0)
  ok('弹层说明需点一下确认并绑定', meWxml2.indexOf('绑定微信身份') >= 0 && meWxml2.indexOf('换设备登录也能恢复') >= 0)

  console.log('\n=== 20c. 语音探测：HTTP 400 判为明确不支持 ===')
  const probeJs2 = fs.readFileSync(path.join(ROOT, 'utils/audio-probe.js'), 'utf8')
  const ivJs2 = fs.readFileSync(path.join(ROOT, 'pages/interview/index.js'), 'utf8')
  ok('探测把 400 判为拒绝', /status === 400/.test(probeJs2) && /http\s*400/.test(probeJs2))
  ok('探测返回 reason 区分 400', probeJs2.indexOf("reason:") >= 0 && probeJs2.indexOf("'http400'") >= 0)
  ok('400 弹窗给出确定结论（不用重试）', ivJs2.indexOf('结论已确定，不用重复点检测') >= 0)

  console.log('\n=== 21. 反馈 → 荣誉：我的页与发帖 ===')
  const CT = require('./miniprogram/utils/contribute')
  delete store[CT.K_FB]
  delete store[CT.K_FIRST]
  const zf1 = await CT.submit({ type: 'fix', text: '吉芯楼那门课地点写错了，应该是 202', where: '课表' })
  eq('纠错反馈落本机', zf1.ok + ':' + zf1.count, 'true:1')
  await CT.submit({ type: 'idea', text: '课表导入希望能直接粘贴整张表', where: '课表页' })
  const zst = await CT.stats(true)
  eq('统计里纠错 1 条、建议 1 条', zst.fbFix + '/' + zst.fbIdea, '1/1')
  ok('首次登入时间记下来了', zst.firstAt > 0)
  // 示例课表不算「交课表」：没做过也显示已获得就是这里漏的
  const contribJs2 = fs.readFileSync(path.join(ROOT, 'utils/contribute.js'), 'utf8')
  ok('示例课表不计入资料贡献', contribJs2.indexOf('TT.isDemo') >= 0 && /tt: ttCount\(\)/.test(contribJs2))
  const zht = HO.titleOf(zst, now0)
  eq('两条腿拿到校园共建者', HO.titleOf({ firstAt: 0, tt: 0, fbDocs: 0, fbFix: 1, fbIdea: 1, posts: 0 }, now0).n, '校园共建者')
  const boardLocal = store['local_board_v1'] || []
  eq('反馈不计入互助条目', zst.posts, boardLocal.filter((x) => x.cat !== 'feedback' && x.cat !== 'canteen').length)

  // 我的页从空索引开始建，别继承上一节留下的班
  delete store[KL.K_LIST]
  delete store[KL.K_CUR]
  const zmeCfg = loadPage('pages/me/index.js')
  eq('我的页 wxml 绑定的方法都存在', checkHandlers('pages/me/index.js', zmeCfg), [])
  const zmeWxml = fs.readFileSync(path.join(ROOT, 'pages/me/index.wxml'), 'utf8')
  ok('头衔在头像那一行下面', zmeWxml.indexOf('class="hp-row"') > zmeWxml.indexOf('class="h-row"'))
  ok('头衔文案来自 honor 计算', zmeWxml.indexOf('{{title.n}}') >= 0 && zmeWxml.indexOf('cupSrc') >= 0)
  ok('班级也显示在头像下面', zmeWxml.indexOf('{{klassText') >= 0 && zmeWxml.indexOf('openKlass') >= 0)
  ok('我的记录里有意见反馈入口', zmeWxml.indexOf('bindtap="openFb"') >= 0)
  ok('荣誉说明列出五项（已获得/未获得分两组渲染）', (zmeWxml.match(/wx:for="\{\{honors\}\}"/g) || []).length === 2 && HO.HONORS.length === 5)
  const zme = instance(zmeCfg)
  zme.setData({ klassList: [], klassText: '' })
  zme.openKlass()
  zme.onKlassInput({ detail: { value: '23计算机科学与技术4班' } })
  zme.createKlass()
  eq('我的页里建班成功并选中', zme.data.klassText, '《23计科4班》')
  zme.onKlassInput({ detail: { value: '23计科4班' } })
  zme.createKlass()
  // 索引首项是「不设班级」，所以建一个班后列表是 2 项
  eq('再建同一个班被拦', zme.data.klassErr + '/' + zme.data.klassList.length, '/2')
  ok('拦下时给了解释', zme.data.klassNotice.indexOf('已经建过') >= 0)
  zme.openFb()
  zme.pickFbType({ currentTarget: { dataset: { i: 2 } } })
  zme.onFbText({ detail: { value: '' } })
  await zme.submitFb()
  eq('反馈太短不提交', zme.data.fbBusy, false)
  zme.onFbText({ detail: { value: '课表里还缺体育课的上课地点' } })
  await zme.submitFb()
  eq('提交后弹层关掉', zme.data.showFb, false)
  eq('资料补充记了一条', CT.fbCount('docs'), 1)

  const zbdCfg = loadPage('pages/board/index.js')
  eq('互助墙 wxml 绑定的方法都存在', checkHandlers('pages/board/index.js', zbdCfg), [])
  const zbdWxml = fs.readFileSync(path.join(ROOT, 'pages/board/index.wxml'), 'utf8')
  ok('卡片上标班级与头衔', zbdWxml.indexOf('{{item.whoText}}') >= 0)
  ok('发布面板显示以哪个身份发', zbdWxml.indexOf('{{klassText') >= 0 && zbdWxml.indexOf('{{honor.n}}') >= 0)
  const zbdJs = fs.readFileSync(path.join(ROOT, 'pages/board/index.js'), 'utf8')
  ok('发帖把班级头衔写进记录', /klass: klassText/.test(zbdJs) && /honor: honorName/.test(zbdJs) && /honorMetal: honor \? honor\.metal/.test(zbdJs))
  ok('云端不回传身份时按 id 从本机补回', /WHO_KEY/.test(zbdJs) && /whoMap\[String\(it\.id\)\]/.test(zbdJs))
  ok('反馈记录不会混进互助墙', zbdJs.indexOf("it.cat !== 'feedback'") >= 0)
  const zbd = instance(zbdCfg)
  global.wx.getStorageSync = (k) => (k in store ? store[k] : '')
  zbd.setData({ klassText: '《23计科4班》', honor: { n: '校园共建者', metal: 'silver' }, authorName: '测试同学' })
  zbd.setData({ title: '丢了一把伞', desc: '今天下午在吉芯楼 103 落了一把黑伞', catIndex: 0 })
  let zposted = null
  const zdbMod = require('./miniprogram/utils/db')
  const zkeepAdd = zdbMod.add
  zdbMod.add = async (name, doc) => { zposted = doc; return { ok: true, synced: true } }
  await zbd.submit()
  zdbMod.add = zkeepAdd
  eq('发帖带上班级/头衔/作者', zposted && (zposted.klass + '|' + zposted.honor + '|' + zposted.honorMetal), '《23计科4班》|校园共建者|silver')

  console.log('\n=== 22. 班级粒度 / 分班课表 / 分享提示 / 反馈后台 ===')
  {
    // 班级：只到年级专业、不用班级
    eq('只到年级专业被认可', KL.parse('23计科').ok, true)
    eq('只到年级专业的 key', KL.parse('23计科').k, '23计科')
    eq('带班号的仍独立', KL.parse('23计科4班').k, '23计科4班')
    eq('「不设班级」识别为清除', KL.parse('不设班级').none, true)
    ok('不设班与年级专业是两把 key', KL.parse('不设班级').k !== KL.parse('23计科').k)
    // 快照首项是「不设班级」
    delete store[KL.K_LIST]; delete store[KL.K_CUR]
    const snap = KL.snapshot()
    eq('快照首项是不设班级', snap.list[0].text, KL.NONE_TEXT)
    KL.add('23计科'); KL.add('23计科4班')
    eq('年级专业与带班号各存一条', KL.snapshot().list.length, 3)
    eq('只到年级专业不带班号字段', KL.read().filter(x => x.k === '23计科')[0].no, '')

    // 分班存储：两份课表 key 不同
    TT.write([{ n: 'A' }], '23计科')
    TT.write([{ n: 'B' }], '23计科4班')
    eq('按班级分份 key', TT.read('23计科').map(x => x.n), ['A'])
    eq('另一班互不干扰', TT.read('23计科4班').map(x => x.n), ['B'])
    eq('不设班级仍是公共那份', TT.storeKey(''), 'timetable')
    eq('带班级用后缀', TT.storeKey('23计科'), 'timetable::23计科')

    // 课表页 onShow 切班级会换数据
    KL.pick('23计科')
    const tcfg = loadPage('pages/timetable/index.js')
    const tpage = instance(tcfg)
    tpage.onLoad()
    eq('课表页跟随当前班级', tpage.data.ck, '23计科')
    eq('读到该班那份', tpage.data.list.map(x => x.n), ['A'])
    KL.pick('23计科4班')
    tpage.onShow()
    eq('切班级后换课表', tpage.data.list.map(x => x.n), ['B'])
    eq('顶部显示班级名', tpage.data.klassText, '《23计科4班》')

    // 分享提示：弹窗提到头衔，确认走 docs 提交
    const ttJs = fs.readFileSync(path.join(ROOT, 'pages/timetable/index.js'), 'utf8')
    ok('分享弹窗说明头衔', ttJs.indexOf('资料补充者') >= 0 && ttJs.indexOf('提交分享') >= 0)
    ok('分享作为资料补充提交', /type: 'docs'/.test(ttJs))
    ok('每份课表只问一次', /SHARE_ASK/.test(ttJs) && /shareAsked/.test(ttJs))

    // 反馈后台：导出 + 独立网页
    const meJs = fs.readFileSync(path.join(ROOT, 'pages/me/index.js'), 'utf8')
    ok('我的页有导出反馈', /exportFb/.test(meJs) && /setClipboardData/.test(meJs))
    const admin = fs.readFileSync(path.join(__dirname, 'docs/admin-feedback/index.html'), 'utf8')
    ok('后台支持粘贴与接口两种模式', admin.indexOf('loadPaste') >= 0 && admin.indexOf('loadApi') >= 0)
    ok('后台按三类统计', ['fix', 'idea', 'docs'].every(k => admin.indexOf(k) >= 0))
    ok('后台能标记处理状态', admin.indexOf('KEY_DONE') >= 0)

    // 统一 LLM 代理回归：key 只在云托管、前端零 key、cloud.llm 形状兼容
    const srv = fs.readFileSync(path.join(__dirname, 'cloudrun/wxlogin/server.js'), 'utf8')
    ok('云托管有 /api/llm 对话代理', /app\.post\(['"]\/api\/llm['"]/.test(srv))
    ok('云托管有 /api/llm/models', /app\.get\(['"]\/api\/llm\/models['"]/.test(srv))
    ok('云托管有真流式 /api/llm/stream', /app\.post\(['"]\/api\/llm\/stream['"]/.test(srv) && /text\/event-stream/.test(srv))
    ok('流式逐段解析 SSE delta', /httpsPostStream/.test(srv) && /delta\.content/.test(srv))
    ok('密钥从服务端环境变量读', /process\.env\.DS_KEY/.test(srv) && /require\(['"]\.\/llm\.config['"]\)/.test(srv))
    ok('说明页标注密钥仅在服务端', /密钥仅在服务端/.test(srv))
    // 前端任何 js 都不得出现 sk- 密钥（反编译会泄露）
    let leaked = []
    ;(function walk(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name)
        if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== 'miniprogram_npm') walk(p) }
        else if (f.name.endsWith('.js')) {
          const s = fs.readFileSync(p, 'utf8')
          if (/sk-[A-Za-z0-9]{20,}/.test(s)) leaked.push(path.relative(ROOT, p))
        }
      }
    })(ROOT)
    ok('前端代码不含 sk- 密钥', leaked.length === 0, leaked.join(','))
    const llmJs = fs.readFileSync(path.join(ROOT, 'utils/llm.js'), 'utf8')
    ok('LLM 兼容层有 models.list', /models:\s*\{\s*list:/.test(llmJs))
    ok('LLM 兼容层是流式 generator', /async function\* create/.test(llmJs) && /delta:\s*\{\s*content:/.test(llmJs))
    ok('LLM 优先走真流式 callStream', /callStream\(['"]\/api\/llm\/stream['"]/.test(llmJs))
    ok('LLM 流式失败回落非流式', /\/api\/llm['"]/.test(llmJs) && /streamed/.test(llmJs))
    const wxhostJs = fs.readFileSync(path.join(ROOT, 'utils/wxhost.js'), 'utf8')
    ok('wxhost 有 enableChunked 真流式', /enableChunked:\s*true/.test(wxhostJs) && /onChunkReceived/.test(wxhostJs))
    ok('wxhost 处理跨包 UTF-8 截断', /decodeUtf8/.test(wxhostJs))
    const cloudJs = fs.readFileSync(path.join(ROOT, 'utils/cloud.js'), 'utf8')
    ok('cloud.llm 挂到代理', /cloud\.llm\s*=\s*llm/.test(cloudJs))

    // 底部导航内嵌图标必须与新生成的 t-*.png 同步（不能停在旧 base64）
    const crypto = require('crypto')
    const tabCss = fs.readFileSync(path.join(ROOT, 'custom-tab-bar/index.wxss'), 'utf8')
    const embedded = [...tabCss.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map(m =>
      crypto.createHash('md5').update(Buffer.from(m[1], 'base64')).digest('hex').slice(0, 10))
    let tabSynced = 0
    for (const n of ['home', 'service', 'chat', 'me', 'asean']) {
      for (const suf of ['', '-active']) {
        const f = path.join(ROOT, 'images/icons/t-' + n + suf + '.png')
        if (!fs.existsSync(f)) continue
        const h = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 10)
        if (embedded.indexOf(h) >= 0) tabSynced++
      }
    }
    ok('底部导航用的是新版图标（10 张 base64 同步）', tabSynced === 10, 'synced=' + tabSynced + '/10')

    // 查缺补漏回归：荣誉说明只渲染一遍（曾有重复行）
    const meWxml = fs.readFileSync(path.join(ROOT, 'pages/me/index.wxml'), 'utf8')
    ok('荣誉说明不重复渲染', !/\<view class="hn-note"\}\{\{honorNote\}\}\<\/view\>\s*\n\s*\<view class="hn-note"\}\{\{honorNote\}\}\<\/view\>/.test(meWxml))
  }

  console.log('\n=== 结果 PASS=' + PASS + ' FAIL=' + FAIL + ' ===')
  process.exit(FAIL ? 1 : 0)
})().catch((e) => {
  console.error('\n脚本异常：', e && e.stack ? e.stack : e)
  process.exit(2)
})
