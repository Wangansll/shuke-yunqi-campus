// DeepSeek 统一配置（随云托管代码包部署，前端拿不到）
// 生产建议改用环境变量 DS_KEY / DS_BASE / DS_MODEL 覆盖，优先级见 server.js 的 DS 读取逻辑
// ⚠️ 开源版说明：真实 key 已移除，仅保留结构。请注入环境变量 DS_KEY 后再运行
module.exports = {
  key: process.env.DS_KEY || '',
  base: process.env.DS_BASE || 'https://api.deepseek.com',
  model: process.env.DS_MODEL || 'deepseek-flash',
}
