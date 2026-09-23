# pfa-pay C2C 商家与支付机器人全流程对比报告

## 1. 结论

本次以 `templates/pfa-pay` 为只读行为基准，重新核对币安商家、欧易商家、支付机器人、通知和后台任务。
发现的行为缺口已修复；当前实现与参考项目在用户可见流程、上游协议、按钮、通知触发条件、失败停止条件和重试语义上对齐。

对齐不等于复制内部实现。本项目继续使用 PostgreSQL、TypeORM migration、NestJS Provider、租户/商家双重隔离、数据库原子认领和多 Worker 安全设计，没有复制参考项目的 MongoDB 模型、明文 Secret、跨租户权限或单进程内存状态。

本次验证为代码、单元测试和隔离数据库测试；未调用真实币安、欧易、支付宝或 Telegram 账号。生产凭据联调仍需在部署环境执行。

## 2. 对比范围与参考入口

主要参考文件：

- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/binance-c2c.client.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/okx-c2c.client.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/c2c-sync.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/c2c-paid-confirmation.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/c2c-completion-reply.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/c2c/c2c-report.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-c2c-notification.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-c2c-appeal.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-c2c-auto-appeal.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-alert.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-order-notification.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-batch-notification.service.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-query-formatter.ts`
- `templates/pfa-pay/server/pay/apps/admin/modules/tg-bot/platform/bot-runtime.service.ts`

本项目对应入口：

- `apps/admin/modules/c2c-platform/*`
- `apps/admin/modules/c2c-order/*`
- `apps/admin/modules/payment/*`
- `apps/admin/modules/telegram/*`
- `apps/admin/modules/system/task/jobs/c2c-automation.job.ts`

## 3. 平台能力矩阵

| 能力         | 币安         | 欧易                             | 与 pfa-pay 对齐情况                                          |
| ------------ | ------------ | -------------------------------- | ------------------------------------------------------------ |
| 买单列表同步 | 支持         | 支持                             | 已对齐                                                       |
| 买单详情     | 支持         | 支持                             | 已对齐                                                       |
| 卖单处理     | 不支持       | 不支持                           | 明确拒绝非 BUY 数据                                          |
| 标记付款     | 支持         | 支持                             | 已对齐                                                       |
| 付款凭证上传 | 不需要       | 可配置必传/跳过                  | 已对齐                                                       |
| 反欺诈检查   | 不支持       | 支持                             | 已对齐                                                       |
| 平台聊天     | 支持         | 不支持                           | 已对齐，欧易配置强制关闭                                     |
| 申诉         | 支持         | 支持                             | 币安使用预签名上传；欧易使用回单上传和 `appealUrge` 两步接口 |
| 上游日报     | 支持         | 支持                             | 币安与 pfa-pay 一致；欧易按实际接口补齐；均不使用本地聚合    |
| 凭证失效识别 | API 错误上抛 | HTTP 401/403、码 401/403/800/805 | 已补齐                                                       |

## 4. 币安全流程

| 阶段     | 当前实现                                                   | 关键约束                                             |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| 凭据     | API Key、Secret Key 加密保存，按商家单版本生效             | API 地址白名单；响应不返回 Secret                    |
| 同步     | `/sapi/v1/c2c/orderMatch/listOrders`，签名、分页、重叠窗口 | 只接收明确 BUY；订单 ID、金额使用字符串              |
| 详情     | `/sapi/v1/c2c/orderMatch/getUserOrderDetail`               | 持久化 KYC、实名、收款人、收款账号、payId            |
| 核验     | KYC、状态、payId、支付宝资料、实名一致性                   | 资料缺失/KYC 失败不可支付且不显示确认下单按钮        |
| 自动下单 | 实名一致且可支付，按支付方案创建支付订单                   | 来源只用于记录，不改变通道路由与批次策略             |
| 人工确认 | 仅实名不一致但资料完整且可支付的订单                       | 按钮为“确认下单 / 取消订单”                          |
| 支付     | 即时通道直接提交；批次通道进入 READY                       | 预检再次查询平台并校验金额、币种、账号和实名         |
| 标记付款 | `/sapi/v1/c2c/orderMatch/markOrderAsPaid`                  | 支付成功后进入独立平台确认状态，不重复支付           |
| 平台聊天 | 创建、付款、完成三个可配置阶段                             | 完成回复只处理启用时间后的订单，数据库认领且失败退避 |
| 手工申诉 | 实时查状态和原因，获取支付宝 PDF 回单，转 JPG，上传并提交  | 只允许上游 PAID；重复/并发提交由数据库阻止           |
| 自动申诉 | 默认原因码 1，超时后每 30 秒扫描                           | 原因缺失转人工；终态跳过；结果不确定禁止自动重试     |
| 日报     | `/sapi/v1/c2c/orderMatch/listUserOrderHistory` 多页聚合    | 北京业务日、BUY、精确十进制累计                      |

### 币安状态映射

| 上游                  | 商家订单                                  | 中文展示          |
| --------------------- | ----------------------------------------- | ----------------- |
| `1 / PENDING_PAYMENT` | `PENDING_PAYMENT`                         | 待付款            |
| `2 / PAID`            | `PENDING_RELEASE`                         | 已付款待放行      |
| `3 / DISPUTED`        | `DISPUTED`；已出资时为 `FUNDS_EXCEPTION`  | 申诉中 / 资金异常 |
| `4 / COMPLETED`       | `COMPLETED`                               | 已完成            |
| `6 / CANCELLED`       | `CANCELLED`；已出资时为 `FUNDS_EXCEPTION` | 已取消 / 资金异常 |
| `7 / EXPIRED`         | `EXPIRED`；已出资时为 `FUNDS_EXCEPTION`   | 已过期 / 资金异常 |
| 未识别                | `EXCEPTION`                               | 异常              |

## 5. 欧易全流程

欧易实现隔离在 `OKX_WEB_PRIVATE` Adapter，不扩展为模拟登录、验证码绕过或任意 URL 请求。

| 阶段     | 当前实现                                                      | 与参考流程                                                                 |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 凭据     | Cookie、Authorization、PKCS#8 EC 私钥加密保存                 | 一致                                                                       |
| 列表     | `/v4/c2c/order/getOrderList`，要求真实 `id`                   | 不再使用 `publicTradingOrderId` 代替路径 ID                                |
| 详情     | `/v3/c2c/orders/:id`                                          | 映射实名、KYC、收款账户、付款状态                                          |
| 付款凭证 | `/v3/c2c/files/`                                              | 上传真实图片；默认允许账号配置跳过                                         |
| 反欺诈   | `/v4/c2c/risk/antiFraudPopup/info`                            | 请求失败继续；明确要求弹窗则阻止并转人工                                   |
| 签名     | `path + JSON body + timestamp`，ECDSA P1363                   | 与参考 Python/TypeScript 流程一致                                          |
| 标记付款 | `/v3/c2c/orders/:id/payment/paid`                             | `receiptAccountId` 保持整数 JSON，避免大整数精度损失                       |
| 申诉     | `/v3/c2c/files/?type=reminder` -> `/v3/c2c/appeal/appealUrge` | 只上传一张 JPG；提交使用返回的 `data.imgPath`；保存 `requestId` 作为追踪号 |
| 结果确认 | 标记后重新查询订单详情                                        | 只有 PAID/COMPLETED 收口成功                                               |
| 节流     | 商家账号级 PostgreSQL 持久化锁                                | 最小/最大间隔跨 Worker 生效                                                |
| 凭证失效 | HTTP 401/403、业务码 401/403/800/805                          | 停用商家及当前凭据，只通知一次                                             |

欧易不支持平台聊天，创建或更新欧易商家时聊天开关强制保持关闭。欧易支持手工和自动申诉，自动申诉开关可正常配置。日报直接查询欧易 `/v4/c2c/order/getOrderList` 的 `completed` 买入订单并分页聚合，不读取本地同步订单表。

## 6. 支付和回查状态机

支付订单内部状态：

`PENDING_CONFIG -> READY -> SUBMITTING -> PROCESSING/UNKNOWN -> SUCCESS`

关键语义：

- 15 秒“自动回查支付结果”任务保留。
- 只回查支付宝处于 `SUBMITTING / PROCESSING / UNKNOWN` 的单笔或批次，不是每 15 秒重做所有支付。
- 支付通道查询策略由各 Adapter 的 reconciliation policy 定义；业务层不写死支付宝查询时机。
- 支付成功后才执行币安/欧易标记付款。
- 平台确认使用 `PENDING / PROCESSING / FAILED / SUCCESS` 独立状态和数据库条件更新原子认领。
- 支付订单进入 `SUCCESS` 后不因平台确认进度改变；只有确认上游取消、过期或争议形成资金冲突时才进入 `FUND_EXCEPTION`。
- 首次标记失败落到 `FAILED`，15 秒任务不会无限重试；只有 Telegram“重试”按钮可人工重试。
- 超时的 `PROCESSING` 恢复只查询平台状态；平台仍待付款时停止并要求人工重试，不盲目再次调用标记接口。
- `BOT_MANUAL` 与 `C2C_BUY` 都进入同一支付、批次、查单与回单基础设施；来源不参与账号、通道或批次策略选择。
- 支付订单的手工“上游查询”只读取支付订单、锁定账号/通道和批次关联，不依赖本地商家订单。即时转账调用 `alipay.fund.trans.common.query`；批次子单按关联批次号调用 `alipay.fund.batch.detail.query`，再以系统支付单号匹配明细，与 `pfa-pay` 的批次子单查单方式一致。

## 7. 机器人命令与权限

| 能力     | 命令/输入                                    | 权限                     |
| -------- | -------------------------------------------- | ------------------------ |
| 帮助     | `/help`、`/start`                            | 已绑定群组；基础命令例外 |
| 用户编号 | `/myid`                                      | 无业务权限要求           |
| 绑定群   | `/bind 平台商家编号`                         | 全局超级管理员           |
| 查单     | `/query 标识`、`查单 标识`                   | `ORDER_QUERY`            |
| 回单     | `/receipt 标识`、`回单 标识`                 | `RECEIPT_QUERY`          |
| 今日统计 | `/stats`、`今日跑量`、`今日统计`             | `PAYMENT_STATISTICS`     |
| 昨日统计 | `昨日统计`                                   | `PAYMENT_STATISTICS`     |
| 当月统计 | `当月统计`                                   | `PAYMENT_STATISTICS`     |
| 手工订单 | 每笔四行，可连续多笔                         | `ALIPAY_BATCH_PAYMENT`   |
| 提交批次 | `/submitbatch`、`提交/提交批次/提交批次订单` | `PAYMENT_BATCH_SUBMIT`   |
| C2C 申诉 | `/appeal C2C订单号`、`申诉 C2C订单号`        | `C2C_APPEAL`             |
| C2C 日报 | `日报 [YYYYMMDD]`                            | `C2C_DAILY_REPORT`       |
| 状态     | `/status`                                    | `BOT_STATUS_MANAGE`      |

超级管理员在授权群组内取机器人能力与群组能力的交集，不需要再创建普通成员记录；回调按钮会重新执行相同鉴权，不能通过旧消息越权。

`C2C_PAID_NOTIFICATION`（C2C 标记付款通知）是机器人和群组的独立通知能力：开启时发送完整批次标记付款结果；关闭且全部成功时静默；关闭但存在失败时仍发送失败摘要和逐笔重试按钮。单笔标记失败始终通知。上述失败兜底不受普通事件类型筛选影响，但仍遵守群组的全局“启用业务通知”开关。

## 8. 通知触发与文案

### 8.1 商家订单发现

只对“实名不一致、但 KYC/收款资料完整且仍可支付”的订单发送：

```text
🔴 实名不一致，等待确认

订单信息
商家订单号：...
金额：... CNY
资产：USDT

收款信息
姓名：...
账号：...
方式：支付宝

实名核验
KYC：PASS
实名：...
持有人：...
结果：不一致
```

按钮：`确认下单`、`取消订单`。KYC 失败、资料缺失或不可付款订单不提供按钮。

订单首次同步入库时，对仍待付款、KYC 通过、所选收款方式和收款资料完整、支付宝人民币、付款期限未过且仅实名不一致的订单，向绑定该商家并启用 C2C 支付能力的群组尝试投递一次审核消息。消息标题、区块、字段顺序及按钮文案与 pfa-pay 实际消息一致，回调 ID 使用本系统订单 ID。发送失败或当时没有可用群组均不补发；后续同步不会重复通知。群组全局通知开关关闭时不发送。商家订单详情显示平台实名与收款人差异及未自动建支付单的原因。点击按钮须重新校验成员权限和租户、商家范围；确认下单前实时查询平台订单，复核状态、金额、资产、支付方式、收款账号及姓名，任何变化均不得创建支付订单。人工确认仍遵循已配置的支付方案；作废订单不得触发付款。

### 8.2 自动创建支付订单

```text
🟢 C2C订单已自动创建

订单信息
商家订单号：...
系统订单号：...
金额：... CNY

收款信息
姓名：...
账号：...
方式：支付宝

实名核验
KYC：PASS
持有人：...
结果：一致，已自动下单
```

按钮：`查询订单`、`作废订单`。

### 8.3 单笔最终结果

- 标题：`🟢 转账成功` 或 `🔴 转账失败`。
- 成功消息提供 `获取回单`。
- 批次子订单不发送单笔结果，最终只发一次批次汇总。
- 资金 `SUCCESS` 对用户显示“支付成功”；平台确认状态单独展示，不再复用支付状态。

### 8.4 自动批次

先发送：

```text
自动批次提交结果

本次提交订单：N 笔
订单总金额：¥...
发现批次组：N
已提交批次：N
失败批次：N
```

系统保存每个群组返回的 Telegram `message_id`。批次终态后发送“自动批次处理结果”，并回复对应群组的提交消息，不会出现最终结果先于提交摘要。

### 8.5 标记付款失败

```text
⚠️ C2C 确认付款失败

姓名：...
收款账号：...
收款方式：支付宝
金额：¥...
商家订单号：...
失败原因：...
```

按钮：`重试`。启用 `C2C_PAID_NOTIFICATION` 时，批次标记结果使用“🔔 C2C 标记付款结果”，仅失败订单显示逐笔重试按钮；关闭该能力后，纯成功结果静默，存在失败时改发“⚠️ C2C 标记付款失败”摘要及逐笔重试按钮。

### 8.6 凭证失效

```text
⚠️ C2C 凭证失效，账号已停用

平台：欧易
账号：...
商户号：...
原因：...

请在后台更新该账号的凭证后，将账号重新启用。
```

停用操作是数据库事务；并发 Worker 只有第一个成功停用者发送通知，后续不会重复通知。

### 8.7 异常通知去重

自动支付异常使用数据库唯一键 `(tenantId, merchantId, code, referenceId)` 登记，只发送一次。支付进入明确失败状态后不会被候选查询重复支付。

## 9. 申诉流程

手工与自动申诉共用同一服务：

1. 按 `tenantId + merchantId + orderId` 读取订单。
2. 要求平台支持申诉、商家启用、支付订单 `SUCCESS`、平台确认 `SUCCESS`、商家订单 `PENDING_RELEASE`。
3. 数据库原子认领，阻止机器人、后台、定时任务并发提交。
4. 实时查询平台订单，只有上游 `PAID` 继续。
5. 获取申诉原因；币安实时读取原因，欧易使用固定原因；自动申诉选择原因码 `1`。
6. 通过支付通道获取支付宝回单 PDF。
7. PDF 转 JPG；币安最多上传 5 张，欧易只上传第一张并取得 `data.imgPath`。
8. 提交申诉并保存平台申诉单号或欧易 `requestId` 追踪号。
9. 上游提交已发出但结果不确定时保留处理中状态，禁止自动重试。

自动申诉每 30 秒扫描一次。临时失败按 1、2、4 分钟递增，最长 1 小时；上游完成/取消/过期/争议永久跳过；没有原因码 1 转为人工处理。

## 10. 定时任务

| 任务                 | 周期  | 作用                                     |
| -------------------- | ----- | ---------------------------------------- |
| 自动发现商家订单     | 5 秒  | 领取到期账号并分页同步                   |
| 自动执行商家订单支付 | 5 秒  | 创建支付订单、即时提交或按策略提交批次   |
| 自动回查支付结果     | 15 秒 | 通道查单、批次查单、平台确认恢复         |
| C2C付款超时自动申诉  | 30 秒 | 处理启用窗口内的币安和欧易超时待放行订单 |
| C2C订单完成自动回复  | 30 秒 | 回查币安完成状态并可靠发送一次聊天回复   |

同步任务在本轮新发现订单后立即触发一次自动支付扫描，以消除两个 5 秒任务执行顺序导致的新订单等待；15 秒恢复任务保持独立。

## 11. 本次修复清单

1. 新增币安上游历史订单日报与精确多页聚合。
2. 持久化 KYC，通知不再默认写死。
3. 补齐币安与欧易自动申诉、启用时间窗口、终态跳过、原因码 1 和指数退避。
4. 自动申诉改为类型化错误，不再依赖中文异常字符串，也不再重复查询原因。
5. 补齐完成自动回复启用窗口、主动回查、原子认领、失败退避和一次性发送。
6. 补齐欧易 401/403/800/805 凭证失效识别、事务停用和一次性通知。
7. 欧易不支持的聊天开关在配置层强制关闭；申诉开关按真实两步接口开放。
8. 修正实名不一致通知的触发条件、字段顺序、按钮和文案。
9. 修正单笔/批次标记付款失败文案与重试按钮。
10. 自动批次提交消息持久化 `message_id`，最终结果按群回复。
11. 支付状态、平台状态和收款方式统一中文展示。
12. 保留平台确认失败停止、人工重试和 15 秒查询恢复策略。
13. 自动支付异常改为 PostgreSQL 持久化去重。
14. OKX 标记付款使用账号级持久化节流锁。
15. 欧易日报改为直接查询上游已完成订单列表，删除 Telegram 日报的本地订单聚合回退。
16. 恢复 `C2C_PAID_NOTIFICATION` 独立能力及前端开关，并为已有支付机器人和群组默认启用；关闭后仅抑制成功结果，失败通知始终保留。
17. 修正支付订单手工上游查询：机器人手工单不再要求关联商家订单，支付宝批次子单改用批次详情接口并按支付单号提取明细。

## 12. 架构差异但行为等价

| pfa-pay                   | 当前实现                                           | 原因                                                         |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| MongoDB 文档状态          | PostgreSQL 实体、历史表、约束和迁移                | 保证事务、审计和多 Worker 安全                               |
| 单进程机器人上下文        | Telegram 交互表、批次消息关联 JSON、数据库认领     | 防重复点击和重启丢状态                                       |
| Provider service 直接分支 | `C2cPlatformClient` + Binance/OKX Adapter 能力矩阵 | 复用查单、详情、标记、聊天、申诉、日报能力                   |
| 欧易日报返回空数据        | 直接查询欧易 `completed` 买入订单                  | 实际接口支持历史查询，避免用空数据或本地缓存冒充上游对账数据 |
| 内存通知防重              | 唯一约束和原子更新                                 | 多实例下仍只发送一次                                         |
| 账号级内存节流            | PostgreSQL 商家锁和下次执行时间                    | 多 Worker 下顺序一致                                         |

## 13. 明确排除

按产品要求不实现：

- 余额查询、余额通知、充值通知及 `/balance`/“余额”入口。
- pfa-pay 的 MongoDB 数据模型。
- 明文 API Key、Cookie、Authorization 或私钥。
- MD5 密码、跨租户权限、单进程机器人架构。
- 用户 App、商品、积分、价格方案和 App 订单模块。
- OKX 模拟登录、验证码绕过或任意 URL 代理。

## 14. 验证与残余风险

自动化覆盖包括：平台协议与状态归一化、欧易签名/反欺诈/凭证失效、币安与欧易上游日报、KYC、同步、自动支付、批次策略、15 秒恢复、平台确认、账号节流、聊天回复、手工/自动申诉、机器人权限、按钮、文案、通知去重和消息引用。

本次实际验证结果：

| 验证项                                                | 结果                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run lint:server`                                | 通过                                                                                                                                                |
| `pnpm run typecheck:server`                           | 通过                                                                                                                                                |
| `pnpm run test:server -- --runInBand`                 | 通过，93 个套件、461 个测试                                                                                                                         |
| `pnpm --filter ./server/backend run test:integration` | 通过，25 个套件、73 个测试                                                                                                                          |
| `pnpm run build`                                      | 通过，生成 `output` 和 `output.zip`                                                                                                                 |
| `pnpm run monorepo:check`                             | 通过，workspace 与 catalog 均一致                                                                                                                   |
| 迁移发布产物                                          | 已确认 `output/volumes/apps/migrate/main.js`、`output/compose.yaml`、`output.zip` 存在，且 migrate bundle 包含 `C2cFullProviderParity1789024000000` |
| `git diff --check`                                    | 通过                                                                                                                                                |

数据库集成验证期间发现部分旧测试夹具只执行到旧迁移版本，实体加载新字段时会报列不存在；已把这些隔离 schema 的迁移链补到 `1789024000000`，并同步 Telegram mock 的 `messageId` 返回契约，完整集成测试复跑通过。

残余风险：

- 币安、欧易私有接口可能在生产环境变更字段或风控要求，需使用实际账号做部署后冒烟验证。
- Telegram `reply_parameters` 在原消息被删除时依赖 `allow_sending_without_reply` 降级为普通消息。
- 支付回单依赖支付宝实际生成时间；暂不可用时申诉按退避策略重试，不伪造成功结果。
- 本报告不包含页面自动化验证，符合本次任务约束。
- 本次没有启动后端，也没有调用真实币安、欧易、支付宝或 Telegram 账号；真实私有接口、风控与凭据仍需部署后冒烟验证。
