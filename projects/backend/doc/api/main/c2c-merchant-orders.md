# C2C 商家订单 API

Controller：`C2cOrderController`。基础路径：`/v1/sys`。所有接口均要求登录并使用统一响应包装。

| Method | Path                                 | 权限                          | Request                                                                                                              | data                                       |
| ------ | ------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| GET    | `/merchant-orders`                   | `merchant:order:read`         | Query `{ tenantId?, merchantId, platformOrderId?, status?, paymentMethod?, startTime?, endTime?, page?, pageSize? }` | 分页买币订单及关联支付单摘要               |
| GET    | `/merchant-orders/{id}`              | `merchant:order:read`         | Query `{ tenantId?, merchantId }`                                                                                    | 订单详情与状态时间线                       |
| POST   | `/merchants/{id}/orders/sync`        | `merchant:order:sync`         | Query `{ tenantId? }`                                                                                                | `{ scanned, created, updated }`            |
| POST   | `/merchant-orders/{id}/payment`      | `merchant:order:pay`          | Body `{ tenantId?, merchantId, executionMode }`                                                                      | 从商家订单创建支付并锁定支付账号与通道     |
| POST   | `/merchant-orders/{id}/confirm-paid` | `merchant:order:confirm_paid` | Body `{ tenantId?, merchantId }`                                                                                     | 重试平台付款确认，不重复发起支付宝付款     |
| POST   | `/merchant-orders/{id}/cancel`       | `merchant:order:cancel`       | Body `{ tenantId?, merchantId, reason }`                                                                             | 原子作废尚未提交资金请求的商家订单与支付单 |
| GET    | `/merchant-orders/{id}/appeal-reasons` | `merchant:order:appeal`     | Query `{ tenantId?, merchantId }`                                                                                    | 查询币安实时申诉原因                       |
| POST   | `/merchant-orders/{id}/appeal`       | `merchant:order:appeal`       | Multipart `{ tenantId?, merchantId, reasonCode, description, receipt }`                                              | 上传付款回单并提交一次币安申诉             |

每个请求先按登录人解析所属单位，再同时约束商家。平台人员需要提交当前经营的 `tenantId`；
代理商人员只能访问 JWT 所属单位。同步仅获取 `BUY` 订单，完整时间窗口和全部分页成功后才推进检查点。
任一平台请求或详情读取失败时记录失败原因，不推进最后成功时间。

创建支付时，金额、收款人和支付宝账号只从商家订单读取，调用方不能覆盖。`INSTANT` 使用支付宝商家
转账并立即提交，`BATCH` 使用支付宝批量有密并等待组批。商家订单一旦关联任意状态的支付订单，
再次调用创建接口返回 `409`，必须到支付订单中处理，禁止从商家订单入口重复支付。底层并发创建仍按
所属单位、商家、来源类型和平台订单号保证幂等；若业务金额或执行方式不一致则拒绝。

作废仅允许商家订单仍为 `PENDING_PAYMENT`，且关联支付单为 `PENDING_CONFIG`、`CREATED` 或
`READY`。已加入未提交批次的支付单会从批次中移除并重算汇总；资金请求进入 `SUBMITTING` 后拒绝
普通作废。平台确认补偿仅处理 `PLATFORM_CONFIRM_PENDING`，`COMPLETED` 幂等返回。

申诉仅支持币安买币订单，并要求本地订单为 `PENDING_RELEASE`、关联支付单为 `COMPLETED`、币安实时
订单状态为 `PAID`。原因码必须来自本次实时查询。提交前系统原子占用订单；回单上传前失败会释放占用，
允许人工重试；最终提交请求发出后若结果不确定则保留 `PROCESSING`，禁止重复提交，等待人工核对。
回单只在请求期间保留于内存并上传至币安预签名地址，系统不保存图片二进制或预签名地址。欧易当前
明确不支持申诉接口。

商家订单保存平台状态快照、收款资料、付款方式 ID 和支付时限。重复同步只更新同一订单；状态变化
追加时间线。V1 的数据库约束拒绝 `SELL` 订单，后台不存在收款确认或放币入口。
