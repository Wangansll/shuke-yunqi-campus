// utils/wiki.js —— 校园百科检索（走云托管整站语料，服务端 BM25）
const wxhost = require('./wxhost')

// 服务端可能没部署或没语料，统一兜底成 { ok:false }
async function search(q, n) {
  const query = String(q || '').trim()
  if (!query) return { ok: true, items: [], total: 0 }
  try {
    const body = await wxhost.call('/api/kb/search?q=' + encodeURIComponent(query) + '&n=' + (n || 8), {}, 'GET', { timeout: 12000 })
    return { ok: true, items: body.items || [], total: body.total || 0, built: body.built || '' }
  } catch (e) {
    return { ok: false, items: [], total: 0, why: (e && e.message) || '检索接口不可用' }
  }
}

async function stats() {
  try {
    const body = await wxhost.call('/api/kb/stats', {}, 'GET', { timeout: 8000 })
    return { ok: true, total: body.total || 0, built: body.built || '' }
  } catch (e) {
    return { ok: false, total: 0, why: (e && e.message) || '不可用' }
  }
}

module.exports = { search, stats }
