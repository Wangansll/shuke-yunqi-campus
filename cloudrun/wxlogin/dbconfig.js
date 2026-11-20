// 数据库连接配置（随代码包一起部署）
// 优先级：环境变量 > 本文件 > db.config.json
// ⚠️ 开源版说明：真实凭据已移除，仅保留结构。请在云托管环境变量中注入
//    MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
module.exports = {
  host: process.env.MYSQL_HOST || 'YOUR_MYSQL_HOST',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'YOUR_MYSQL_USER',
  password: process.env.MYSQL_PASSWORD || 'YOUR_MYSQL_PASSWORD',
  database: process.env.MYSQL_DATABASE || 'yunqi',
}
