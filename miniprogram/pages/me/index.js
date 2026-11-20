// pages/me/index.js —— 我的：微信身份
// 三条路，从上往下自动降级，用户不会卡在点了没反应的按钮上：
//   1) 云托管登录（wxhost）——微信注入 X-WX-OPENID，真 openid，无需 AppSecret
//   2) 云端微信登录（signInWithWechat）——需要在云服务后台绑定小程序 AppID
//   3) 微信资料授权（chooseAvatar + nickname）——不需要后端，头像昵称只存本机
const { cloud, modelLabel, ALL_PLATFORM } = require('../../utils/biz')
const { KB_SIZE } = require('../../utils/kb')
const { syncTabBar } = require('../../utils/tabbar')
const wxhost = require('../../utils/wxhost')
const db = require('../../utils/db')
const health = require('../../utils/health')
const K = require('../../utils/klass')
const H = require('../../utils/honor')
const C = require('../../utils/contribute')

const PROFILE_KEY = 'wx_profile_v1'
const AVATAR_FILE = 'wx_avatar.png'

// 金属 → 奖杯图标（金大 / 银中 / 铜小），无头衔时留空
const CUP_SRC = {
  gold: '/images/icons/trophy_gold.png',
  silver: '/images/icons/trophy_silver.png',
  bronze: '/images/icons/trophy_bronze.png',
}
const cupSrc = (metal) => CUP_SRC[metal] || ''
// 当前账号的唯一键（openid）：头衔选择按它分份存，换账号不串、换设备能恢复
const myOid = () => {
  try { const h = wxhost.getSaved(); return (h && h.openid) || '' } catch (e) { return '' }
}

function friendlyAuthError(msg) {
  const raw = String(msg || '')
  if (/未授权|not authorized|unauthorized|no permission|未注册/i.test(raw)) {
    return '云端登录还没开通：需要先把小程序 AppID 绑定到云服务，绑定后这里自动可用。'
  }
  if (/network|timeout|超时|网络/i.test(raw)) {
    return '网络不太稳，登录没走通，稍后再试一次。'
  }
  return '登录没成功，稍后再试一次。'
}

// 云函数、云托管两条通道都没通时，给一句照做就能解决的话（带上真实原因，不要让用户猜）
function missHint(reason) {
  const r = String(reason || '')
  if (/云函数没部署|没有拿到 openid/.test(r)) {
    return '微信登录还差一步：开发者工具左侧右键 cloudfunctions/quickstartFunctions → 「上传并部署：云端安装依赖」，十几秒就好。原始原因：' + r
  }
  if (/云开发环境|没有开通云开发/.test(r)) {
    return '云开发环境没对上：确认小程序已开通云开发，并把 utils/wxhost.js 顶部的 ENV 改成自己的环境 ID。原始原因：' + r
  }
  return '微信登录没走通：' + r
}

