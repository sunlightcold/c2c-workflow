# C2C 商家代理出口与后台实时聊天实施需求

> 文档版本：V2.3
> 文档状态：代理已交付，Binance 后台聊天已实现并进行本地验证；真实平台联调待验收，详见后台聊天实施契约。
> 更新日期：2026-10-16
> 适用项目：`backend`、`admin-web`
> 本版本替代 V1.7 的商户群聊天转发、群内回复及相关权限、映射和迁移要求。
> V2.1 补充本地 Python 机器人源码中的协议证据，区分模板已实现、文档约定和仍需实测的能力。

## 1. 需求结论与版本范围

本期只建设两项能力：商家代理出口管理、管理后台实时聊天。操作员在后台查看和回复平台买家消息，Telegram 机器人不承接平台聊天。

### 1.1 本期建设

1. 后台维护 HTTP/SOCKS5 代理，支持新增、编辑、启停、测试、质量检测和批量操作。
2. 商家账号可手工绑定一个代理，也可选择“无代理”明确直连；同一代理可供多个商家账号使用。
3. 商家账号的全部外部平台请求按当前出口模式执行，覆盖订单、广告、付款确认、申诉、上传下载、聊天及重试补偿。
4. Binance 买家文本和图片进入后台实时聊天页，操作员可直接回复文字或图片。
5. 聊天只在进程内临时保留，不落数据库、Redis、BullMQ、对象存储或正文日志。
6. OKX 聊天保留统一能力接口，协议资料提供前保持 `PENDING`，不计入一期聊天交付。

### 1.2 本次取消的要求

- 平台买家消息转发到 Telegram 商户群。
- Telegram 群内原消息回复、文字/图片回传平台及发送结果通知。
- Telegram 消息与平台会话映射、聊天 Update 分流和群聊天模板。
- 为聊天新增 `C2C_CHAT_READ`、`C2C_CHAT_REPLY` 能力及角色默认能力回填。
- 为聊天改造 Bot 的 POLLING/WEBHOOK 模式、Webhook 标识和图片下载接口。
- 为聊天新增商家唯一生效群约束、群绑定迁移和 `merchant.botCode/chatId` 回填。
- 为聊天改造机器人实例、群组绑定、群组成员、超级管理员页面。

取消的是本方案的聊天职责。既有 Telegram 支付、查询、日报、通知、群绑定及其权限规则继续执行，既有字段和数据不做删除；若这些功能自身需要调整，应单独定义需求。

## 2. 当前代码基线与开发准入

下表记录代理实施前的基线。当前已实施代理资源、商家绑定及 HTTP/临时 WebSocket 出口；准确范围、字段和验收见 [IP 代理实施契约](c2c-proxy-contract.md)。后台统一聊天仍是后续设计，本文的长连接所有权、版本和聊天模型不属于本次代理交付。

截至本次静态核对，当前工作区与 V1.7 的“已完成”描述不一致，以下按实际代码拆分工作，不以旧文档作为完成证据：

| 范围 | 当前基线 | 本期工作 |
| --- | --- | --- |
| 代理资源及商家代理绑定 | 尚未找到完整代理模块、实体、迁移或管理页 | 新增资源、绑定、审计和页面 |
| HTTP Transport | 已有统一 Axios 包装，尚无商家 `ProxyContext` | 接入明确直连、HTTP CONNECT、SOCKS5 远端 DNS |
| Binance 聊天 | 已有获取聊天凭据和临时 WebSocket 文本发送；仍直接使用 `globalThis.WebSocket` | 参考 Python 模板的长连接、完整消息/未读通知双路径，补齐商家隔离和图片能力 |
| 后台实时通信 | 已有通用 Socket.IO 和登录认证基础 | 新增聊天订阅、业务范围鉴权、快照及聊天页 |
| OKX 聊天 | 当前 Adapter 不支持聊天 | 对外标记 `PENDING`，等待资料 |
| Telegram | 已有独立的支付、查询和通知体系 | 本需求不新增聊天职责或改造任务 |

代理资源、商家绑定和 Transport 可先行实施。Binance 聊天需要协议样本、能力契约测试和真实账号出口验证通过后才能声明交付；OKX 资料不阻塞代理功能及 Binance 聊天交付。

## 3. 业务边界

### 3.1 代理出口

- 管理员显式选择代理，系统不自动推荐、均衡或轮换；仅按管理员配置的 sub2api 到期策略切换备用代理或直连。
- 一个商家账号最多绑定一个当前代理，同一代理可以绑定多个商家账号。
- 未绑定代理时明确使用服务器默认出口；这不是代理失败后的回退。
- 已绑定代理停用、过期、缺失或连接失败时请求失败，不得改走其他代理或直连。
- 被商家使用的代理不可删除；改绑后关闭旧 WebSocket，新请求和新连接使用当前配置。
- 代理和绑定按所属单位隔离，业务查询显式约束 `tenantId`，涉及商家再约束 `merchantId`。
- Telegram、数据库、后台基础设施请求不适用商家代理；现有不归属商家的 OTC 行情外联不纳入本期商家出口。

### 3.2 后台实时聊天

- 后台是本系统唯一的人工聊天入口，消息不发送到任何 Telegram 群。
- 聊天可用性不依赖 Bot、群组、群成员、`botCode` 或 `chatId`；没有机器人配置的商家也可使用后台聊天。
- 会话以商家账号和平台订单隔离；前端不能通过任意订单号创建会话或绕过订单归属。
- 一期只处理现有买币订单，聊天不开放卖币收款确认、放币或其他资金动作。
- 仅支持文字和已声明支持的图片；不实现文件、视频、语音、自动回复、关键词、转人工或广播。
- 只显示当前运行窗口内的消息，不提供面向用户的历史分页、历史回放、定时消息轮询或持久化聊天记录；允许平台协议需要的订单聊天初始化、WSS 未读通知触发的 HTTP 消息获取，具体边界见第 3.4、7.1 节。
- 平台 `auto_reply` 消息可以作为平台自动消息展示，不触发本系统自动回复。
- 现有订单创建、已付款、完成的买家通知继续按原开关和文案执行，统一使用商家当前出口；收到买家消息不能触发这些通知。

