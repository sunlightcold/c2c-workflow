# C2C 支付订单 API

Controller：`PaymentOrderController`。基础路径：`/v1/sys/payment-orders`。所有接口均要求
`Authorization: Bearer <accessToken>`，响应使用 API 总览定义的统一包装体。

## 接口

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/` | `payment:order:read` | Query `{ tenantId?, merchantId?, executionMode?, sourceType?, status?, page?, pageSize? }` | `{ items, total, page, pageSize }` |
| GET | `/{id}` | `payment:order:read` | Query `{ tenantId? }` | 支付订单、状态历史和关联批次明细 |
| POST | `/` | `payment:order:create` | 创建机器人手工支付订单 | `PaymentOrderEntity` |
| POST | `/{id}/rematch` | `payment:order:retry` | `{ tenantId? }` | `PaymentOrderEntity` |
| POST | `/{id}/reconcile` | `payment:order:retry` | `{ tenantId? }` | 支付订单当前状态 |

创建请求：

```json
{
  "tenantId": "00000000-0000-4000-8000-000000000010",
  "merchantId": "00000000-0000-4000-8000-000000000020",
  "sourceBusinessNo": "manual-20260910-001",
  "amount": "100.00",
  "currency": "CNY",
  "paymentMethod": "ALIPAY",
  "executionMode": "BATCH",
  "payeeIdentity": "payee@example.com",
  "payeeName": "收款人"
}
```

`amount` 必须是大于零、最多两位小数的字符串，禁止 JSON 数值。`paymentMethod` 本期只能是
`ALIPAY`，`executionMode` 为 `INSTANT` 或 `BATCH`。

列表默认第 1 页、每页 20 条，`pageSize` 最大 100；按创建时间倒序。`executionMode`、`sourceType` 和 `status` 必须使用系统枚举。组建支付批次时使用 `executionMode=BATCH` 查询批量有密候选订单。详情只在当前所属单位内查找，不存在或跨所属单位均返回 `404`。

## 业务行为

- 系统按所属单位、商家、场景、币种、金额、支付方式和执行方式筛选完整可用的支付方案。
- 只使用最低优先级数值的一组方案，再按权重稳定选择；相同来源业务重复匹配的结果一致。
- 匹配成功时把支付方案、支付账号和账号通道同时锁定到支付订单，状态为 `READY`。
- 没有可用方案时仍创建支付订单，三个路由字段为空，状态为 `PENDING_CONFIG`。
- `POST /{id}/rematch` 只处理 `PENDING_CONFIG`，匹配成功后进入 `READY`。
- `POST /{id}/reconcile` 只处理 `PROCESSING` 或 `UNKNOWN`，使用原支付单号查询支付宝，不重新提交资金请求。
- `tenantId + merchantId + BOT_MANUAL + sourceBusinessNo` 唯一；重复和并发创建返回已有订单。
- 公开创建接口只创建机器人手工支付订单。C2C 买币支付由商家订单流程在重新核对平台订单后创建。
- 退款支付本期未开放。

## C2C 买币提交前复核

C2C 买币支付订单进入实际付款前，系统按所属单位和商家重新装载支付订单、商家订单、商家平台凭据以及锁定的支付方案、支付账号和账号通道。只有以下条件全部成立才允许继续：

- 商家、平台凭据、支付方案、支付账号、账号通道、支付通道和支付平台均处于启用状态，且锁定关系未变化。
- 支付订单使用支付宝即时商家转账通道；批量有密订单不进入单笔即时付款流程。
- 商家订单已由当前支付订单锁定为支付处理中且允许付款，本地保存的金额、币种、收款方式、收款账号、收款人、平台付款方式和明确付款截止时间均有效。
- 系统实时读取交易平台订单详情，平台订单仍为待付款且允许付款，全部付款资料与本地支付订单一致，截止时间未变化且尚未到期。

任一条件不成立时，支付宝资金请求不会发出，支付订单进入明确失败并记录原因。支付宝资金请求已经发出但无法确认结果时才进入 `UNKNOWN`，后续必须使用原支付单号回查。

支付订单被执行器认领时，商家订单先进入支付处理中。复核通过后，系统使用锁定支付账号的内部 Secret 引用创建独立支付宝客户端，以支付订单 `paymentNo` 作为 `out_biz_no` 调用 `alipay.fund.trans.uni.transfer`。支付宝明确返回失败时支付订单进入 `FAILED`，商家订单恢复为待支付；调用超时或响应结果无法确认时进入 `UNKNOWN`，不得生成新业务单号再次付款。回查调用 `alipay.fund.trans.common.query`，并继续使用原 `paymentNo`。只有原单不存在或支付宝返回明确失败终态时，回查才把支付订单置为失败并恢复商家订单；权限、网关或其它无法证明资金结果的错误继续保持结果未知。

支付宝明确成功后，商家订单先进入 `PAID_PENDING_PLATFORM_CONFIRM`。系统重新读取同一币安或欧易订单，复核订单编号、金额、币种、收款资料和平台付款方式未变化，然后使用平台付款方式 ID 调用平台“已付款”接口：币安传数字 `payId`，欧易传原字符串 `receiptAccountId`，不得传支付宝支付账号 ID。欧易执行前必须通过反欺诈检查。平台操作后再次查询订单，只有状态为 `PAID` 或 `COMPLETED` 才把支付订单收口为 `COMPLETED`，并把商家订单分别更新为 `PENDING_RELEASE` 或 `COMPLETED`。

平台确认接口失败或平台暂未显示已付款时，支付订单保持 `PLATFORM_CONFIRM_PENDING`，后续只重试平台确认，不再调用支付宝。若平台订单已经取消、过期或进入争议，支付订单和商家订单均进入资金异常。

## 错误

| HTTP | 场景 |
| --- | --- |
| 400 | DTO 格式错误、金额不是字符串、金额不大于零、商家不可用或不属于当前所属单位 |
| 401 | 未登录或令牌失效 |
| 403 | 缺少动作权限或所属单位范围不匹配 |
| 404 | 支付订单不存在或不属于当前所属单位 |
| 409 | 非待配置订单执行重新匹配、非处理中或结果未知订单执行回查 |
