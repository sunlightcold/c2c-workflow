# 后台实时聊天实施契约

2026-10-16。基线 `95f071b`。本次实施管理后台实时聊天，不接入 Telegram 转发，不保存聊天正文或附件。

## 范围与协议依据

- 菜单：商家管理 / 实时聊天，组件 `/business/merchant-chats`；权限 `merchant:chat:read`、`merchant:chat:reply`（发送同时要求 read）。复用默认菜单同步。
- Binance：机器人 `templates/P2PTradeBotPro/main.py` 的聊天凭据、完整 WSS 消息、未读通知触发 HTTP、初始化基线、心跳与换证；用户提供的聊天 API PDF 确认 POST `/sapi/v1/c2c/chat/image/pre-signed-url`、`data.preSignedUrl/imageUrl`、PUT 图片及 image 帧。参考 PDF 原件移至 Git 忽略目录 `.runtime/references/chat`，不提交签名 URL 样本。
- OKX 四项能力均 PENDING，显示待接入，禁止发送。已有订单通知及支付、Telegram 行为保持原契约。
- 仅访问服务器已同步的本商家买币活动订单。WSS/HTTP 都按原生字符串 ID 去重，HTTP 初始化过滤运行前消息；不按最大 ID 丢弃乱序消息，不定时轮询聊天正文。

## HTTP

前缀 `/v1/sys/merchant-chats/live`，统一响应包装。所有接口 `@SkipLog()`，错误 `data.reasonCode`，不返回远端错误正文。

- GET `/orders`：read权限，tenantId、可选merchantId/platformOrderId/counterpartyName/status、page（默认1）/pageSize（默认20，最多100）。仅返回本单位、启用币安商家的已同步活动BUY订单，按平台创建时间倒序；items仅含订单标识、商家名称、对方姓名、状态、金额字符串、币种、创建时间，返回total/page/pageSize。
- POST `/conversations`：read权限，tenantId、merchantId、merchantOrderId（本地UUID）；校验商家及活动BUY订单归属，创建或复用当前内存会话，返回instanceId/conversation。没有消息也允许打开，不伪造消息、不主动发送平台消息、不恢复运行前历史；连接未就绪时允许查看，回复仍受既有校验限制。越权/不存在/已结束订单拒绝，不创建会话；同商家同订单重复调用返回相同会话，空会话同样2小时过期，无数据库迁移。
- 聊天页“新增会话”弹窗提供商家、订单号、对方姓名、状态筛选及分页，单选订单生成并打开会话。订单操作的实时聊天入口携带单位/商家/订单，进入页面即创建或复用并定位会话；页面内再次跳转另一订单也必须生效。
- 事件新增type=conversation，仅携带conversation，用于空会话创建及回复可用状态变化。已有message/merchant/expired事件兼容。

- GET：可选 tenantId、merchantId，平台账号必须选所属单位；返回 `{instanceId,sequence,retentionSeconds,merchants,conversations,messages}`，仅当前内存快照，无历史分页。merchant 状态包括四项能力与连接状态。
- POST `/reply`：multipart；tenantId、merchantId、conversationId、instanceId、requestId（UUID）、可选 text（最多4000字）和 image（单张 JPEG/PNG/WebP，最多10MiB、2500万像素）。至少文字或图片之一。身份来自当前登录用户，禁止客户端指定平台订单号、凭据或 URL。实例/会话/商家/订单失效返回409或404；越权不泄露资源存在性。
- 每次发送的文字与图片分别返回 message 状态。发送前错误 FAILED；本地写出后等待相同 uuid 的 self 回显，收到才为 SENT（不表示已读），超时/断线为 UNKNOWN。UNKNOWN 禁止自动重发；重复 requestId 在当前窗口内返回原结果，不同内容或会话复用返回409。无平台回显证据时始终保留未知。
- GET `/messages/:messageId/attachments/:attachmentId`：tenantId、merchantId、instanceId，重新鉴权与归属校验；返回受保护图片流。浏览器用现有 requestClient 获取 Blob，不暴露平台 URL。失效410。固定 HTTPS host/path 白名单、禁止重定向、限制大小和图片解码；上传/下载全程使用商家当前代理。

## 实时与生命周期

