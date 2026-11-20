// pages/service/index.js
const { ALL_PLATFORM, LIFE_SVC, STUDY_SVC, DEF_ADDR } = require('../../utils/biz')
const { syncTabBar } = require('../../utils/tabbar')

// 站外入口（从首页搬到服务页）：小程序打不开外部网页/App，只能复制链接 + 说明
const JUMPS = [
  { k: 'tmall', ic: '/images/brand/tmall.png', n: '天猫购物', tag: '浏览器', s: '微信内打不开淘宝/天猫' },
  { k: 'jiaowu', ic: '/images/brand/jiaowu.png', n: '教务系统', tag: '浏览器', s: '选课 · 成绩 · 课表' },
  { k: 'yxy', ic: '/images/brand/yxy.png', n: '易校园', tag: 'App', s: '快递取件 · 校园卡 · 正式报修' },
]
const JUMP_URL = {
  tmall: { url: 'https://www.tmall.com/', tip: '天猫链接已复制。微信生态里打不开淘宝/天猫（也没有天猫小程序），只能去浏览器；校园里的二手和团购可以走站内「校园互助」。' },
  jiaowu: { url: ALL_PLATFORM.jiaowu.url, tip: '教务系统链接已复制。它需要学号+密码+验证码登录，属于个人数据，小程序内不能代登录，请到浏览器打开。' },
  yxy: { url: ALL_PLATFORM.express.url, tip: '易校园下载页已复制。快递取件、校园卡、正式报修在易校园 App 里办；站内已经能查快递轨迹、办事指南里有报到流程。' },
}

const LOGOS = {
  canteen: '/images/svc/canteen.png',
  express: '/images/brand/cainiao.png',
  aseanGo: '/images/brand/asean.png',
  jiaowu: '/images/brand/jiaowu.png',
  zhixu: '/images/brand/zhixu.png',
}
const ICONS = {
  canteen: '/images/svc/canteen.png', express: '/images/svc/express.png', market: '/images/svc/market.png',
  errand: '/images/svc/errand.png', lost: '/images/svc/lost.png', repair: '/images/svc/clipboard.png',
  schedule: '/images/svc/calendar.png', analytics: '/images/svc/chart.png', aseanGo: '/images/svc/globe.png',
  jiaowu: '/images/brand/jiaowu.png', zhixu: '/images/brand/zhixu.png',
}
const TITLES = {
  canteen: '食堂点餐', express: '快递服务', market: '二手交易', errand: '校园跑腿',
  lost: '失物招领', repair: '办事指南', schedule: '智能课表', analytics: '消费分析',
  aseanGo: '东盟专区', jiaowu: '教务系统', zhixu: '智圩项目学习',
}
const DES = {
  canteen: '站内看五个食堂的档口清单，以及校园周边 16 家外卖店的评分、月售、起送与配送费，价格按品类横向对比；下单仍在美团外卖完成。',
  express: '输入单号在站内直接查真实物流轨迹；取件码与驿站位置仍以支付宝「菜鸟驿站」和短信为准。',
  market: '校园二手在站内互助墙直接发，云端可见，不用再装一个 App。',
  errand: '求助互帮在站内互助墙直接发：借东西、带饭、代取，谁看到谁回。',
  lost: '失物招领在站内互助墙直接发，捡到东西也能发一条让人认领。',
  repair: '办事指南：请假、缓考、重修、教材、借书、学籍、入团等 ' + require('../../data/guide').DAILY.length + ' 件事，每件写清要带什么材料（可勾选，进度留在手机上）、怎么办、去哪办（地点和电话）、容易卡住的地方，并标了出自哪份学校文件。这里只讲清楚怎么办，不代办、不转交。',
  schedule: '真实课表在易校园官方 App 内导入教务系统查看。',
  analytics: '真实消费记录请到对应支付平台查看。',
  aseanGo: '东盟专区提供实时汇率、在线翻译与十国公开国情资料。',
  jiaowu: '强智科技教务系统学生端：选课、成绩、考试安排、课表、毕业审核都在这里。用学号 + 密码 + 验证码登录，成绩与课表属于个人数据，只能你本人查看。小程序内不能嵌入学校内网地址，点「复制链接」后用浏览器打开。',
  zhixu: '学校项目制教学平台：我的协作、课堂学习、题库练习、项目大厅、团队工坊、项目报告，以及能力与技能、星系图谱、智能简历。用学校分配的学号/工号登录，忘记密码可在登录页自助找回。',
}

// 站内能办事的入口：直接进页面，不再往外跳
const IN_APP = {
  // 宿舍报修已下线（自建工单没有真实下游），改成有出处的办事指南
  repair: '/pages/guide/index',
  lost: '/pages/board/index?cat=lost',
  market: '/pages/board/index?cat=second',
  errand: '/pages/board/index?cat=help',
  express: '/pages/express/index',
  // 食堂：站内看五个食堂的档口与对比，外卖从页面里再跳美团
  canteen: '/pages/canteen/index',
}

