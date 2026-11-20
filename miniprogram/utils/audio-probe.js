// utils/audio-probe.js —— 探测当前云端模型是否吃得下 input_audio（音频直入 LLM）
//
// 为什么要探测：WorkBuddy 云服务的模型目录不标注音频能力，SDK 原话是
// "absence means unknown, not unsupported —— 以实际调用结果为准"。
// 所以不做猜测，直接发一段极短测试音，看模型是正常回话还是报"不支持音频"。
//
// 用法：面试页 setup 阶段（专业档）点「检测语音能力」，或控制台：
//   require('/utils/audio-probe').probe(getCurrentPages().slice(-1)[0].data.model)
//
// 注意：cloud / biz 都是延迟 require，方便自检脚本在无 wx 环境里 require 本文件。

// 生成一段 0.4 秒 440Hz 正弦 wav（16kHz / 单声道 / 16bit），返回 base64。
// 用真信号不用静音：模型若真收到音频，能明确听出"有个音调"。
function testToneB64(seconds) {
  const rate = 16000
  const n = Math.floor(rate * (seconds || 0.4))
  const dataLen = n * 2
  const ab = new ArrayBuffer(44 + dataLen)
  const dv = new DataView(ab)
  const put = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)) }
  put(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); put(8, 'WAVE')
  put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, 1, true)                    // 单声道
  dv.setUint32(24, rate, true)
  dv.setUint32(28, rate * 2, true)
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  put(36, 'data'); dv.setUint32(40, dataLen, true)
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / rate) * 6000, true)
  }
  if (typeof wx !== 'undefined' && wx.arrayBufferToBase64) return wx.arrayBufferToBase64(ab)
  // 小程序外（自检）兜底：Node 16+ 有全局 btoa
  const bytes = new Uint8Array(ab)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
  }
  return typeof btoa === 'function' ? btoa(bin) : ''
}

function labelOf(m) {
  try { return require('./biz').modelLabel(m) } catch (e) { return (m && (m.name || m.id)) || '' }
}

// 探测结果：
//   { ok:true, supported:true,  heard } —— 模型接了音频（没拒绝），heard 是它的话，自己判断是不是真听懂
//   { ok:false, supported:false, detail } —— 模型明确拒绝音频输入，这条路走不通
//   { ok:false, supported:null,  detail } —— 调用失败（网络/模型没连上），无法确认
async function probe(model) {
  const data = testToneB64(0.4)
  if (!data) return { ok: false, supported: null, detail: '测试音编码失败' }
  let api
  try {
    const { cloud } = require('./cloud')
    const id = (model && (model.id || model.name)) || 'auto'
    api = [{
      role: 'user',
      content: [
        { type: 'text', text: '下面是一段音频。请只回答两件事：一、它是纯静音还是有一个音调？二、用一句话描述你实际听到了什么。如果系统根本没把音频交给你，就直接说「我没收到音频」。' },
        { type: 'input_audio', input_audio: { data, format: 'wav' } },
      ],
    }]
    let full = ''
    for await (const chunk of cloud.llm.chat.completions.create({ model: id, messages: api, stream: true })) {
      const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
      if (d && d.content) full += d.content
    }
    return {
      ok: true,
      supported: true,
      heard: String(full || '').slice(0, 200),
      model: labelOf(model),
      detail: '模型接受了音频输入（未报不支持）',
    }
  } catch (e) {
    const msg = String((e && e.message) || e || '')
    const low = msg.toLowerCase()
    const status = Number((e && (e.status || e.statusCode)) || 0)
    // HTTP 400 = 服务端明确拒绝这次请求。本探测唯一的变量就是 input_audio
    // （其余是正常 text + model），所以 400 基本等同于「不吃音频 content type」。
    // 不能当成「无法确认」让用户反复重试——那样每次都弹同一个框。
    const badRequest = status === 400 || /http\s*400|\b400\s*bad request\b/.test(low)
    const rejected = badRequest || /input_audio|audio|unsupported|not\s*support|invalid|content.?type|unknown|unrecognized|无法识别|不支持|音频/i.test(low)
    return {
      ok: false,
      supported: rejected ? false : null,
      detail: msg.slice(0, 240),
      model: labelOf(model),
      reason: badRequest ? 'http400' : (rejected ? 'rejected' : 'unknown'),
    }
  }
}

module.exports = { probe, testToneB64 }