- 复用现有 Socket.IO 登录会话；客户端 `merchant-chat.subscribe` 携带 tenantId、可选 merchantId，返回当前快照；`merchant-chat.unsubscribe` 取消；服务端 `merchant-chat.event` 推送 `{instanceId,sequence,type,merchantId,...}`，`merchant-chat.invalidated` 撤销订阅并清空页面。只向通过当前权限和资源范围校验的连接推送。
- 先订阅再应用快照，按实例和序号去重。断线、实例变化或事件过载重新取当前快照，不回放历史。权限重新校验失败清除订阅；空闲订阅也定期重新鉴权。
- 每商家独立 WSS；30秒 Ping、10秒 Pong 超时，6小时重新换证；断线可取消退避。商家/凭据/代理变更关闭旧连接，发送前再次检查当前配置。配置扫描只查询数据库配置及活动订单，不轮询平台聊天消息。
- 单一活动 admin 实例持有聊天内存；HTTP、Socket.IO、附件和平台 WSS 必须路由到该实例。instanceId 防止跨实例误发。多实例所有权/路由不在本期实现。
- 消息最多每会话200条、全局10000条，TTL 2小时；会话、去重、请求状态、连接及图片调用均有容量边界。图片 Buffer 仅在当前上传/下载调用中存活，不进入数据库、Redis、队列或对象存储，不写临时磁盘。

## 验收与发布

验证两种入站、包裹数组、超大ID、乱序去重、初始化过滤、图片协议、代理出口和白名单、配置失效、权限撤销、重复请求/部分成功/未知结果、TTL与容量、桌面/移动与只读/待接入状态。真实平台联调与模拟验证分开记录。

无聊天业务表迁移；先发布后端并同步默认菜单、分配 read/reply 权限，再部署前端。迁移和代理沿用现有契约。

## 本地固定文字 Mock

复用后端上游 Mock（13002）的签名聊天凭据、分页消息与 WebSocket。每笔 Mock 活动买单提供两条固定买家消息；发送文字后先收到 self 回显，再收到固定回复“收到，请稍等，我正在核实订单。”。按商家隔离，不模拟图片，不写入数据库或日志。
仅 `NODE_ENV=development` 且商家网关为 `http://127.0.0.1:13002` 时允许本地 `ws://127.0.0.1:13002/chat`；其他环境保持币安 WSS 白名单。后台 API、权限与发送确认逻辑复用正式链路，前端无需修改。
验收使用协议测试、类型检查与构建；按用户要求不进行 UI 测试。

本次验证：Mock 单测58项、后端单测123组789项通过；两项目类型检查、Mock构建、后端lint/完整构建/workspace检查通过。运行中的13002服务已通过签名HTTP固定消息读取、WebSocket self回显及固定回复验证，未进行UI测试。

## 本地验证记录（2026-10-16）

- 后端 lint、typecheck、完整构建及 workspace/catalog 检查通过；完整单测123套件、785项，聊天HTTP契约4项通过。相关 PostgreSQL 隔离 schema 集成测试2套件、9项通过，无新增聊天业务表迁移。
- 前端 lint、typecheck、单测58文件368项及构建通过。聊天页面用真实浏览器与模拟 HTTP/Socket.IO 验收：大ID、纯文本渲染、7张图片最多2路下载、新消息不重复下载旧图片、UNKNOWN只发送一次、只读禁发、OKX待接入、权限撤销清空；桌面及375×812移动视口，移动页面宽度与scrollWidth均375。
- 前端完整E2E首次44/48通过；修正现有Telegram能力夹具及VXE固定列定位的旧断言后，失败的桌面/移动4项定向复跑全部通过。Playground登录E2E另2项通过。未修改支付或Telegram业务实现。
- 配置失效保留消息窗口、暂停回复；只取消匹配租户/商家的在途初始化。已测试运行超过2小时后HTTP历史不会让过期消息复活，HTTP缺时间历史仅作去重基线。
- 本地默认菜单已同步实时聊天、read与reply权限；验证码接口返回200。数据库无待执行迁移。
- 以上外部平台行为由协议资料及模拟测试验证，未进行真实 Binance 账号收发、WSS代理出口或生产附件域名联调；OKX聊天不在本期。生产保持单一活动admin实例，先发布后端和授权，再发布前端。

## 主动添加订单会话验证（2026-10-16）

- 后端完整单测123套件794项、聊天HTTP契约5项、商家订单PostgreSQL隔离schema集成9项通过，覆盖空会话复用、容量与过期、订单筛选分页及租户/商家隔离。
- 前端聊天纯状态单测4项通过；前后端lint、typecheck和完整构建通过，后端workspace/catalog检查通过。新增订单弹窗使用统一BaseModal，规范与需求审查通过。
- 按用户要求未进行UI测试；真实Binance账号联调未执行。本次无数据库迁移，先发布后端新增接口，再发布前端。