Page({
  data: {
    user: null, userName: '', avatarUrl: '', userIdShort: '',
    loggingIn: false, loginError: '', modelName: '',
    kbSize: KB_SIZE, platCount: Object.keys(ALL_PLATFORM).length,
    // 微信资料授权弹层
    showAuth: false, draftAvatar: '', draftNick: '', saving: false,
    isLocal: false, cloudLogin: false,
    // 身份展示与"补全资料"引导
    subText: '', badgeText: '', needProfile: false,
    // 我的记录
    repairCount: 0, postCount: 0,
    // 班级索引
    klassText: '', klassList: [], showKlass: false, klassInput: '', klassErr: '', klassNotice: '',
    // 荣誉与头衔
    title: null, honors: [], honorNote: '', fedCount: 0,
    // 头衔选择：只显示一枚，从已获得里挑（弹层）
    showTitle: false, titleOptions: [], autoCur: false,
    // 反馈
    showFb: false, fbTypes: C.TYPES, fbType: 1, fbText: '', fbWhere: '', fbBusy: false, fbTip: '',
    // 环境自检
    checking: false, checks: [], okCount: 0, total: 0,
  },

  async onShow() {
    syncTabBar(this, 4)
    const app = getApp()
    if (app.authReady) await app.authReady.catch(() => null)
    await this.restore()
    this.loadModel()
    this.loadCounts()
    this.loadHonor()
  },

  // 头衔与荣誉：统计口径在 utils/contribute.js，规则在 utils/honor.js
  // 先用本机数据画一版（不用等云端），帖子数回来后再刷一次
  async loadHonor() {
    const snap = K.snapshot()
    this.paintHonor(snap, C.localStats())
    try { this.paintHonor(snap, await C.stats()) } catch (e) {}
  },

  paintHonor(snap, stat) {
    const honors = H.compute(stat).map((x) => Object.assign({}, x, { cupSrc: cupSrc(x.metal) }))
    const title = H.titleOf(stat)
    const pioneer = honors.filter((x) => x.k === 'pioneer')[0]
    // 可选的头衔只有「已获得」的那一批；自动档 = 没选过，或选的头衔已失效
    const got = honors.filter((x) => x.got).map((x) => Object.assign({}, x, { cur: !!(title && title.k === x.k) }))
    const picked = H.readPick(myOid())
    this.setData({
      klassText: snap.curText,
      klassList: snap.list,
      honors,
      title,
      cupSrc: cupSrc(title && title.metal),
      titleOptions: got,
      autoCur: !picked || !got.some((x) => x.k === picked),
      fedCount: stat.fbTotal || 0,
      honorNote: pioneer && pioneer.daysLeft > 0
        ? '活动还剩 ' + pioneer.daysLeft + ' 天：' + H.DEADLINE_TEXT + ' 前登入，先驱者就是金色；之后再登入是铜色。'
        : '活动已于 ' + H.DEADLINE_TEXT + ' 结束，先驱者按登入时间分金 / 铜。',
    })
  },

  // ---------- 头衔选择：只显示一枚，从已获得里挑 ----------
  // 荣誉是本机真实动作算的，跟登录无关，所以未登录也能看/选；选择按 openid 存份
  openTitle() {
    if (!this.data.titleOptions.length) { wx.showToast({ title: '还没有已获得的头衔', icon: 'none' }); return }
    this.setData({ showTitle: true })
  },
  closeTitle() { this.setData({ showTitle: false }) },
  pickTitle(e) {
    const k = e.currentTarget.dataset.k || ''
    // 只允许选已获得的（k 空串 = 恢复自动），杜绝构造数据选出没拿到的头衔
    if (k && !this.data.titleOptions.some((x) => x.k === k)) return
    H.writePick(k, myOid()) // 按 openid 分份写，换账号不串
    this.setData({ showTitle: false })
    this.loadHonor()
    wx.showToast({ title: k ? '头衔已换成所选' : '已恢复自动 · 取最高级', icon: 'none' })
  },

  async loadCounts() {
    try {
      const r = await db.mine(db.REPAIR, 30)
      const b = await db.mine(db.BOARD, 30)
      this.setData({
        repairCount: (r.items || []).length,
        postCount: (b.items || []).length,
      })
    } catch (e) {}
  },

  goReport() { wx.navigateTo({ url: '/pages/guide/index' }) },
  goBoard() { wx.navigateTo({ url: '/pages/board/index' }) },

  // ---------- 班级索引：建过的不能再建，同类写法也拦 ----------
  openKlass() {
    const snap = K.snapshot()
    this.setData({
      showKlass: true, klassInput: '', klassErr: '', klassNotice: '',
      klassList: snap.list, klassText: snap.curText,
    })
  },
  closeKlass() { this.setData({ showKlass: false }) },
  onKlassInput(e) { this.setData({ klassInput: e.detail.value, klassErr: '', klassNotice: '' }) },
  // 索引一变就刷新列表与顶部展示，不用关掉弹层也能看见结果
  applyKlass() {
    const snap = K.snapshot()
    this.setData({ klassList: snap.list, klassText: snap.curText })
  },
  createKlass() {
    const r = K.add(this.data.klassInput)
    if (!r.ok) {
      if (r.why === 'exists') {
        // 换个写法也算同班：不新建，直接把已有的选上，别让索引里出现两条一样的班
        K.pick(r.k)
        this.setData({ klassErr: '', klassNotice: '《' + r.k + '》已经建过了，同类班级不再新建，已经帮你选上。' })
        this.applyKlass()
      } else {
        this.setData({ klassErr: r.why })
      }
      return
    }
    K.pick(r.k)
    const msg = r.none
      ? '已设为「不设班级」，课表用公共那份。'
      : '已创建并设为我的班级：' + K.display(r.k)
    this.setData({ klassInput: '', klassErr: '', klassNotice: msg })
    this.applyKlass()
  },
  pickKlass(e) {
    const k = e.currentTarget.dataset.k || ''
    const r = K.pick(k)
    if (!r.ok) { this.setData({ klassErr: r.why }); return }
    this.setData({ klassErr: '', klassNotice: '已选：' + K.display(k) + '，课表也换成对应那份' })
    this.applyKlass()
  },

  // 把本机全部反馈导成 JSON，粘进网页后台即可查看；与云端数据来自同一套结构
  exportFb() {
    const list = C.readFb()
    if (!list.length) { wx.showToast({ title: '还没有反馈可导出', icon: 'none' }); return }
    const payload = JSON.stringify({ source: '数科云栖校园', exportedAt: Date.now(), items: list })
    wx.setClipboardData({
      data: payload,
      success: () => wx.showToast({ title: '已复制 ' + list.length + ' 条，去后台粘贴', icon: 'none' }),
    })
  },

  // ---------- 意见反馈：纠错 / 建议 / 资料补充，提交即计入荣誉 ----------
  openFb() {
    this.setData({ showFb: true, fbText: '', fbWhere: '', fbTip: '', fbBusy: false })
  },
  closeFb() { this.setData({ showFb: false }) },
  pickFbType(e) { this.setData({ fbType: Number(e.currentTarget.dataset.i), fbTip: '' }) },
  onFbText(e) { this.setData({ fbText: e.detail.value }) },
  onFbWhere(e) { this.setData({ fbWhere: e.detail.value }) },
  async submitFb() {
    if (this.data.fbBusy) return
    const text = String(this.data.fbText || '').trim()
    if (text.length < 4) { this.setData({ fbTip: '多写两句，方便照着改' }); return }
    this.setData({ fbBusy: true, fbTip: '' })
    const t = C.TYPES[this.data.fbType]
    const r = await C.submit({ type: t.k, text: text, where: this.data.fbWhere })
    C.clearCache()
    await this.loadHonor()
    this.setData({ fbBusy: false, showFb: false, fbText: '', fbWhere: '' })
    wx.showToast({ title: r.synced ? ('已提交 · ' + t.n + '记一条') : '已存本机（云端未通）', icon: 'none' })
  },

  // 环境自检：把四个外部依赖逐项探一遍
  async runCheck() {
    if (this.data.checking) return
    this.setData({ checking: true, checks: [] })
    const r = await health.runChecks()
    this.setData({
      checking: false,
      checks: r.items,
      okCount: r.okCount,
      total: r.total,
    })
  },

  async loadModel() {
    try {
      const models = await cloud.llm.models.list()
      const m = models.find(x => x.disabled !== true)
      if (m) this.setData({ modelName: modelLabel(m) })
    } catch (e) {}
  },

  async restore() {
    // 先看云端会话
    try {
      const { data: session } = await getApp().ensureSession()
      if (session && session.user) { this.applyUser(session.user); return }
    } catch (e) {}
    // 再看云托管登录态（openid 存在本机，重启后直接复原）
    const h = wxhost.getSaved()
    if (h && h.openid) { this.applyCloudHost(h); return }
    // 再退到本机保存的微信资料
    const p = wx.getStorageSync(PROFILE_KEY)
    if (p && p.name) { this.applyLocal(p); return }
    this.setData({ user: null, isLocal: false, cloudLogin: false, subText: '', badgeText: '', needProfile: false })
  },

  applyUser(u) {
    if (!u) { this.setData({ user: null, isLocal: false, cloudLogin: false, subText: '', badgeText: '', needProfile: false }); return }
    const name = u.name || u.nickName || '微信用户'
    const id = u.id || u.uid || ''
    this.setData({
      user: u,
      isLocal: false,
      cloudLogin: false,
      needProfile: false,
      userName: name,
      avatarUrl: u.avatarUrl || u.avatar || '',
      userIdShort: id ? (id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id) : '已登录',
      subText: '云端账号 · ' + (id ? id.slice(0, 6) + '…' + id.slice(-4) : '已登录'),
      badgeText: '已登录',
      loginError: '',
    })
  },

  // 云托管登录：openid 来自微信注入的请求头，是本机之外的第一个真实身份。
  // 头像昵称按微信规则拿不到"静默版"（2022 年起 getUserProfile 已收回），
  // 只能用 chooseAvatar + nickname 输入框让用户点一下，补全后绑到 openid 存云端。
  // 这里先用本机资料秒显，再异步拉云端 profile 覆盖——换设备/清缓存还能恢复。
  applyCloudHost(h) {
    const oid = (h && h.openid) || ''
    const p = wx.getStorageSync(PROFILE_KEY) || {}
    const short = oid ? (oid.slice(0, 6) + '…' + oid.slice(-4)) : '云端已登录'
    this.setData({
      user: { cloudHost: true, openid: oid, name: p.name || '' },
      isLocal: false,
      cloudLogin: true,
      needProfile: !p.name,
      userName: p.name || '微信用户',
      avatarUrl: p.avatarUrl || '',
      userIdShort: short,
      subText: '微信登录 · ' + short,
      badgeText: '微信登录',
      loginError: '',
    })
    this.restoreProfileFromCloud(oid, p)
    // 登录完成：把这个 openid 选过的头衔导入，刷新牌匾（换设备/换账号都认自己那份）
    H.adoptPick(oid)
    this.loadHonor()
  },

  // 从云端按 openid 取回头像昵称，覆盖本机显示并回写本机缓存
  async restoreProfileFromCloud(oid, local) {
    if (!oid) return
    try {
      const body = await wxhost.call('/api/profile', {}, 'GET')
      const me = (body && body.profiles && body.profiles[oid]) || null
      if (!me || (!me.nickname && !me.avatar)) return
      const nick = me.nickname || (local && local.name) || ''
      const av = me.avatar || (local && local.avatarUrl) || ''
      const patch = { needProfile: !nick }
      if (nick) {
        patch.userName = nick
        patch.user = { cloudHost: true, openid: oid, name: nick }
      }
      if (av) patch.avatarUrl = av
      this.setData(patch)
      try { wx.setStorageSync(PROFILE_KEY, { name: nick, avatarUrl: av, ts: Date.now() }) } catch (e) {}
    } catch (e) {}
  },

  applyLocal(p) {
    this.setData({
      user: { local: true },
      isLocal: true,
      cloudLogin: false,
      needProfile: false,
      userName: p.name,
      avatarUrl: p.avatarUrl || '',
      userIdShort: '仅存本机',
      subText: '微信授权 · 头像昵称存在本机',
      badgeText: '已登录',
      loginError: '',
    })
  },

  // 微信一键登录：云托管拿真 openid（已验证可用），失败再退到本机资料
  async onWechatLogin() {
    if (this.data.loggingIn) return
    this.setData({ loggingIn: true, loginError: '' })
    let hostErr = ''
    try {
      const h = await wxhost.loginByCloudHost()
      this.applyCloudHost(h)
      this.setData({ loggingIn: false })
      if (this.data.needProfile) {
        // openid 到手了，但没有头像昵称；直接弹资料补全，别让用户停在"微信已登录"
        wx.showToast({ title: '已登录，再选个头像昵称', icon: 'none', duration: 2200 })
        this.openAuth()
      } else {
        wx.showToast({ title: '微信登录成功', icon: 'none' })
      }
      return
    } catch (e) {
      // 云函数/云托管没通，记下原因继续走下面的老路，不在这里打断用户
      hostErr = (e && e.message) || ''
    }
    wx.login({
      success: async (res) => {
        if (!res.code) {
          this.setData({ loggingIn: false, loginError: '微信登录失败，请重试' })
          return
        }
        try {
          const appid = wx.getAccountInfoSync().miniProgram.appId
          const { data: session, error } = await cloud.auth.signInWithWechat(res.code, appid)
          if (error) {
            this.setData({ loggingIn: false, loginError: hostErr ? missHint(hostErr) : friendlyAuthError(error.message) })
            return
          }
          getApp().resetSession()
          this.applyUser(session.user)
          this.setData({ loggingIn: false })
        } catch (e) {
          this.setData({ loggingIn: false, loginError: hostErr ? missHint(hostErr) : friendlyAuthError(e && e.message) })
        }
      },
      fail: (err) => {
        this.setData({ loggingIn: false, loginError: err.errMsg || '微信登录失败' })
      },
    })
  },

  // ---------- 微信资料补全（chooseAvatar + nickname） ----------
  openAuth() {
    const cur = this.data.userName
    this.setData({
      showAuth: true,
      draftAvatar: this.data.avatarUrl || '',
      draftNick: (cur && cur !== '微信已登录' && cur !== '微信用户') ? cur : '',
    })
  },
  closeAuth() { this.setData({ showAuth: false }) },
  noop() {},
  onChooseAvatar(e) {
    this.setData({ draftAvatar: (e.detail && e.detail.avatarUrl) || '' })
  },
  onNickInput(e) {
    this.setData({ draftNick: e.detail.value || '' })
  },
  // 头像文件 → base64 data URL，供上云绑定。压缩到 200px 控制体积（后端限 900000 字符）。
  // 失败返回空串：头像上云失败不该卡住昵称和登录，本机仍有落盘头像显示。
  avatarDataUrl(filePath) {
    return new Promise((resolve) => {
      if (!filePath) { resolve(''); return }
      const done = (p) => {
        try {
          const b64 = wx.getFileSystemManager().readFileSync(p, 'base64')
          if (!b64 || b64.length > 880000) { resolve(''); return }
          // 压缩后微信统一返回 jpg；原样读取时按扩展名兜底
          const ext = /\.png$/i.test(p) ? 'png' : 'jpeg'
          resolve('data:image/' + ext + ';base64,' + b64)
        } catch (e) { resolve('') }
      }
      if (typeof wx.compressImage === 'function') {
        wx.compressImage({ src: filePath, quality: 72, compressedWidth: 200,
          success: (r) => done(r.tempFilePath || filePath), fail: () => done(filePath) })
      } else done(filePath)
    })
  },

  async saveLocal() {
    if (this.data.saving) return
    const nick = (this.data.draftNick || '').trim() || '微信用户'
    let av = this.data.draftAvatar || ''
    // chooseAvatar 给的是临时路径，重启就失效，落盘到本机用户目录（本机显示用）
    if (av && av.indexOf(wx.env.USER_DATA_PATH) !== 0) {
      try {
        const dest = `${wx.env.USER_DATA_PATH}/${AVATAR_FILE}`
        wx.getFileSystemManager().saveFileSync(av, dest)
        av = dest
      } catch (e) {}
    }
    const p = { name: nick, avatarUrl: av, ts: Date.now() }
    try { wx.setStorageSync(PROFILE_KEY, p) } catch (e) {}
    this.setData({ showAuth: false, saving: true })

    // 拿到 openid 才是真绑定：头像昵称随 openid 上云，换设备/清缓存仍能恢复
    const h = wxhost.getSaved()
    if (h && h.openid) {
      let synced = false
      try {
        const avatar = await this.avatarDataUrl(av)
        await wxhost.call('/api/profile', { nickname: nick, avatar: avatar }, 'POST')
        synced = true
      } catch (e) {}
      this.setData({ saving: false })
      await this.applyCloudHost(h) // 保留云端身份，把刚填的头像昵称合并进去
      wx.showToast({ title: synced ? '已绑定微信账号' : '已存本机（云端未通）', icon: 'none' })
      return
    }
    this.setData({ saving: false })
    // 没有 openid：纯本机资料，不能冒充"已绑定"
    this.applyLocal(p)
    wx.showToast({ title: '已存本机（未绑账号）', icon: 'none' })
  },

  async onLogout() {
    try { await cloud.auth.signOut() } catch (e) {}
    getApp().resetSession()
    wxhost.clearSaved()
    try { wx.removeStorageSync(PROFILE_KEY) } catch (e) {}
    this.setData({ user: null, userName: '', avatarUrl: '', userIdShort: '', isLocal: false, cloudLogin: false, loginError: '' })
    wx.showToast({ title: '已退出登录', icon: 'none' })
  },
})