### 3.3 平台能力准入

各平台分别声明 `receiveText`、`sendText`、`receiveImage`、`sendImage`，状态为 `SUPPORTED | PENDING | UNSUPPORTED`，不能用单一 `chat: true` 替代四项能力验证。

Binance 是一期目标平台，四项能力应分别提供脱敏协议样本和契约测试。WSS 帧、平台回执、图片上传及重连行为按实际协议实现，不能把“文档有接口”视为“当前代码已支持”。

OKX 四项聊天能力保持 `PENDING`，页面显示“待接入”并禁用发送；不得使用页面抓取、模拟登录、验证码绕过、自动刷新 Cookie 或任意 URL 请求代替协议接入。OKX 现有非聊天能力继续隔离在 `OKX_WEB_PRIVATE` Adapter。

Binance 参考资料为 `docs/币安接口文档.pdf` 与 `docs/API接口订单聊天 API.pdf`；实施前核对内容、版本和帧样本。代理管理参考 `Wei-Shaw/sub2api` 的字段和交互，实施前锁定提交号；本项目沿用 NestJS、TypeORM 和 Vue/Vben 架构，不复制参考项目代码结构。

### 3.4 Python 源码对接依据

聊天细节不明确时，先读 `templates/P2PTradeBotPro/main.py` 的实际调用与处理，再对照 PDF；OKX 对照 `templates/OKXP2PTradeBot/OKXP2PTradeBot`。模板只读，不运行机器人、不读取或复用其中账号配置。源码只能证明参考实现采用了哪些字段和调用，不能代替真实平台验收。

| 能力/行为 | Python 源码位置 | 确认事实与本项目处理 |
| --- | --- | --- |
| 聊天 HTTP 消息接口 | `main.py:448 retrieve_chat_messages` | GET `retrieveChatMessagesWithPagination`，按订单取 `page=1, rows=20`；签名、请求头见第 3.5 节 |
| 订单聊天初始化 | `main.py:494 initialize_order_chat`、`:1482` 附近订单发现逻辑 | 发现订单后调用一次消息接口并记录已初始化订单；“请求会打开平台聊天上下文”仅为源码注释，需实测确认 |
| 启动消息基线 | `main.py:1555 init_chat_history` | 启动时查询已存在订单的消息 ID 建立基线，避免旧消息重复展示；本项目不展示初始化获取的旧正文 |
| WSS 授权 | `main.py:601 retrieve_chat_credential`、`:679 get_fresh_chat_wss_url` | 使用 `chatWssUrl/listenKey/listenToken` 构建 WSS URL，不是客户端自行拼接任意地址 |
| 文本发送 | `main.py:763 send_message` | 使用同一长连接发送带 uuid 的 text 帧；函数在本地 send 返回后就返回 True，没有等待平台回执 |
| 完整消息接收 | `main.py:920 on_message` | 解析顶层、`data`、`data.message` 等包裹，读取订单、文字、图片、self、消息 ID 和昵称 |
| 未读通知接收 | `main.py:937`、`:564 fetch_and_forward_new_binance_messages` | `type=statistics, subType=unreadIntegratedChatCount, totalCount>0` 时遍历活动订单，通过 HTTP 获取消息；不能仅依赖 WSS 总带完整正文 |
| 心跳、换证和重连 | `main.py:594`、`:1146 connect_to_websocket`、`:1274 stop_binance_chat_websocket` | 模板用 30 秒 Ping、10 秒超时、6 小时主动换证重连、断线等待 5 秒；每轮重新获取凭据，退出时关闭连接并取消定时器 |
| 图片接收 | `main.py:1057` 附近 image 分支 | 完整消息分支读取 `imageUrl`；模板直接交给 Telegram 下载，本项目改为当前商家代理下载并在后台鉴权展示 |
| 图片发送/平台回执 | 聊天处理与发送路径 | 未找到图片预签名上传、image 发送帧或平台发送回执处理；不能由文本发送或图片转发反推已支持 |
| OKX 聊天 | OKX 模板的 `main.py/api.py/breq.py/utility.py` | 未找到交易平台聊天 WSS、聊天 HTTP 或聊天发送实现；其中 Telegram `send_message` 是机器人自身消息，不能当作 OKX 聊天协议 |

表中未写完整路径的 `main.py` 均指 `templates/P2PTradeBotPro/main.py`。源码里 Telegram 按钮、转发、群消息映射、卖币放币动作、全局单账号状态和正文日志不移植到本项目。

源码核对版本（2026-10-16，文件原始字节 SHA-256）：

```text
templates/P2PTradeBotPro/main.py
4974af98904826c95b999e5870386b25ef03b5007f62df98a44b7990f01d135b
templates/OKXP2PTradeBot/OKXP2PTradeBot/main.py
e909248c92ea1c8eb5c4b80b9e6632deb7c2837ed90edf30bd623c8627c4ff01
templates/OKXP2PTradeBot/OKXP2PTradeBot/api.py
c1cb786b974f0362a7b8072056216e612c0041b661d3e589f90bf80584f5d7ed
```

`templates/*` 不进入 Git，允许后续删除；本节保留字段、行为和限制作为实施依据。开发时把实际确认的脱敏报文与契约夹具放入后端受版本控制的测试目录，不复制凭据或整份机器人源码。

### 3.5 Binance 源码确认的协议细节

