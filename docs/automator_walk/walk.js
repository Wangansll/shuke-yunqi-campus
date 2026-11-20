const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PROJECT = 'C:/Users/001/WeChatProjects/miniprogram-2'
const CLI = 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
const SHOT_DIR = path.join(PROJECT, 'docs', 'shots_auto')
const RESULT = path.join(__dirname, 'walk_result.json')

const TAB_PAGES = [
  'pages/home/index',
  'pages/service/index',
  'pages/chat/index',
  'pages/asean/index',
  'pages/me/index'
]
const NORMAL_PAGES = [
  'pages/geely/index',
  'pages/life/index',
  'pages/guide/index',
  'pages/board/index',
  'pages/express/index',
  'pages/canteen/index',
  'pages/wiki/index',
  'pkgFood/pages/food/index'
]

function summarize(data) {
  if (data == null) return data
  if (typeof data !== 'object') return data
  const out = {}
  for (const k of Object.keys(data)) {
    const v = data[k]
    if (Array.isArray(v)) out[k] = `[Array len=${v.length}]`
    else if (v && typeof v === 'object') out[k] = `{keys: ${Object.keys(v).slice(0, 12).join(',')}}`
    else out[k] = v
  }
  return out
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const logs = []
  const exceptions = []
  let mp

  try {
    mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
    mp.on('console', item => logs.push(item))
    mp.on('exception', item => exceptions.push(item))

    const sys = await mp.systemInfo().catch(e => ({ error: String(e) }))
    const results = []

    async function visit(route, kind) {
      const entry = { route, kind, ok: false, reached: null, data: null, error: null, shot: null }
      try {
        if (kind === 'tab') await mp.switchTab('/' + route)
        else await mp.reLaunch('/' + route)
        await sleep(1600)
        const cur = await mp.currentPage()
        entry.reached = cur ? cur.path : null
        if (cur) {
          const d = await cur.data().catch(e => ({ dataError: String(e) }))
          entry.data = summarize(d)
        }
        entry.ok = true
        const shotName = route.replace(/\//g, '_') + '.png'
        await mp.screenshot({ path: path.join(SHOT_DIR, shotName) }).catch(() => {})
        entry.shot = shotName
      } catch (e) {
        entry.error = String(e && e.message ? e.message : e)
      }
      results.push(entry)
      console.log(`[${entry.ok ? 'OK' : 'FAIL'}] ${route} ${entry.error || ''}`)
    }

    for (const p of TAB_PAGES) await visit(p, 'tab')
    for (const p of NORMAL_PAGES) await visit(p, 'normal')

    const summary = {
      system: sys,
      total: results.length,
      ok: results.filter(r => r.ok).length,
      fail: results.filter(r => !r.ok).length,
      exceptionCount: exceptions.length,
      logCount: logs.length,
      results,
      exceptions: exceptions.slice(0, 50),
      logs: logs.slice(0, 80)
    }
    fs.writeFileSync(RESULT, JSON.stringify(summary, null, 2), 'utf8')
    console.log('\n=== SUMMARY ===')
    console.log(JSON.stringify({ total: summary.total, ok: summary.ok, fail: summary.fail, exceptionCount: summary.exceptionCount, logCount: summary.logCount }, null, 2))
  } catch (e) {
    console.error('LAUNCH FAILED:', String(e && e.stack || e))
    fs.writeFileSync(RESULT, JSON.stringify({ fatal: String(e && e.stack || e), logs, exceptions }, null, 2), 'utf8')
    process.exitCode = 1
  } finally {
    if (mp) { try { await mp.disconnect() } catch {} }
  }
}

main()
