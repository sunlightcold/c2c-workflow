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
- DELETE `/conversations/:conversationId`：read+reply权限，query为tenantId、merchantId、instanceId，路径ID为UUID。只移除该单位/商家在当前后台窗口中的会话、消息和附件引用，返回conversationId，沿用expired事件通知所有订阅者；不调用平台删除接口、不修改订单、不清空上游去重记录。实例变化返回409 CHAT_INSTANCE_CHANGED，越权或不存在返回404 CHAT_CONTEXT_UNAVAILABLE，发送中的会话返回409 CHAT_CONVERSATION_BUSY。聊天面板提供删除按钮及确认框；只读用户无入口。后续新消息可重新生成会话，也可通过订单手动重新添加，但删除的消息不恢复。无数据库迁移。
- 聊天页“新增会话”弹窗提供商家、订单号、对方姓名、状态筛选及分页，单选订单生成并打开会话。商家订单的“聊天”入口放入“更多”菜单，保持聊天权限、币安平台和活动订单限制；通过非持久化 Pinia 内存传递单位/商家/本地订单 ID，URL 不携带定位参数，目标页面一次性消费，进入页面即创建或复用并定位会话。商家账号的“实时聊天”入口使用同一内存导航，仅定位单位/商家范围，不创建订单会话。首次打开和已缓存页面再次跳转其他订单均须生效；发送、删除或创建进行中时延后消费，忙状态结束后处理，只有成功选中会话才清除待定位订单。刷新不恢复跳转参数，退出登录清空待处理定位。聊天右侧订单信息和窄屏抽屉仅展示摘要，不提供跳转商家订单按钮。
- 事件新增type=conversation，仅携带conversation，用于空会话创建及回复可用状态变化。已有message/merchant/expired事件兼容。

- GET：可选 tenantId、merchantId，平台账号必须选所属单位；返回 `{instanceId,sequence,retentionSeconds,merchants,conversations,messages}`，仅当前内存快照，无历史分页。merchant 状态包括四项能力与连接状态。
- POST `/reply`：multipart；tenantId、merchantId、conversationId、instanceId、requestId（UUID）、可选 text（最多4000字）和 image（单张 JPEG/PNG/WebP，最多10MiB、2500万像素）。至少文字或图片之一。身份来自当前登录用户，禁止客户端指定平台订单号、凭据或 URL。实例/会话/商家/订单失效返回409或404；越权不泄露资源存在性。
- 每次发送的文字与图片分别返回 message 状态。发送前错误 FAILED；本地写出后等待相同 uuid 的 self 回显，收到才为 SENT（不表示已读），超时/断线为 UNKNOWN。UNKNOWN 禁止自动重发；重复 requestId 在当前窗口内返回原结果，不同内容或会话复用返回409。无平台回显证据时始终保留未知。
- GET `/messages/:messageId/attachments/:attachmentId`：tenantId、merchantId、instanceId，重新鉴权与归属校验；返回受保护图片流。浏览器用现有 requestClient 获取 Blob，不暴露平台 URL。失效410。固定 HTTPS host/path 白名单、禁止重定向、限制大小和图片解码；上传/下载全程使用商家当前代理。

## 实时与生命周期

新增会话弹窗的内容区统一约束为不超过视口的固定高度，由表格内容区处理滚动；筛选、表头、分页和底部操作保持可见，不叠加弹窗内容区的纵向滚动。

会话工作台采用会话列表、聊天、订单信息三栏。桌面并排展示，窄屏订单信息通过抽屉打开；列表支持按买家、商家和平台订单号搜索，每项仅显示买家与时间、金额与状态、最新消息三行，商家名和平台订单号在右侧摘要查看。聊天消息限制阅读宽度，底部固定编辑区，支持跳至最新消息及按会话保留未发送草稿。参考Chatwoot共享收件箱的会话与上下文分区，复用本项目组件和主题。

conversation新增order摘要：fiatAmount/fiatCurrency、assetAmount/asset、unitPrice、status、paymentMethod、platformCreatedAt、paymentDeadline；金额和数量始终为字符串，时间为ISO字符串或null，仅投影这些字段，不返回收款账号、凭据等字段。摘要随新建/快照/会话事件提供，服务端配置扫描复用当前活动订单并按单位/商家批量补查保留的已结束订单；摘要变化发送conversation事件，不改变消息时间或延长TTL。

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

## 首期实施历史验证（2026-10-16，非本轮执行）

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

## 删除会话验证（2026-10-16）

- 后端完整单测123套件797项及聊天HTTP契约6项通过；新增覆盖实例/单位/商家隔离、发送中拒绝删除、消息与附件清理、expired通知和新消息重建。前端聊天纯状态单测4项通过。
- 前后端lint、类型检查和完整构建、后端workspace/catalog检查通过，规范与需求审查通过。按用户要求不运行UI测试；本次无数据库迁移，先发布后端删除接口，再发布前端按钮。

## 会话工作台与订单摘要验证（2026-10-16）

- 三栏工作台展示会话搜索、消息预览和订单上下文；订单摘要包括金额、币种、数量、单价、状态、支付方式、下单时间和支付截止时间，窄屏使用抽屉。支持按会话保留草稿、回到最新消息和更多菜单删除会话。
- 从聊天查看订单时，先清空已有状态、支付方式、金额和日期筛选，再应用单位、商家和订单号条件并返回第一页，避免旧筛选或分页遮挡目标订单。
- 后端完整单测123套件799项、聊天HTTP契约6项、前端完整单测58文件370项通过；包含订单摘要敏感字段投影、租户/商家隔离、已结束订单摘要刷新和TTL不延长验证。前后端lint、类型检查、完整构建及后端workspace/catalog检查通过，Secret扫描与git diff --check通过。
- 规范与需求双轴静态审查发现的订单跳转筛选与分页问题已修复。本轮按用户要求未执行UI、浏览器、Playwright或截图测试；前文首期实施中的UI验收为历史记录。未进行真实Binance账号联调。本轮无数据库迁移，先发布后端订单摘要，再发布前端。

## 聊天入口与内存导航验证（2026-10-16）

- 商家订单的聊天入口移入更多菜单，操作列收窄；商家账号与订单入口统一使用非持久化 Pinia 传递定位目标，路由无业务参数。发送、删除、创建结束后继续处理待定位目标，商家入口只筛选范围。聊天右侧及窄屏抽屉移除查看商家订单按钮，保留订单摘要。
- 前端lint、完整单测59文件375项、类型检查与完整构建通过；导航单测覆盖一次消费、重复跳转、商家范围替换订单目标、刷新不恢复与退出清理。Secret扫描和git diff --check通过，规范与需求双轴静态复审通过。
- 按用户要求未执行UI、浏览器、Playwright或截图测试，未进行真实Binance账号联调。本轮仅修改前端与契约，无后端接口或数据库迁移，部署前端即可。