| 用途 | 方法/路径 | 字段和处理 |
| --- | --- | --- |
| 聊天凭据 | GET `/sapi/v1/c2c/chat/retrieveChatCredential` | 查询 `timestamp` 和 HMAC-SHA256 `signature`；头 `X-MBX-APIKEY`、`clientType=web`；模板 HTTP 超时 15 秒 |
| 消息获取/初始化 | GET `/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination` | 查询 `orderNo/page/rows/timestamp`，按 URL 编码后的参数串生成 HMAC-SHA256 后追加 `signature`；同上请求头；模板超时 10 秒 |
| 建立长连接 | `{chatWssUrl}/{listenKey}?token={listenToken}&clientType=web` | 三个值来自当前商家凭据接口，路径/查询分别正确编码；服务端校验 WSS 目标；Token 与完整连接地址不入日志 |
| 文本帧 | 通过当前商家 WSS 发送 JSON | `type=text`、`uuid=UUIDv4`、`orderNo` 字符串、`content` 字符串、`self=true`、`clientType=web`、`createTime` 毫秒、`sendStatus=0` |
| 未读通知 | WSS JSON 控制消息 | `type=statistics`、`subType=unreadIntegratedChatCount`、`totalCount`；这是触发取消息的控制信号，不是聊天正文 |
| 入站消息 | WSS 完整消息或 HTTP 返回的消息项 | `orderNo/content/imageUrl/type/self/id/messageId`；昵称候选为 `fromNickname/nickName/senderNickName/sender`，PDF 的 `fromNickName` 作为待样本核对的兼容字段 |

原生消息 ID 和订单号在本项目始终用字符串；不能照搬 Python 的 `int(id)` 到 JavaScript Number，也不能只按“ID 小于已见最大值”丢弃乱序消息。按原生 `id/messageId` 去重；仅在样本确认 uuid 是平台原生标识时以 uuid 补充，缺少可靠标识时返回明确协议错误，不制造假 ID。

入站包裹可能是顶层对象、`data` 对象、`data` 数组或其中的 `message` 对象。本项目应按契约解析数组中每一项，不能照搬模板只取 `[0]` 的处理；HTTP 与 WSS 共用归一化和去重逻辑，图片不能在 HTTP 分支变成空文字。

模板直接忽略 `self=true`；本项目应先尝试关联本地出站 uuid，再避免重复显示。`content` 为 JSON 时，模板会识别 `seller_payed/seller_completed/c2c_extend_pay_time_before_extend_old_user_seller/seller_merchant_trading` 等事件，本项目仅作为已识别的平台消息展示或忽略，不以聊天内容推进资金状态或增加放币入口。

模板的 6 小时换证是实现参数，不是平台官方凭据有效期；可作为初始可配置刷新周期，须按真实鉴权失败和平台资料校正。保留每次重连取新凭据、定时器清理、商家隔离及发送串行化；断线重连使用可取消退避，避免把单账号全局连接或无差别重发移植过来。

## 4. 领域术语

| 术语 | 定义 |
| --- | --- |
| 代理资源 | 一条 HTTP 或 SOCKS5 代理连接配置 |
| 商家账号 | 所属单位名下绑定 Binance 或 OKX 的一个 C2C 经营账号 |
| 代理绑定 | 商家账号与当前显式选择的代理资源之间的关系 |
| 平台连接 | 某商家账号使用其凭据和当前出口建立的运行连接 |
| 聊天会话 | 同一商家账号与某个平台订单之间的聊天上下文 |
| 实时消息 | 当前运行窗口内接收或发送的一条平台文字、图片消息 |

会话主键固定为 `tenantId + merchantId + platform + platformOrderId`。平台原生消息 ID 用于入站去重，后台生成的会话 ID 不能被客户端替换为任意订单号。

配置和健康记录的时间沿用 PostgreSQL `timestamptz`，API 时间为 ISO-8601 UTC；页面按现有业务时区规则展示。聊天时间仅保存在运行时对象中。

## 5. 代理管理功能需求

2026-10-16 实施校正：代理部分以 [IP 代理实施契约](c2c-proxy-contract.md) 和固定 sub2api 源提交为准。支持四协议；按用户最新要求，管理后台只删除数据导入、数据导出，保留标准和批量 URL 添加、质量检测、有效期、列表到期提醒及到期策略。页面使用项目统一的资源表格、表单和弹窗组件。

### 5.0 设计参考范围

代理管理页面、代理选择器、代理 API 和代理数据模型参考 sub2api（实施前锁定参考提交）的字段和交互逻辑。实现时沿用本项目的模块边界、路由规范、租户/商家权限和 Secret 存储方式，不复制其代码结构。

### 5.1 代理新增

管理后台提供“代理管理”页面，弹窗内固定提供“标准添加”和“批量添加”两个 Tab。字段名称、顺序、默认值和校验按 sub2api 的 `ProxiesView.vue` 实现。

标准添加字段：

| 字段 | 要求 |
| --- | --- |
| name | 必填，代理显示名称 |
| protocol | `http`、`https`、`socks5` 或 `socks5h` |
| host | 必填，域名、IPv4 或 IPv6 |
| port | 1-65535 |
| username | 可选 |
| password | 可选；创建时填写，编辑时留空表示保持原值 |
| expires_at | 可选；支持永不过期、7/30/90/180 天快捷值和日期选择 |
| expiry_warn_days | 默认 `7`，按 sub2api 字段保留 |

代理 API、前端类型保留 sub2api 的 snake_case 字段；TypeORM 实体和数据库列沿用本项目 camelCase。字段及分页格式以代理实施契约为准。

代理状态使用 sub2api 的值：持久化状态为 `active` 或 `inactive`；超过 `expires_at` 时列表和筛选显示派生状态 `expired`，编辑时只能选择 `active` 或 `inactive`。不增加 `note` 或其他自定义字段。

按最新要求，`fallback_mode`、`backup_proxy_id` 及 JSON 的 `backup_proxy_name` 沿用 sub2api；仅到期策略触发持久化切换，网络失败不得触发备用或直连。以 `c2c-proxy-contract.md` 和后端 API 文档为实施契约。

批量添加文本框每行一个代理，格式完全按 sub2api：

```text
socks5://user:pass@host:1080
http://host:8080
```

