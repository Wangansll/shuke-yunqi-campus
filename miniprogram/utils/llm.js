// utils/llm.js —— 统一 LLM 接口（走自家云托管 /api/llm 的 DeepSeek 代理）
//
// 为什么包一层：
//   1) secret key 绝不能进小程序前端（会被反编译提取），所以走云托管转发；
//   2) 保持与 WorkBuddy SDK 完全一致的调用形状 —— models.list() 与
//      chat.completions.create() 返回的 async generator（for await chunk.choices[0].delta.content），
//      这样 10 处业务调用点一行都不用改；
//   3) 优先真流式：wx.request enableChunked 收云托管 /api/llm/stream 的 SSE，
//      逐 token yield 给调用方（真·实时逐字）；域名未白名单/流式失败时自动回落
//      非流式 /api/llm + 本地分段吐字，保证任何环境都能用。
//
// 挂载方式：在 cloud.js 里把 cloud.llm 指向本模块的 llm 对象（见 cloud.js）。
const wxhost = require('./wxhost')

// 云托管不可用时，模型列表给一个本地兜底（不会让页面卡在"模型未就绪"）
const FALLBACK_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', disabled: false },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', disabled: false },
]

async function listModels() {
  try {
    const r = await wxhost.call('/api/llm/models', {}, 'GET', { timeout: 6000 })
    const models = r && r.models
    return Array.isArray(models) && models.length ? models : FALLBACK_MODELS
  } catch (e) {
    return FALLBACK_MODELS
  }
}

// 把完整文本切成小段，按"打字机"节奏 yield，形状与 OpenAI 流式 chunk 一致
function chunkText(text) {
  const out = []
  const s = String(text || '')
  // 中文/英文都按小步切；标点后稍作停顿交给调用方节奏，这里只负责切片
  const step = 6
  for (let i = 0; i < s.length; i += step) {
    out.push(s.slice(i, i + step))
  }
  return out.length ? out : ['']
}

async function* create(opts) {
  const o = opts || {}
  const model = o.model || 'deepseek-flash'
  // 透传 messages（已由调用方构造好）；signal 是 SDK 取消用，下面接到 task.abort
  const body = { model, messages: o.messages || [] }

  // 优先真流式：wx.request enableChunked 直连云托管 /api/llm/stream，逐 token yield。
  // 收集到的 token 放进队列，onDelta 唤醒等待中的 generator，实现边收边吐。
  let streamed = false
  let streamTask = null
  try {
    const queue = []
    let done = false
    let wake = null
    let streamErr = null
    const p = wxhost.callStream('/api/llm/stream', body, (txt) => {
      queue.push(txt)
      if (wake) { const w = wake; wake = null; w() }
    }, { timeout: 120000 }).then(() => { done = true; if (wake) { const w = wake; wake = null; w() } })
      .catch((e) => { streamErr = e; done = true; if (wake) { const w = wake; wake = null; w() } })
    streamTask = p.task
    // signal 取消：abort 掉底层 request
    if (o.signal) {
      const onAbort = () => { try { streamTask && streamTask.abort && streamTask.abort() } catch (e) {} }
      if (o.signal.addEventListener) o.signal.addEventListener('abort', onAbort, { once: true })
    }
    while (true) {
      while (queue.length) {
        streamed = true
        yield {
          choices: [{ index: 0, delta: { content: queue.shift() }, finish_reason: null }],
          model,
        }
      }
      if (done) break
      await new Promise((resolve) => { wake = resolve })
    }
    if (streamErr) throw streamErr
    if (streamed) {
      yield {
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
        model,
      }
      return
    }
  } catch (e) {
    // 一个 token 都没收到就失败 → 回落非流式，避免用户看到空白
    if (streamed) throw e
  }

  // 回落：后端一次性拿全文，本地按小段 yield（云托管 Streaming 未配 / 域名未白名单时用）
  let content
  try {
    const r = await wxhost.call('/api/llm', body, 'POST', { timeout: 120000 })
    content = r && r.content
    if (typeof content !== 'string') throw new Error('AI 返回为空')
  } catch (e) {
    throw e
  }
  const parts = chunkText(content)
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 16))
    yield {
      choices: [{ index: 0, delta: { content: parts[i] }, finish_reason: i === parts.length - 1 ? 'stop' : null }],
      model,
    }
  }
}

const llm = {
  models: { list: listModels },
  chat: { completions: { create } },
}

module.exports = { llm, listModels, FALLBACK_MODELS }
