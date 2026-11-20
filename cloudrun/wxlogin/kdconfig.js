// 快递100 开放平台凭据（随镜像打包；也可以用环境变量覆盖）
// 注意顺序：customer 是 32 位那串，key 是另一串（我们实测时把两者搞反会报「授权信息错误」）
// 环境变量优先级更高：KUAIDI100_CUSTOMER / KUAIDI100_KEY
// ⚠️ 开源版说明：真实凭据已移除，仅保留结构
module.exports = {
  customer: process.env.KUAIDI100_CUSTOMER || '',
  key: process.env.KUAIDI100_KEY || '',
}
