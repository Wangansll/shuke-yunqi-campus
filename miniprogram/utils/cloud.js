// utils/cloud.js —— WorkBuddy 云服务统一客户端（整个小程序只有一个实例）
// 微信小程序没有 location.origin，endpoint / publishableKey 必须来自云端返回的 publicConfig
require('./polyfill')
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_KR0hdSQclW61kbmraAe4Rq_1w6oUbfSbKGZMnNIJ6A8KNuIDWwQApkM',
  workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_KR0hdSQclW61kbmraAe4Rq',
  wx: createDiagnosticWx(wx),
})

// 统一 LLM：全站 AI 能力改走自家云托管的 DeepSeek 代理（密钥只在服务端）。
// 保持 cloud.llm 的调用形状不变，业务代码零改动；覆盖失败时退回 SDK 原有实现。
try {
  const { llm } = require('./llm')
  cloud.llm = llm
} catch (e) {
  console.warn('[cloud] LLM 代理挂载失败，沿用 SDK 默认:', e && e.message)
}

module.exports = { cloud }
