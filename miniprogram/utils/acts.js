// utils/acts.js —— 把一句话变成"下一步能点的操作"
//
// 目的：小栖不能只会说。用户问"宿舍漏水了怎么办"，回答完应该在下面直接给一个
// 「填报修单」的按钮，点进去已经在他要办的那件事上，而不是让他自己去翻服务页。
// 规则做成纯前端关键词匹配：可解释、零成本、断网也能用，不额外调模型。

const RULES = [
  {
    re: /报修|维修|坏了|漏水|跳闸|没电|停电|插座|门锁|堵了|不制冷|空调坏|水压/,
    acts: [{ ic: '📋', n: '看办事指南', u: '/pages/guide/index' }],
  },
  {
    re: /丢|捡到|遗失|失物|招领|找回|落在/,
    acts: [{ ic: '🔍', n: '去互助墙找', u: '/pages/board/index?cat=lost' }],
  },
  {
    re: /二手|转卖|出个|想买|收个|闲置|跳蚤/,
    acts: [{ ic: '🔄', n: '逛互助墙', u: '/pages/board/index?cat=second' }],
  },
  {
    re: /求助|帮忙|借个|带饭|代取|跑腿|谁在/,
    acts: [{ ic: '🙋', n: '发条求助', u: '/pages/board/index?cat=help' }],
  },
  {
    re: /食堂|吃什么|好吃|档口|螺蛳粉|米粉|奶茶|咖啡|蜜雪|塔斯汀/,
    acts: [{ ic: '🍚', n: '看食堂档口', u: '/pages/life/index' }],
  },
  {
    re: /怎么走|在哪|位置|摆渡车|校车|几点有车|几点开|电话|医务室|报警|医务|超市/,
    acts: [{ ic: '🗺️', n: '打开校园导览', u: '/pages/life/index' }],
  },
  {
    re: /点餐|外卖|美团|订餐|买饭/,
    acts: [{ ic: '🛵', n: '去点餐', u: '/pages/service/index?focus=canteen' }],
  },
]

// 返回最多两个操作（去重、按规则顺序），没有命中就返回空数组
function actsFor(question) {
  const q = String(question || '')
  const out = []
  const seen = {}
  for (const r of RULES) {
    if (!r.re.test(q)) continue
    for (const a of r.acts) {
      if (seen[a.u]) continue
      seen[a.u] = 1
      out.push(a)
      if (out.length >= 2) return out
    }
  }
  return out
}

module.exports = { actsFor }
