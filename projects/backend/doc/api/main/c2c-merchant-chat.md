# 后台实时聊天 API

完整范围、部署与验收见[实施契约](../../../../../docs/c2c-merchant-chat-contract.md)。聊天只保留在当前活动 admin 进程内存中，不提供历史查询，不接入 Telegram 转发。Binance 支持文字和图片；OKX 显示待接入。

## 权限与作用域

所有接口沿用登录鉴权。读取与订阅要求 `merchant:chat:read`；发送与删除会话同时要求 `merchant:chat:read`、`merchant:chat:reply`。平台账号必须传 `tenantId`，单位账号只允许本单位。商家与会话归属由服务器检查。

## 接口

| 方法与路径 | 输入 | 输出 |
| --- | --- | --- |
| GET `/v1/sys/merchant-chats/live` | 可选 tenantId、merchantId | 当前 instanceId、sequence、retentionSeconds、merchants、conversations、messages |
| GET `/v1/sys/merchant-chats/live/orders` | tenantId、可选merchantId/platformOrderId/counterpartyName/status、page/pageSize（默认1/20，最多100） | items、total、page、pageSize；启用币安商家的活动BUY订单，包含订单/商家标识、商家名称、对方姓名、状态、金额字符串、币种、下单时间 |
| POST `/v1/sys/merchant-chats/live/conversations` | tenantId、merchantId、merchantOrderId（本地UUID） | instanceId、conversation；按本单位/商家的活动BUY订单创建或复用内存会话，允许无消息，不发送平台消息、不读取运行前历史 |
| DELETE `/v1/sys/merchant-chats/live/conversations/:conversationId` | query：tenantId、merchantId、instanceId；路径ID为UUID | conversationId；删除当前后台窗口的会话、消息与附件引用，通知所有订阅者，不调用平台删除接口 |
| POST `/v1/sys/merchant-chats/live/reply` | multipart：tenantId、merchantId、instanceId、conversationId、requestId，text 和 image 至少一项 | instanceId、requestId、每条消息的 id/type/status/reasonCode |
| GET `/v1/sys/merchant-chats/live/messages/:messageId/attachments/:attachmentId` | tenantId、merchantId、instanceId | 鉴权图片流；private/no-store、nosniff，不返回平台原始 URL |

HTTP JSON 继续使用 `{code,msg,data,timestamp}` 包装；失败的 `data.reasonCode` 为稳定错误码。图片成功响应为二进制，不包装。

文字最多4000字。图片单张 JPEG、PNG、WebP 静态图片，最多10MiB、2500万像素，完整解码验证。图片上传使用内存存储；客户端禁止指定平台订单号、发送身份、平台凭据或附件 URL。

`requestId` 为 UUID v4。在当前实例的2小时窗口内，同一商家、同一请求内容重复提交返回原结果；不同内容或会话复用该 ID 返回 `CHAT_DUPLICATE_MESSAGE`。文字和图片分别返回状态，允许部分成功。`SENT` 表示收到平台相同 uuid 的 self 回显，不表示已读；本地写出不能确认送达，超时或断线返回 `UNKNOWN`，禁止自动重发。

## 实时事件

复用登录 Socket.IO 连接，auth.token 为访问令牌：

- `merchant-chat.subscribe`：输入 `{tenantId?,merchantId?}`，ACK `{ok:true,snapshot}` 或 `{ok:false,reasonCode?}`。
- `merchant-chat.unsubscribe`：取消订阅，ACK `{ok:true}`。
- `merchant-chat.event`：服务端推送 instanceId、sequence、tenantId、merchantId、type；type 为 message、conversation、merchant、expired，分别携带 conversation/message、conversation（无消息的会话或状态变化）、merchant、conversationId。
- `merchant-chat.invalidated`：服务端撤销订阅，携带 reasonCode。权限失效清空页面；`CHAT_RESYNC_REQUIRED` 重新订阅当前快照。

客户端先订阅，再应用快照及之后的事件；同实例按 sequence 去重。断线或实例变化只同步当前快照，无历史回放。服务器逐次检查订阅权限，空闲连接也每15秒重查。订阅更换或取消会使尚未完成的旧订阅失效。

筛选订单和打开会话仅要求read权限；发送仍要求read+reply。不存在、跨商家、跨单位或已结束订单返回CHAT_ORDER_NOT_FOUND；商家停用/配置失效返回CHAT_CONTEXT_UNAVAILABLE。相同订单重复打开复用同一会话，空会话按2小时TTL清理。聊天页新增会话弹窗支持四项筛选、分页和单选；商家订单操作列的“聊天”直接创建或定位对应会话。

删除会话要求read+reply，使用会话面板右上角按钮并确认。服务器校验当前instanceId及单位/商家归属，发送中的会话拒绝删除，错误CHAT_CONVERSATION_BUSY（409）。不存在或越权返回CHAT_CONTEXT_UNAVAILABLE（404）；删除成功沿用expired事件移除所有后台中的对应会话和消息。不会修改交易平台记录、订单或上游去重记录；新消息到达或手动选择订单可重新创建会话，已删除消息不恢复。

## 错误与运行限制

| 错误码 | 语义 |
| --- | --- |
| CHAT_UNSUPPORTED | 平台聊天待接入 |
| CHAT_CONTEXT_UNAVAILABLE / CHAT_ORDER_NOT_FOUND | 单位、商家、配置、会话或活动买币订单不可用 |
| CHAT_INSTANCE_CHANGED | 请求不属于当前运行实例，刷新后核实 |
| CHAT_SOCKET_UNAVAILABLE / CHAT_SEND_BUSY | 平台连接不可用或发送繁忙 |
| CHAT_DUPLICATE_MESSAGE | 请求标识已用于其他内容 |
| CHAT_CONVERSATION_BUSY | 会话正在发送消息，稍后删除 |
| CHAT_SEND_FAILED / CHAT_SEND_UNKNOWN | 发送失败 / 结果未知 |
| CHAT_ATTACHMENT_UNSUPPORTED / CHAT_ATTACHMENT_TOO_LARGE | 图片地址、格式、解码或大小不受支持 |
| CHAT_ATTACHMENT_REDIRECT_FORBIDDEN | 图片请求被重定向，已拒绝跟随 |
| CHAT_ATTACHMENT_UPLOAD_FAILED / CHAT_ATTACHMENT_DOWNLOAD_FAILED | 图片上传 / 下载失败 |
| CHAT_ATTACHMENT_EXPIRED / CHAT_ATTACHMENT_BUSY | 图片已失效 / 图片处理繁忙 |
| CHAT_CONNECTION_LIMIT / CHAT_ORDER_LIMIT / CHAT_BACKLOG_LIMIT | 连接、活动订单或初始化积压超出容量 |

每会话200条、全局10000条、TTL2小时、最多1000会话、64商家连接及64次连接初始化；每商家最多100个活动订单、20000个去重标识；发送幂等记录最多1024条；商家状态缓存最多10000条。图片调用最多4路并发；浏览器图片下载按2路排队。每个订阅最多32个待发送事件，慢连接撤销并要求重新同步。

发送、HTTP取消息、WSS和图片均使用商家当前代理配置，失败不回退直连。配置变更关闭旧连接并取消重连；重连重新校验配置，退避5–60秒。30秒配置扫描只读取数据库配置与活动订单，不轮询聊天正文。

必须由单一活动 admin 实例持有聊天运行窗口，并把聊天 HTTP、Socket.IO 和图片请求路由到该实例。没有新增业务表迁移；后端启动同步默认菜单后分配权限，再发布前端。真实平台联调结果与模拟测试分开记录。
