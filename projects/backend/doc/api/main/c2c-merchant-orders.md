# C2C 商家订单 API

Controller：`C2cOrderController`。基础路径：`/v1/sys`。所有接口均要求登录并使用统一响应包装。

| Method | Path | 权限 | Request | data |
| --- | --- | --- | --- | --- |
| GET | `/merchant-orders` | `merchant:order:read` | Query `{ tenantId?, merchantId, status?, page?, pageSize? }` | 分页买币订单 |
| GET | `/merchant-orders/{id}` | `merchant:order:read` | Query `{ tenantId?, merchantId }` | 订单详情与状态时间线 |
| POST | `/merchants/{id}/orders/sync` | `merchant:order:sync` | Query `{ tenantId? }` | `{ scanned, created, updated }` |

每个请求先按登录人解析所属单位，再同时约束商家。平台人员需要提交当前经营的 `tenantId`；
代理商人员只能访问 JWT 所属单位。同步仅获取 `BUY` 订单，完整时间窗口和全部分页成功后才推进检查点。
任一平台请求或详情读取失败时记录失败原因，不推进最后成功时间。

商家订单保存平台状态快照、收款资料、付款方式 ID 和支付时限。重复同步只更新同一订单；状态变化
追加时间线。V1 的数据库约束拒绝 `SELL` 订单，后台不存在收款确认或放币入口。