协议支持 `http`、`https`、`socks5`、`socks5h`；host 支持域名、IPv4 和带方括号的 IPv6。HTTP/HTTPS 代理访问 HTTPS 目标使用标准 CONNECT；SOCKS5 本地解析 DNS，SOCKS5H 远端解析 DNS，与 sub2api 一致。前端实时显示总行数、有效数、无效数和批内重复数。后端再次校验，按 `host + port + username + password` 判断已存在项，已存在项计入 `skipped`，新建项默认名称为 `default`。

批量创建为 `POST /v1/sys/proxies/batch`，请求体 `{ tenantId, proxies: [{ protocol, host, port, username, password }] }`，响应 data 为 `{ created, skipped }`。前端过滤无效行，服务端继续校验 DTO；保存逐项执行，已创建项在后续保存失败时保留，不宣称整批原子事务。

### 5.2 代理列表和操作

列表必须按 sub2api 的列和顺序显示：

- 选择框
- 名称
- 协议
- 地址（`host:port`，支持复制 `host:port` 或不含密码的 `protocol://host:port`；不提供含密码的完整代理 URL 复制）
- 认证信息（username 和掩码 password；密码不从接口回显）
- 位置（国旗、国家、城市）
- 使用账号数（可点击查看账号列表）
- 延迟（成功毫秒数或失败原因）及质量摘要
- 有效期（日期和“永不过期/即将到期/已过期”标签）
- 创建时间
- 状态
- 操作

顶部支持：名称/地址搜索、协议筛选、状态筛选、刷新、批量测试连接、批量质量检测、批量删除和新增代理。分页、服务端排序和空状态使用本项目统一资源表格；到期提醒在列表标记临近到期，不发送主动通知。

状态筛选为“全部、active、inactive、expired”，协议筛选为“全部、HTTP、SOCKS5”。

每行操作固定为：测试连接、质量检测、编辑、删除。账号数大于 0 时删除前端直接阻止，后端也必须拒绝删除；批量删除返回成功 ID 和跳过项及原因。

单条测试连接结果字段完全按 sub2api：

- `success`
- `message`
- `latency_ms`
- `ip_address`
- `city`
- `region`
- `country`
- `country_code`

这些是页面展示/导入导出的对照字段；本项目 API 响应统一使用 `latencyMs`、`ipAddress`、`countryCode`，admin-web 类型负责映射。不能为了兼容页面把 snake_case 直接写入 TypeORM 实体或 NestJS DTO。

质量检测按 sub2api 增加结果弹窗和明细表，参考字段为 `proxy_id`、`score`、`grade`、`summary`、出口 IP、国家、基础延迟、检查时间、通过/警告/失败/挑战数量以及逐目标 `target/status/http_status/latency_ms/message/cf_ray`；本项目外部 DTO 保留这些 snake_case 字段。质量检测固定访问 `https://api.openai.com/v1/models`（允许 401）、`https://api.anthropic.com/v1/messages`（允许 401/405/404/400）、`https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta`（允许 200）和 `https://api.x.ai/v1/models`（允许 401）；前端不能提交或替换目标 URL。结果按固定目标记录。

批量测试连接默认并发数为 5；批量质量检测默认并发数为 3。选中行时只处理选中代理，未选中时处理当前筛选条件下的全部代理。

管理后台不提供 JSON 数据导入和导出，删除对应按钮、文件弹窗及前端调用；标准添加和批量 URL 添加不受影响。已有服务端 JSON 兼容接口保留，相关格式和 Secret 限制见后端契约。

连接测试完全按 sub2api 的 `ProxyExitInfoProber` 语义执行：在代理下以 10 秒超时先 `GET http://ip-api.com/json/?lang=zh-CN`，要求 HTTP 200 且 JSON `status=success`，读取 `query` 作为出口 IP 和国家/地区；该目标失败后再 `GET http://api64.ipify.org?format=json`，要求 HTTP 200 且 JSON 存在 `ip`。两者都失败才判定测试失败。目标、顺序、解析器和超时由服务端固定配置版本控制，接口不接收 URL，也不允许管理员通过请求替换目标。

### 5.3 商家绑定代理

商家账号新增和编辑表单增加 sub2api 风格的代理选择器：

- 下拉第一项固定为“无代理”。
- 可搜索代理名称和 host。
- 每个选项显示代理名称、`protocol://host:port`、已绑定账号数，以及最近测试的国家和延迟。
- 每个选项有单独测试按钮，选择器顶部有批量测试按钮。
- 可手工选择或清除代理；不做系统推荐或自动改绑。
- 同一个代理可以被多个商家账号选择。
- 保存时写入当前 `proxyId`。
- 保存代理变更时记录操作人、旧代理、新代理和原因。

选择器只展示 `active` 且未过期的可用代理；后端收到已停用或已过期代理 ID 时返回 `PROXY_INACTIVE`/`PROXY_EXPIRED`，不能因为前端隐藏选项而省略校验。重复分配不触发任何冲突或自动改绑。

代理变更只影响新建请求和新建连接。已有 WebSocket 会话必须关闭并使用新代理重连；运行时永远使用该商家当前显式分配的代理。

新增代理、编辑代理、批量导入和商家改绑接口必须使用字段级脱敏日志或 `@SkipLog()` 加专用审计服务，不能让全局 `LogInterceptor` 把 password、代理 Secret、平台 Cookie 或凭据写入 `sys_log`。代理资源审计至少带 `tenantId + proxyId`，`merchantId` 在资源级事件中可为空；商家绑定审计必须带 `tenantId + merchantId`。所有审计查询都必须显式带租户范围，涉及商家时再带商家范围。

## 6. 全量外联要求

商家账号的以下所有请求必须使用当前出口模式：已绑定代理时走该代理，未绑定代理时走服务器默认出口直连：

- 订单列表同步
- 订单详情查询
- 商家广告查询、同步和调价
- 平台状态回查
- 标记已付款
- 申诉提交
- 申诉文件上传
- 聊天凭据获取
- 订单聊天协议初始化及 WSS 未读通知触发的消息获取
- 聊天发送
- 聊天 WebSocket 握手、保活和重连
- 账号连接测试
- 失败重试和补偿任务

实现要求：

