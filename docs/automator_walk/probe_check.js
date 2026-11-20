const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
    const info = await mp.evaluate(() => {
      const a = typeof getApp === 'function' ? getApp() : null
      return {
        appNull: a == null,
        hasGlobalData: !!(a && a.globalData),
        env: a && a.globalData ? a.globalData.env : null,
        pageCount: typeof getCurrentPages === 'function' ? getCurrentPages().length : -1
      }
    })
    console.log(JSON.stringify(info))
  } catch (e) { console.error('ERR', String(e && e.stack || e)) }
  finally { if (mp) { try { await mp.disconnect() } catch {} } }
}
main()
