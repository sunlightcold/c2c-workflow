# C2C 商家订单 API

Controller：`C2cOrderController`。基础路径：`/v1/sys`。所有接口均要求登录并使用统一响应包装。

| Method | Path                                   | 权限                          | Request                                                                                                               | data                                                                     |
| ------ | -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/merchant-orders`                     | `merchant:order:read`         | Query `{ tenantId?, merchantId?, platformOrderId?, status?, paymentMethod?, startTime?, endTime?, page?, pageSize? }` | 分页买币订单及关联支付单摘要；不传 `merchantId` 时查询经营单位内全部商家 |
| GET    | `/merchant-orders/statistics`          | `merchant:order:read`         | Query `{ tenantId?, merchantId?, platformOrderId?, paymentMethod? }`                                                 | 今日、昨日支付成功金额与笔数，今日待付款金额与笔数                         |
| GET    | `/merchant-orders/{id}`                | `merchant:order:read`         | Query `{ tenantId?, merchantId }`                                                                                     | 订单详情与状态时间线，含 `identityName`、`payeeName`、`identityMatched`、`kycStatus`；实名不一致时前端展示未自动建支付单原因 |
| POST   | `/merchants/{id}/orders/sync`          | `merchant:order:sync`         | Query `{ tenantId? }`                                                                                                 | `{ scanned, created, updated }`                                          |
| POST   | `/merchant-orders/{id}/payment`        | `merchant:order:pay`          | Body `{ tenantId?, merchantId }`                                                                                      | 按启用支付方案创建支付并锁定支付账号与通道                               |
| POST   | `/merchant-orders/{id}/confirm-paid`   | `merchant:order:confirm_paid` | Body `{ tenantId?, merchantId }`                                                                                      | 重试平台付款确认，不重复发起支付宝付款                                   |
| POST   | `/merchant-orders/{id}/cancel`         | `merchant:order:cancel`       | Body `{ tenantId?, merchantId, reason }`                                                                              | 原子作废尚未提交资金请求的商家订单与支付单                               |
| GET    | `/merchant-orders/{id}/appeal-reasons` | `merchant:order:appeal`       | Query `{ tenantId?, merchantId }`                                                                                     | 查询当前平台可用的申诉原因                                               |
| POST   | `/merchant-orders/{id}/appeal`         | `merchant:order:appeal`       | JSON `{ tenantId?, merchantId, reasonCode }`                                                                          | 自动获取付款回单、转图片、上传并提交一次平台申诉                         |

每个请求先按登录人解析所属单位，再同时约束商家。平台人员需要提交当前经营的 `tenantId`；
代理商人员只能访问 JWT 所属单位。同步仅获取 `BUY` 订单，完整时间窗口和全部分页成功后才推进检查点。
任一平台请求或详情读取失败时记录失败原因，不推进最后成功时间。

顶部统计中的今日、昨日成功只看与商家订单匹配的 `C2C_BUY` 支付订单 `SUCCESS` 状态，
按支付订单创建日期归属统计日，金额取支付订单付款金额，不依赖平台订单是否已放币或同步完成；
机器人手工支付不计入。今日待付款按商家订单的平台开户日期与待付款/支付处理中状态统计，
若关联支付订单已成功则不再计入待付款。统计可按经营单位、商家、平台订单号和支付方式筛选。

创建支付时，金额、收款人和支付宝账号只从商家订单读取，调用方不能覆盖。系统从商家的启用支付方案中
选择账号和通道，并由通道确定付款模式：支付宝商家转账立即提交，支付宝批量有密等待组批。没有可用
支付方案时返回失败且不创建支付订单。商家订单一旦关联任意状态的支付订单，
再次调用创建接口返回 `409`，必须到支付订单中处理，禁止从商家订单入口重复支付。底层并发创建仍按
所属单位、商家、来源类型和平台订单号保证幂等；若业务金额或执行方式不一致则拒绝。

作废仅允许商家订单仍为 `PENDING_PAYMENT`，且关联支付单为 `PENDING_CONFIG`、`CREATED` 或
`READY`。已加入未提交批次的支付单会从批次中移除并重算汇总；资金请求进入 `SUBMITTING` 后拒绝
普通作废。平台确认补偿仅处理支付状态为 `SUCCESS` 且平台确认状态为 `FAILED` 的订单；平台确认状态 `SUCCESS` 时幂等返回。

申诉支持币安和欧易买币订单，并要求本地订单为 `PENDING_RELEASE`、关联支付单资金状态为 `SUCCESS`、平台确认状态为 `SUCCESS`、平台实时订单状态为 `PAID`。币安原因码来自实时查询；欧易使用固定原因 `1 / 已付款，催促卖家放币`。提交前系统原子占用订单；系统通过支付通道回单能力获取 PDF 并转为 JPG。币安最多上传 5 页并提交，欧易只取第一页，通过 `/v3/c2c/files/?type=reminder` 上传后，将返回的 `data.imgPath` 提交至 `/v3/c2c/appeal/appealUrge`。

回单处理或材料上传前失败会释放占用，允许人工重试；最终提交请求发出后若结果不确定则保留 `PROCESSING`，禁止重复提交，等待人工核对。币安保存平台申诉单号，欧易保存响应 `requestId` 作为申诉追踪号。回单只在请求期间保留于内存，系统不保存图片二进制或临时上传地址。

商家订单保存平台状态快照、收款资料、付款方式 ID 和支付时限。重复同步只更新同一订单；状态变化
追加时间线。V1 的数据库约束拒绝 `SELL` 订单，后台不存在收款确认或放币入口。