1. 所有平台 Adapter 不得直接调用 Axios、fetch 或原生 WebSocket。
2. HTTP 和 WebSocket 必须经过统一的代理感知 Transport。
3. Transport 必须接收 `tenantId`、`merchantId`、`platform`、`proxyId` 和凭据版本。
4. `proxyId = null` 时明确使用直连 Transport；已绑定代理但配置缺失或解析失败时直接拒绝请求。
5. 已绑定代理连接失败时不能直连，也不能隐式切换其他代理；未绑定代理时不创建代理连接。
6. 代理 URL 解析只支持 HTTP、SOCKS5；HTTP 代理通过 CONNECT 访问 HTTPS 目标，SOCKS5 使用远端 DNS 解析，避免本机 DNS 泄漏。
7. 连接池缓存键必须包含代理配置；代理变更后旧连接不能继续复用。

`C2cPlatformCredentialFactory` 不把代理密码或完整代理 URL 放进凭据、队列参数或日志。每次任务只携带 `tenantId + merchantId + platform + merchantCredentialVersion`，由 Worker 在执行前按商家当前 `proxyId` 解析可选代理上下文。HTTP、预签名文件上传、图片下载和 WebSocket 必须分别通过同一个可选 `ProxyContext` 进入 Transport。本段是目标契约，当前代码尚需完成改造和出口验证。

Transport 的最小运行时契约固定为：

```text
RuntimeProxyContext = ProxyContext | null

ProxyContext:
  tenantId, merchantId, platform, proxyId
  protocol: HTTP | SOCKS5, host, port, username?, passwordRef?
  proxyRevision, proxyBindingVersion, credentialVersion
```

`ProxyContext` 只在 Worker/适配器进程内解析；`proxyId = null` 时上下文为 `null`，Transport 必须显式选择直连实现。`passwordRef` 必须在调用 Secret 服务时展开，不能出现在队列 payload、异常文本、HTTP 请求追踪或审计正文。适配器方法必须接收包含可选上下文的运行时参数；仅在构造凭据时传入代理或只在 HTTP 层偷偷读取全局变量都不满足要求。代理配置快照和连接池键必须包含 `proxyId + proxyRevision + proxyBindingVersion`（直连连接使用明确的 `DIRECT` 键），改绑或编辑代理递增对应版本并关闭旧连接；Worker 执行前发现版本不一致时必须丢弃旧任务并重新读取当前商家配置。

商家代理选择“无代理”表示 `proxyId = null`，平台请求允许使用服务器默认出口直连；这里的直连是显式运行模式，不是代理失败后的回退。已绑定代理的商家仍必须让 Binance/OKX 的 HTTP、WebSocket、文件上传和图片下载全部经过该代理，代理失败时直接失败。后台、数据库迁移和 Telegram Bot 管理请求不通过该商家代理规则；Telegram Bot 管理 API 属于平台基础设施出口，若未来也要代理 Telegram 必须另立 Bot 级代理需求。

## 7. 后台实时聊天流程

### 7.1 平台入站

```text
商家当前凭据与出口
  -> Binance 独立 WSS 会话
  -> 完整消息直接处理；未读控制通知按需调用 HTTP 获取消息
  -> 统一消息标准化、订单归属校验、进程内去重
  -> 进程内会话与消息窗口
  -> Socket.IO 推送有权限的后台连接
```

同一平台原生消息只追加一次。订单暂不存在时忽略该消息并记录不含正文的原因；不自动创建订单、不持久化待处理聊天，也不转发到机器人。

发现当前商家买币订单时允许进行一次协议初始化，查询仅用于建立本次运行的消息基线；初始化是否是平台接收前置条件需要真实账号验证。初始化与完整 WSS 入站须协调缓冲和去重，避免把初始化期间的新消息误当作旧历史。

收到有效未读通知后，仅对该商家授权的活动买币订单按需取消息；连续通知合并并限制并发，不按未读数对全部所属单位扫描，也不新建定时历史轮询。响应只归一化当前运行基线之后的新消息，不展示初始化前历史。模板默认只取最新 20 条，不能据此承诺突发消息零丢失；分页游标、积压上限与窗口缺口提示应以 PDF 和实际响应样本冻结。进程重启后重新建立基线，不回放上一进程聊天。

后台首次打开及重连时调用实时快照接口，再处理增量事件。订阅与快照衔接使用运行实例标识和事件序号，在当前内存窗口内去重；进程变化或窗口失效时重新获取快照，不承诺补齐断线期间消息。

### 7.2 后台回复

```text
后台输入文字或图片
  -> 后台登录、merchant:chat:reply 和业务范围鉴权
  -> conversationId、商家和订单会话校验
  -> 读取商家当前凭据与出口
  -> 平台 Adapter 发送
  -> 更新进程内结果并推送后台
```

会话存在且商家、订单允许操作时，操作员直接发送，不增加人工审批或二次确认。请求至少有非空文字或一张图片；图片可带文字说明，按平台能力发送，文字和图片的部分成功必须分别反馈。

客户端不能传入平台凭据、代理配置、目标 URL 或平台订单号覆盖服务端会话。失效会话返回明确错误并禁用发送，不因前端仍显示旧消息就继续发送。

### 7.3 图片

- 仅接收 Adapter 声明的图片 MIME 类型，校验实际文件内容、大小、像素与平台限制，默认文件上限 10 MiB。
- 后台上传使用内存处理，禁用磁盘临时文件、对象存储和请求体日志；并发与总 Buffer 大小必须受限。
- 平台下载、预签名上传和图片发送均使用商家当前出口。
- 平台图片地址只允许固定 host/path 白名单，拒绝内网地址和未校验重定向。
- 浏览器通过受保护的临时图片接口读取，不接收平台原始 URL、Cookie 或签名地址。
- 图片 Buffer 仅存在于当前处理调用链；消息或会话失效后图片不可读取。

### 7.4 连接与发送结果

