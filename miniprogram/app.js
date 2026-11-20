// app.js
// 必须在任何云 SDK 之前补齐小程序缺失的 Web API（AbortController / Headers）
require('./utils/polyfill')
const { cloud } = require('./utils/cloud')

App({
  globalData: {
    env: '', // 使用 WorkBuddy 云服务，不依赖微信云开发环境
  },
  onLaunch() {
    // 云服务客户端已在 utils/cloud.js 初始化；微信云开发 SDK 非必需
    // 首次登入时间：荣誉「先驱者」按它判金/铜（12-20 前＝金），只记第一次
    require('./utils/contribute').firstAt()
    const dbg = wx.getStorageSync('__dbg_page') // 调试入口，平时为空
    if (dbg) wx.reLaunch({ url: dbg })
  },
  // WorkBuddy 账号登录回调（预留，供官方小程序授权返回；本版本主用微信登录）
  onShow(options) {
    if (cloud.auth && typeof cloud.auth.handleWorkBuddyMiniProgramCallback === 'function') {
      this.authReady = cloud.auth.handleWorkBuddyMiniProgramCallback(options)
    } else {
      this.authReady = Promise.resolve({ data: null, error: null })
    }
  },
  // 会话缓存：各页面共享一次 getSession，登录/退出后重置
  ensureSession() {
    if (!this.sessionPromise) {
      this.sessionPromise = cloud.auth.getSession()
    }
    return this.sessionPromise
  },
  resetSession() {
    this.sessionPromise = null
  },
})
