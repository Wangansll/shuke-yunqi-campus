// custom-tab-bar —— 自绘底部导航，图标用内嵌 base64 CSS 绘制，不依赖图片文件
Component({
  data: {
    active: 0,
    // 全屏浮层打开时由页面调用 getTabBar().setData({hidden:true}) 临时隐藏
    hidden: false,
    list: [
      { key: 'home', page: 'pages/home/index', text: '首页' },
      { key: 'service', page: 'pages/service/index', text: '服务' },
      { key: 'chat', page: 'pages/chat/index', text: '小栖' },
      { key: 'asean', page: 'pages/asean/index', text: '东盟' },
      { key: 'me', page: 'pages/me/index', text: '我的' },
    ],
  },
  lifetimes: {
    attached() { this.syncActive() },
  },
  pageLifetimes: {
    show() { this.syncActive() },
  },
  methods: {
    // 根据当前页面路由自动高亮，免去每个页面单独 setData
    syncActive() {
      const pages = getCurrentPages()
      if (!pages.length) return
      const route = pages[pages.length - 1].route || ''
      const idx = this.data.list.findIndex(it => it.page === route)
      if (idx >= 0 && idx !== this.data.active) this.setData({ active: idx })
    },
    onTap(e) {
      const idx = Number(e.currentTarget.dataset.i)
      const item = this.data.list[idx]
      if (!item) return
      if (idx === this.data.active) return
      wx.switchTab({ url: '/' + item.page })
    },
  },
})