- 每商家独立连接、退避重连；商家停用、凭据轮换、代理改绑或代理连接配置变化时关闭旧连接并重新校验配置。
- 发送状态区分 `SENDING`、`SENT`、`FAILED`、`UNKNOWN`。`SENT` 仅在协议证据满足时使用，不能仅依据本地缓冲区已清空或 Python 模板 `send()` 返回 True；`sendStatus=0` 是出站帧字段，不能据此认定平台已确认。不表示买家已读。
- 明确未提交平台的失败可以重试；可能已发送的超时进入 `UNKNOWN`，先按平台可用回执或回显核实，不自动重发。
- 无法核实的结果保持未知并提示操作员查看交易平台；不伪造成功，也不承诺跨进程恰好一次发送。
- 同一后台发送请求在当前进程内复用原发送状态；具体请求标识和有效期在契约冻结时确定，客户端不能用同一标识覆盖不同内容。

## 8. 菜单、页面与权限

### 8.1 菜单范围

```text
商家管理
├─ 所属单位
├─ 商家账号          扩展代理配置
├─ 代理管理          新增
├─ 商家订单          可增加聊天快捷入口
└─ 实时聊天          新增

机器人管理          本需求不新增页面或聊天配置
```

| 页面 | 路径/组件 | 功能 |
| --- | --- | --- |
| 代理管理 | `/business/proxies` | 代理列表、批量添加、测试、质量、导入导出；明细使用弹窗/抽屉 |
| 实时聊天 | `/business/merchant-chats` | 所属单位/商家筛选、会话列表、文本/图片、回复和状态 |
| 商家账号（扩展） | `/business/merchants` | 代理选择、当前出口与健康摘要、改绑原因和绑定记录 |

实时聊天采用会话列表与消息窗口。页面必须展示加载、空消息、断线重连、只读权限、平台待接入、发送失败、未知结果和图片过期状态。提示“仅保留当前运行窗口内消息”，不提供历史查询或导出入口。移动端切换会话与消息视图，保留清晰返回入口。

从商家账号或订单跳转时仅预选有权限的商家/会话；无实时会话时展示空状态，不能自动发起平台聊天。

### 8.2 权限

| 行为 | 后台权限 |
| --- | --- |
| 代理查询/新增/编辑/删除 | `system:proxy:read/create/update/delete` |
| 代理测试/质量检测/导入/导出 | `system:proxy:test/quality/import/export` |
| 商家代理改绑 | `merchant:account:update` |
| 聊天查看、订阅与临时图片读取 | `merchant:chat:read` |
| 后台发送聊天 | `merchant:chat:reply`，同时具备 read |

权限通过 `definePermission` 注册，同步 `system/menu/registry/default-admin-menus.ts` 的 `BusinessPageDefinition`、菜单数据库升级及角色授权。复用现有默认菜单同步和前端动态菜单机制，避免创建重复菜单。

菜单分组与权限前缀不必一致，代理页放在“商家管理”下仍使用 `system:proxy:*`。功能权限和业务范围必须同时满足；前端按钮隐藏不能替代后端校验。权限撤销后停止对应聊天订阅并拒绝后续快照、图片读取与回复。

## 9. 数据与运行时模型

### 9.1 `ip_proxy`

当前实现使用 `ip_proxy` 表，包含 `tenantId`、连接字段、加密 `passwordRef`、只读 `passwordConfigured`、去重指纹、持久化 `status`、`expiresAt`、`expiryWarnDays`、`fallbackMode`、`backupProxyId`、`lastTest`、`lastQuality` 及创建/更新时间。最新检测结果存为 JSONB；不增加健康历史、revision 或软删除模型。

数据库约束四协议、端口、持久化状态、提醒天数、自引用以及同单位备用代理。过期为派生状态，不写入 status。编辑 API 省略 password 保留密码，显式空字符串清除密码；前端编辑留空时省略字段。查询和导出不返回密码、Secret 引用或指纹。

### 9.2 商家账号代理绑定

`merchant` 新增可空 `proxyId`，复合外键 `(proxyId, tenantId)` 引用代理，允许多个商家共用同一个代理，禁止跨单位绑定和删除仍被引用的代理。绑定事务检查代理状态与有效期，并按 tenantId 和 merchantId 更新商家。

当前 HTTP 和临时 WebSocket 在发送前解析当前绑定，不缓存长期连接。未来后台实时聊天若引入长连接，再实施第 7 节的失效、关闭和连接所有权机制；本次不新增 bindingVersion 或绑定历史表。

### 9.3 聊天运行时数据（不建表）

运行时只保存会话、消息、平台消息去重、后台发送状态和订阅事件序号：

- 每个会话最多 200 条消息，消息默认 TTL 为 2 小时。
- 全局最多 10,000 条消息，超限淘汰最早消息；空会话、去重项和发送状态也必须有过期和容量上限。
- 不保存 Telegram 消息 ID、群 ID、成员身份或群回复映射。
- 聊天正文与图片不写数据库、Redis、BullMQ、对象存储、`sys_log` 或业务审计正文。
- 进程重启后无法恢复；TTL 或容量淘汰后不能查询或回复失效会话，不提供历史回放；协议初始化和未读通知触发取消息仍按当前运行基线过滤。

不新增 `merchant_chat_*` 持久化表；若其他部署存在历史表，本期不写入或自动删除，清理另走 expand-contract。

一期部署要求同一份聊天内存由单一活动运行实例持有，平台连接、快照、发送、附件读取及 Socket.IO 订阅必须访问该实例；其他业务服务可按原部署运行。需要多实例聊天时，先补充连接所有权和请求路由设计，不能直接多开相同消费者，不能把聊天正文塞入 Redis 解决共享问题。

### 9.4 迁移和兼容

1. 通过 `C2cIpProxies1789030000000` 新增代理表和商家 `proxyId`，建立所属单位复合外键及约束。
2. 商家已有记录默认 `proxyId = null`，对应明确直连，不自动分配或猜测代理。
3. 同步代理菜单与后台权限，保持稳定 key；聊天菜单待后续实施。
4. 不因本需求修改 `telegram_bot`、`telegram_group`、成员能力或 `merchant.botCode/chatId`，不回填群绑定。