Page({
  data: {
    lifeSvc: LIFE_SVC.map(s => Object.assign({}, s, { icon: ICONS[s.d], logo: LOGOS[s.d] || '' })),
    studySvc: STUDY_SVC.map(s => Object.assign({}, s, { icon: ICONS[s.d], logo: LOGOS[s.d] || '' })),
    // Bento 版式：主卡 + 双列小盒 + 通栏尾卡
    feat: Object.assign({}, LIFE_SVC[0], { icon: ICONS[LIFE_SVC[0].d], logo: LOGOS[LIFE_SVC[0].d] || '' }),
    lifeCells: LIFE_SVC.slice(1, 5).map(s => Object.assign({}, s, { icon: ICONS[s.d], logo: LOGOS[s.d] || '' })),
    tail: LIFE_SVC[5] ? Object.assign({}, LIFE_SVC[5], { icon: ICONS[LIFE_SVC[5].d], logo: LOGOS[LIFE_SVC[5].d] || '' }) : null,
    platCells: STUDY_SVC.slice(0, 2).map(s => Object.assign({}, s, { icon: ICONS[s.d], logo: LOGOS[s.d] || '' })),
    studySmall: STUDY_SVC.slice(2).map(s => Object.assign({}, s, { icon: ICONS[s.d], logo: LOGOS[s.d] || '' })),
    addr: DEF_ADDR,
    jumps: JUMPS,
    showDetail: false,
    detailTitle: '', detailDesc: '', detailTag: '', hasPlatform: false, plat: null,
    btnMain: '', btnAlt: '',
    curType: '',
  },
  onShow() {
    syncTabBar(this, 1)
    const focus = wx.getStorageSync('serviceFocus')
    if (focus) { wx.removeStorageSync('serviceFocus'); this.openDetail({ currentTarget: { dataset: { d: focus } } }) }
  },
  openDetail(e) {
    const d = e.currentTarget.dataset.d
    if (d === 'aseanGo') { wx.switchTab({ url: '/pages/asean/index' }); return }
    if (IN_APP[d]) { wx.navigateTo({ url: IN_APP[d] }); return }
    const plat = ALL_PLATFORM[d]
    const isApp = !!plat && plat.kind === 'app'
    this.setData({
      showDetail: true, curType: d,
      detailTitle: TITLES[d] || '服务详情',
      detailDesc: DES[d] || '该服务对接真实平台办理。',
      detailTag: plat ? (isApp ? '需官方 App 办理' : '真实平台跳转') : '暂无数据源',
      hasPlatform: !!plat, plat: plat || null,
      btnMain: plat ? (isApp ? '打开 App ↗' : '复制链接 ↗') : '',
      btnAlt: isApp ? '下载 App' : '',
    })
  },
  closeDetail() { this.setData({ showDetail: false }) },

  // 站外入口：复制链接 + 说清为什么进不去
  doJump(e) {
    const j = JUMP_URL[e.currentTarget.dataset.k]
    if (!j) return
    wx.setClipboardData({
      data: j.url,
      success: () => wx.showModal({
        title: '需要跳转',
        content: j.tip,
        showCancel: false,
        confirmText: '知道了',
      }),
    })
  },
  // 校园导览：四岭 / 食堂档口 / 摆渡车 / 常用电话
  goLife() { wx.navigateTo({ url: '/pages/life/index' }) },
  // 面试是独立模块，不挂在吉利专区下面：这里直接进，默认普通面
  goInterview() { wx.navigateTo({ url: '/pages/interview/index?track=normal' }) },
  // 吉利专区：招聘折叠在专区里，直接落在「校园招聘」页签
  goCareer() { wx.navigateTo({ url: '/pages/geely/index?tab=campus' }) },
  goReport() { wx.navigateTo({ url: '/pages/guide/index' }) },
  goBoard() { wx.navigateTo({ url: '/pages/board/index' }) },
  // App 唤起（安卓 intent / 美团 scheme），失败由系统处理
  openApp() {
    const p = this.data.plat
    if (!p) return
    // 网页型平台（教务系统、智圩）：小程序不能打开外部浏览器，直接给可用链接
    if (p.kind === 'web') { this.doWeb(p.url); return }
    if (p.kind === 'app') {
      wx.setClipboardData({ data: this.data.addr.name + ' ' + this.data.addr.detail })
      wx.showModal({
        title: '在易校园 App 内办理',
        content: '该服务需在易校园官方 App 内办理。已为你复制学校地址。若未安装，请点「下载 App」。',
        confirmText: '下载 App', cancelText: '知道了',
        success: (r) => { if (r.confirm) this.openWeb() },
      })
      return
    }
    // 美团：先试拉起美团小程序，失败再复制链接兜底
    const MT_APPID = 'wxde8ac0a21135c07d'
    if (wx.navigateToMiniProgram) {
      wx.navigateToMiniProgram({
        appId: MT_APPID,
        envVersion: 'release',
        fail: () => this.openMeituanFallback(),
      })
      return
    }
    this.openMeituanFallback()
  },

  // 美团兜底：复制学校地址 + H5 链接，提示浏览器打开
  openMeituanFallback() {
    const p = this.data.plat
    wx.setClipboardData({ data: this.data.addr.name + ' ' + this.data.addr.detail })
    wx.showModal({
      title: '前往美团外卖',
      content: '已复制学校地址。点「打开」后请在浏览器地址栏粘贴访问美团外卖，并将地址设为学校。',
      confirmText: '打开', cancelText: '取消',
      success: (r) => { if (r.confirm) this.doWeb(p.url) },
    })
  },
  openWeb() {
    const p = this.data.plat
    if (!p) return
    const isIOS = wx.getSystemInfoSync().platform === 'ios'
    this.doWeb(isIOS && p.urlIos ? p.urlIos : p.url)
  },
  doWeb(url) {
    // 小程序无法直接打开外部浏览器；提供复制链接 + 提示
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，用浏览器打开', icon: 'none', duration: 2500 }),
    })
  },
})
