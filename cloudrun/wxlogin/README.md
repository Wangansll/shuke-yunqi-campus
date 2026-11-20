# 云托管服务：登录 + 站内数据接口

> **线上状态**：服务 `express-tmya`，2026-11-20 16:49 重新部署（`express-tmya-021`，含 LLM 代理 + 真流式 `/api/llm/stream`）
> - 公网地址：`https://express-tmya-349409-13-1534701865.sh.run.tcloudbase.com`（仅调接口，不是页面）
> - LLM 代理：`GET /api/llm/models`、`POST /api/llm`（非流式兜底）、`POST /api/llm/stream`（SSE 逐 token）均已上线验证（HTTP 200）
> - **真流式需在小程序后台把上面的公网域名加入 `request` 合法域名**；未加时前端自动回落到非流式 `/api/llm`，功能不受影响，只是不做逐字动画
> - 历史：11-18 版本没有 `/api/llm` 路由（404），导致"AI 连不上"；11-20 补部署后修复
> - `GET /api/health` → `{"ok":true,"db":"up","ping":1}`，阿里云 RDS MySQL（`yunqi` 库）已通
> - `POST /api/wxlogin` → 返回真实 openid（已验证：`oUncpxiZOJwQej8Ns8wQ2yTfBOwE`）
> - 互助墙 / 点餐 / 工单已落库（`board_posts`、`canteen_orders`、`repair_tickets`），多设备数据共享
> - 历史问题已修：`express-tmya-003`（11-17 22:06）早于 `dbconfig.js`（22:37），镜像里没有数据库配置，
>   所以当时恒为 `not-configured`；本次重新构建已包含
> - 待办：数据库密码目前明文在 `dbconfig.js`，上线前应改为云托管环境变量 `MYSQL_*`

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/wxlogin` | 返回 `X-WX-OPENID`，即用户身份 |
| GET | `/api/health` | 数据库连通性（`ok:true` 表示 MySQL 已通） |
| POST | `/api/ticket` | 建报修工单，返回 `no`（工单号） |
| GET | `/api/tickets` | 只返回当前 openid 的工单 |
| POST | `/api/post` | 发互助帖 |
| GET | `/api/posts` | 全部互助帖（互助墙要能看别人发的） |
| GET | `/api/express` | 快递轨迹（服务端带 Referer 走公开查询通道） |
| POST | `/api/order` | 食堂点餐下单，返回取餐号 |
| GET | `/api/orders` | 我的点餐记录 |
| GET | `/api/merchant/orders?key=` | 商户端：待处理订单（`status in new/ready`） |
| POST | `/api/merchant/status` | 商户端：`ready` 出餐通知 / `done` 完成 |

`openid` 一律从 `X-WX-OPENID` 请求头取，**不接受前端传参**——云托管注入，伪造不了。

## 接数据库（阿里云 RDS MySQL）

1. 在新目录复制 `db.config.example.json` → `db.config.json`，填 host / user / password / database
2. `wxcloud deploy -e prod-d2gc3nmna23946d86 -s express-tmya -p 80`
3. 容器启动会自动 `CREATE TABLE IF NOT EXISTS`（`repair_tickets`、`board_posts`）
4. 验证：`GET /api/health` 应返回 `{"ok":true,"db":"up"}`

配置也可以用环境变量（`MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`），
那样就不必把密码写进代码包。

## 注意

- 阿里云 RDS 需要「开通外网地址」+ 白名单放行；云托管出口 IP 是动态的，
  演示期只能放 `0.0.0.0/0`，务必用**最小权限账号**（只授权 `yunqi` 库），演示结束后收回白名单、关闭外网地址。
- 小程序端不直连数据库：客户端拿数据库密码是硬伤，也不符合小程序合法域名要求。