迁移按版本登记到 `server/backend/apps/admin/database/migrations/index.ts`，实体登记到 `database/business/index.ts` 和 `database.module.ts`，生产保持 `synchronize: false`。每个结构迁移在事务内检查、变更和校验，并增加隔离 PostgreSQL schema 的首次部署、约束校验、重复部署跳过测试。

## 10. API 与实时契约

### 10.1 通用约定

沿用现有 Bearer、DTO 校验、业务范围、响应包装、分页和错误处理，不新增第二套 HTTP Client。除代理保留 sub2api 的 snake_case 协议外，对外 JSON 和 TypeScript 字段沿用既有约定；所属单位/商家范围由 JWT 与 `BusinessScopeService` 校验，不能由普通请求参数扩大。

普通成功响应为 `{ code, data, msg, timestamp }`；错误为 `{ code, msg, data, timestamp, path }`，稳定业务错误放在 `data.reasonCode`，展示文案不拼接远端原文或 Secret。

### 10.2 代理

完整请求/响应、权限、错误和限额见 [后端 IP 代理 API](../projects/backend/doc/api/main/c2c-proxies.md)。路由通过 SystemModule 挂载至 `/v1/sys/proxies`，前端 requestClient 调用 `/sys/proxies`。

当前实现列表、all、创建、batch、data 兼容接口、编辑、删除、batch-delete、单项 test/quality-check、accounts、bindings/:merchantId。批量检测由前端限制并发并调用单项检测，不增加批量检测 endpoint、stats 或独立健康历史。

统一响应包装不变；代理列表 data 保留 `{ items, total, page, page_size, pages }`，前端资源表格适配分页。代理权限使用 system:proxy；accounts 同时要求 merchant:account:read，bindings 同时要求 merchant:account:update。业务范围由 JWT/BusinessScopeService 解析并显式约束租户与商家。

### 10.3 商家

商家响应新增 `proxyId`。商家账号列表使用独立代理列选择直连或代理，保存成功更新当前行；“配置 + 更多”操作列宽度为 150px，权限与后端保持一致。

### 10.4 后台聊天 HTTP

```text
GET  /v1/sys/merchant-chats/live
POST /v1/sys/merchant-chats/live/reply
GET  /v1/sys/merchant-chats/live/messages/{messageId}/attachments/{attachmentId}
```

- `live`：当前内存快照，接受可选 `tenantId/merchantId`，仅在授权范围内筛选；返回实例标识、快照事件序号、平台能力、连接状态、会话和消息，不提供历史分页。
- `reply`：文字或图片发送，使用 `multipart/form-data`，包含 `conversationId`、`merchantId`、可选 `text` 和单张图片；后台用户身份取自 JWT。发送请求标识、重复提交和部分发送结果结构在契约冻结时补齐。
- 临时图片：重新校验 read 权限与所属单位、商家、消息归属，成功返回图片流；过期返回稳定错误。浏览器通过带鉴权的请求获取 Blob，不在 URL 上放 Token。

列表、图片和回复均不得泄露其他所属单位或商家是否存在；客户端不能通过任意会话 ID 绕过资源范围。

### 10.5 Socket.IO

复用现有登录会话认证，新增聊天业务订阅。技术契约至少包含以下语义，具体事件名在实施前冻结：

| 方向 | 语义 | 约束 |
| --- | --- | --- |
| 客户端到服务端 | 订阅/取消订阅商家实时消息 | 校验 read 权限和业务范围，由服务端决定房间 |
| 服务端到客户端 | 新消息/发送状态变化 | 携带实例标识、事件序号、会话和消息 ID |
| 服务端到客户端 | 平台连接/能力状态变化 | 仅推送对应商家授权连接 |
| 服务端到客户端 | 会话窗口失效/权限失效 | 清理订阅，页面清空失效数据或禁用发送 |

不得按客户端传入的租户房间名直接加入订阅，也不得广播全部商家消息。重连仅同步当前内存快照，协议不承担历史重放。

### 10.6 标准化 Adapter 消息

```text
C2cChatInboundMessage:
  tenantId, merchantId, platform, platformOrderId
  sourceMessageId, buyerName, messageType: TEXT | IMAGE
  text?, attachments?, occurredAt, receivedAt
  origin: BUYER | SELF | PLATFORM_AUTO

C2cChatOutboundMessage:
  tenantId, merchantId, platform, platformOrderId
  requestId, idempotencyKey, actorUserId
  messageType: TEXT | IMAGE
  text?, attachments?
```

入站使用平台原生消息 ID；平台支持 uuid 回显时按原生 uuid 关联出站状态。`actorUserId` 由后台登录会话生成，不接受 Telegram 身份。幂等摘要由服务端结合发送请求、目标会话和内容生成，状态仅在当前进程有效。

### 10.7 错误与字段补齐

代理 DTO、字段类型、错误包装与 HTTP 状态以 [后端 IP 代理 API](../projects/backend/doc/api/main/c2c-proxies.md) 为准，响应不含密码或 Secret 引用，过期为派生状态。

已实施的聊天字段、稳定错误码及状态以 [后台聊天 API](../projects/backend/doc/api/main/c2c-merchant-chat.md) 为准；未接入平台统一返回 `CHAT_UNSUPPORTED`，未知结果不提供自动重试接口。

不再定义 Telegram 聊天成员、群原消息映射等错误；已有非聊天接口的错误保持兼容。

## 11. 实施顺序

代理已按 [IP 代理实施契约](c2c-proxy-contract.md) 交付；2026-10-16 实现 Binance 后台实时聊天，具体 HTTP/实时事件、失败语义、容量与发布要求以 [后台聊天实施契约](c2c-merchant-chat-contract.md) 和 [后台聊天 API](../projects/backend/doc/api/main/c2c-merchant-chat.md) 为准。下表保留完整阶段蓝图，绑定历史和 OKX 聊天另行实施。

