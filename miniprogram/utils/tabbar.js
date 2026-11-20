// utils/tabbar.js —— 自定义 tabBar 高亮同步
// 自定义 tabBar 每个 tab 页各有一份组件实例，官方推荐在页面 onShow 里主动设置 active，
// 比在组件里读 getCurrentPages() 可靠（组件 attached 时机可能早于页面入栈）。
function syncTabBar(page, index) {
  if (!page || typeof page.getTabBar !== 'function') return
  const tb = page.getTabBar()
  if (tb && typeof tb.setData === 'function') {
    if (tb.data && tb.data.active === index) return
    tb.setData({ active: index })
  }
}

module.exports = { syncTabBar }
