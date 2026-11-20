// utils/meituan.js —— 「去美团点单」的统一入口
//
// 系统本身不代下单、不编菜品价格：只负责把人送到美团，下单、配送费、起送价
// 一律以美团内显示为准。三处入口（首页、食堂页、美食鉴赏）共用这一份，
// 免得一处改了文案、另一处还在说旧话。
//
// 小程序不能直接打开外部 App，也不能内嵌第三方页面（要业务域名备案），
// 所以优先用 navigateToMiniProgram 跳美团外卖小程序；跳不过去（未在本账号
// 关联该小程序、用户取消、基础库不支持）就复制链接，让用户去浏览器打开。
const MEITUAN_APPID = 'wxde8ac0a21135c07d'
const MEITUAN_LINK = 'https://h5.waimai.meituan.com/'

// 兜底：复制链接 + 说清楚「为什么不能直接开」
function copyLink(opts) {
  const o = opts || {}
  wx.setClipboardData({
    data: o.link || MEITUAN_LINK,
    success: () => wx.showModal({
      title: o.title || '去美团点单',
      content: o.content || '美团外卖链接已复制。小程序里打不开美团 App，也嵌不了它的页面（要业务域名备案），请到浏览器粘贴打开；收货地址填「南宁数字科技学院」。本应用不代下单、不编菜品价格。',
      showCancel: false,
      confirmText: '知道了',
    }),
  })
}

// 返回 'app' 表示走了小程序跳转，'copy' 表示走了复制兜底，方便页面决定要不要提示
function openMeituan(opts) {
  const o = opts || {}
  if (MEITUAN_APPID && wx.navigateToMiniProgram) {
    wx.navigateToMiniProgram({
      appId: MEITUAN_APPID,
      envVersion: 'release',
      // 不传 path，落到美团小程序首页；指定提单页或店铺页需要美团授权的合法路径
      fail: (e) => {
        // 用户自己按了「取消」就别追着弹窗，只有真跳不过去才走复制兜底
        const msg = String((e && e.errMsg) || '')
        if (msg.indexOf('cancel') >= 0) return
        copyLink(o)
      },
    })
    return 'app'
  }
  copyLink(o)
  return 'copy'
}

module.exports = { MEITUAN_APPID, MEITUAN_LINK, openMeituan, copyLink }
