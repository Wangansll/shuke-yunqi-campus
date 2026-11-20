// utils/asr.js —— 语音转写：录音文件 → base64 → 云托管 /api/asr → 文字
//
// 云托管那条腿负责调真正的 ASR 上游（见 cloudrun/wxlogin/server.js 的 ASR_CFG）。
// 小程序这端只做三件事：读文件、上传、把文字或明确失败交回调用方。
// 上游没配 / 网络不通时如实返回 { ok:false, hint }，由页面提示改用文字作答，
// 绝不假装识别成功。
const wxhost = require('./wxhost')

// 把录音临时文件读成 base64（不写本地、不留存，读完就上传）
function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(String((r && r.data) || '')),
      fail: (e) => reject(new Error((e && e.errMsg) || '读取录音失败')),
    })
  })
}

// 从文件路径猜格式，默认 mp3（RecorderManager 也是按 mp3 录的）
function formatOf(filePath) {
  const m = String(filePath || '').match(/\.([a-z0-9]+)(?:\?|$)/i)
  const ext = m ? m[1].toLowerCase() : 'mp3'
  return ['mp3', 'wav', 'm4a', 'aac', 'webm'].indexOf(ext) >= 0 ? ext : 'mp3'
}

// 转写一段录音。成功 { ok:true, text }；失败 { ok:false, error, hint }。
async function transcribe(filePath) {
  if (!filePath) return { ok: false, error: '没有录音文件' }
  let audio = ''
  try {
    audio = await readBase64(filePath)
  } catch (e) {
    return { ok: false, error: e.message || '读取录音失败', hint: '重试或改文字作答' }
  }
  if (!audio || audio.length < 1024) return { ok: false, error: '录音太短', hint: '多说几个字再停' }
  try {
    // 上传走云托管；转写可能要几秒，给足超时
    const r = await wxhost.call('/api/asr', { audio, format: formatOf(filePath) }, 'POST', { timeout: 30000 })
    if (r && r.ok && r.text) return { ok: true, text: String(r.text) }
    return { ok: false, error: (r && r.error) || '没听出内容', hint: (r && r.hint) || '重试或改文字作答' }
  } catch (e) {
    // 云托管没配 / 没开通 / 网络问题：如实降级
    const hint = wxhost.explain(e)
    return { ok: false, error: hint, hint: '改文字作答' }
  }
}

module.exports = { transcribe, readBase64, formatOf }
