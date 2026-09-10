# C2C 支付订单 API

Controller：`PaymentOrderController`。基础路径：`/v1/sys/payment-orders`。所有接口均要求
`Authorization: Bearer <accessToken>`，响应使用 API 总览定义的统一包装体。

## 接口

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| POST | `/` | `payment:order:create` | 创建机器人手工支付订单 | `PaymentOrderEntity` |
| POST | `/{id}/rematch` | `payment:order:retry` | `{ tenantId? }` | `PaymentOrderEntity` |

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

## 业务行为

- 系统按所属单位、商家、场景、币种、金额、支付方式和执行方式筛选完整可用的支付方案。
- 只使用最低优先级数值的一组方案，再按权重稳定选择；相同来源业务重复匹配的结果一致。
- 匹配成功时把支付方案、支付账号和账号通道同时锁定到支付订单，状态为 `READY`。
- 没有可用方案时仍创建支付订单，三个路由字段为空，状态为 `PENDING_CONFIG`。
- `POST /{id}/rematch` 只处理 `PENDING_CONFIG`，匹配成功后进入 `READY`。
- `tenantId + merchantId + BOT_MANUAL + sourceBusinessNo` 唯一；重复和并发创建返回已有订单。
- 公开创建接口只创建机器人手工支付订单。C2C 买币支付由商家订单流程在重新核对平台订单后创建。
- 退款支付本期未开放。

## 错误

| HTTP | 场景 |
| --- | --- |
| 400 | DTO 格式错误、金额不是字符串、金额不大于零、商家不可用或不属于当前所属单位 |
| 401 | 未登录或令牌失效 |
| 403 | 缺少动作权限或所属单位范围不匹配 |
| 409 | 非待配置订单执行重新匹配 |