| 阶段 | 工作 | 准入/完成证据 |
| --- | --- | --- |
| 0. 契约和样本 | 按第 3.4、3.5 节源码和 PDF 冻结授权、双路径入站、基线、分页、发送状态、实时事件和部署路由 | 脱敏样本、字段映射及契约测试；图片发送/回执缺口逐项验证，OKX 标记待接入 |
| 1. 代理资源管理 | 迁移、Secret、CRUD、批量操作、固定检测目标、代理页及菜单 | 所属单位隔离、密码不回显、健康快照、批量逐项结果 |
| 2. 商家绑定与出口 | 商家选择器、绑定历史、HTTP/WS Transport、订单/广告/付款/申诉/上传下载接入 | 直连/代理模式隔离、真实出口、代理失败不回退、改绑关闭旧连接 |
| 3. Binance 后台聊天 | 独立 WSS、未读通知触发 HTTP、内存基线及路由、文本/图片、后台 API/订阅/页面 | 两类入站、数组/乱序/精度、图片出口、订阅鉴权、幂等与未知结果处理 |
| 4. 集成发布 | 完整验证、迁移链、桌面/移动端及重启过期测试 | 第 12 节通过，先发布兼容后端再发布前端 |

代理页新增 `apps/frontend/src/api/business/proxies.ts`、`apps/frontend/src/views/business/proxies/index.vue`；聊天页新增 `apps/frontend/src/api/business/merchant-chat.ts`、`apps/frontend/src/views/business/merchant-chats/index.vue`，统一复用 `requestClient`。

不安排 Telegram 聊天开发阶段。OKX 协议接入在资料到位后单独排期，复用上述后台能力和出口契约。

## 12. 验收标准

以下覆盖完整蓝图；代理验收以 [IP 代理实施契约](c2c-proxy-contract.md) 为准，后台聊天验收以 [后台聊天实施契约](c2c-merchant-chat-contract.md) 为准。标准及批量添加响应为 created/skipped，前端过滤无效 URL 行；不新增逐行 failed 响应。

1. 两个新增菜单为“商家管理 / 代理管理”和“商家管理 / 实时聊天”，商家账号可配置代理。
2. 标准及批量添加可用，批量逐项返回创建/跳过/失败及原因；被绑定代理删除受保护。
3. 相同代理可分配多个商家；跨所属单位绑定、查看、测试和发送均被拒绝。
4. 未绑定代理明确直连；已绑定代理的全部商家平台请求走当前代理，失败、过期、停用均不回退。
5. 代理改绑/配置变化或凭据轮换后旧连接关闭，新请求和连接使用当前有效配置。
6. 有权限的后台用户可实时查看 Binance 文字和图片并回复；只读用户不可发送，权限撤销后停止订阅。
7. 没有配置 Telegram Bot 或商户群时，后台聊天仍正常；平台聊天不会调用 Telegram 发送接口。
8. Telegram 群内普通消息或原生回复不会通过本方案发给平台买家；既有机器人支付/查询/通知行为不受影响。
9. 平台重复帧、出站回显及后台重复提交在当前进程内幂等；未知发送结果不会自动重发。
10. 文字、图片和附件地址均不写数据库、Redis、队列、对象存储或正文日志，上传无磁盘临时文件。
11. 消息 TTL、数量限制、图片大小、Buffer 并发上限和运行实例归属有效；重启/淘汰后展示失效状态。
12. 临时图片接口需鉴权，不暴露平台原始 URL；白名单、重定向、类型、大小和失效错误有自动化测试。
13. 代理密码、Cookie、平台凭据不进入查询响应、后台可见 URL、日志、任务参数或审计正文；外部协议必需的认证参数仅用于受控 Transport，不暴露给浏览器。
14. 固定探测地址和质量目标只能由服务端配置，客户端不能替换目标。
15. OKX 聊天显示待接入且不可发送，不影响已有非聊天能力或 Binance 交付。
16. 本期无 Telegram 聊天能力、群绑定回填、Bot 入口模式或商家唯一群的新增迁移。
17. 完整 WSS 消息与未读通知触发 HTTP 两条路径均有契约测试，通知合并、当前商家活动订单范围、初始化基线、数组逐项处理、大 ID 字符串和乱序去重有效；不引入定时消息轮询或历史回放。
18. HTTP 消息获取、WSS 换证/心跳/重连均使用当前商家出口；模板本地发送成功不被展示为平台确认，图片发送须有独立协议证据。

后端执行 `lint -> typecheck -> test -> build -> workspaceCheck`，结构变更追加隔离 schema integration 和迁移链验证；前端执行 `lint -> typecheck -> test -> build`，核心聊天链路追加 E2E、桌面/移动视口和权限状态验证。真实平台出口及协议联调结果单独记录，单元测试通过不替代外部验收。

## 13. 协议证据与联调待办

- Binance 文本发送、凭据、WSS URL、未读通知触发 HTTP 和连接维护依据第 3.4、3.5 节源码实现；用户提供的订单聊天 API PDF 已确认图片预签名接口、响应字段、PUT 上传及 image 帧。自动测试覆盖包裹数组、分页、基线、回显与未知结果；真实账号仍需核对实际帧、图片域名和平台回显。
- sub2api 参考提交号；引用 PDF 的版本和内容确认，避免依赖不存在的旧文件名。
- HTTP 代理对 WSS CONNECT、SOCKS5 对远端 DNS 的供应商支持及出口证明。
- 请求标识、部分成功响应、Socket.IO 事件与快照 DTO 已冻结在后台聊天实施契约；生产需确认单活动 admin 实例及 HTTP/Socket.IO/图片的统一路由。
- OKX Python 模板未提供聊天协议；聊天授权、Origin/路径白名单和消息协议仍待补充，属于后续接入资料，不作为一期阻塞项。不得照搬模板的浏览器登录/会话获取方式到 `OKX_WEB_PRIVATE`。

后台统一聊天、Telegram 不承接聊天、消息不持久化、手工代理分配和已绑定代理失败不回退是本版本固定范围。
