# C2C 支付批次 API

Controller：`PaymentBatchController`。基础路径：`/v1/sys/payment-batches`。所有接口均要求
`Authorization: Bearer <accessToken>`，响应使用 API 总览定义的统一包装体。

## 查询批次

- `GET /v1/sys/payment-batches`，权限：`payment:batch:read`。Query 支持 `tenantId?`、`merchantId?`、`paymentAccountId?`、`status?`、`page?`、`pageSize?`，返回 `{ items, total, page, pageSize }`。
- `GET /v1/sys/payment-batches/{id}`，权限：`payment:batch:read`。Query 支持 `tenantId?`，返回 `{ batch, items }`。
- `POST /v1/sys/payment-batches/{id}/upstream-query`，权限：`payment:batch:read`。Body 支持 `{ tenantId? }`，返回本地批次、上游标准化状态、流水号和原始响应；活动批次会同步逐笔结果。
- 列表默认第 1 页、每页 20 条，`pageSize` 最大 100，按创建时间倒序。详情不存在或跨所属单位均返回 `404`。

## 创建批次

`POST /v1/sys/payment-batches`，权限：`payment:batch:create`。

```json
{
  "tenantId": "00000000-0000-4000-8000-000000000010",
  "paymentOrderIds": [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102"
  ]
}
```

- 每次包含 1 至 500 笔互不重复的支付订单。
- 只允许选择状态为待提交、执行方式为批量、支付方式为支付宝、币种为 CNY 的订单。
- 同一批次的所属单位、商家、支付账号、账号通道和币种必须完全一致。
- 支付账号必须仍启用支付宝批量有密通道，固定使用 `BATCH_PAY_V2 + MESSAGE_BATCH_PAY`。
- 创建时写入批次总笔数、总金额和明细快照，状态为 `READY`。
- 一笔支付订单同一时刻只能属于一个活动批次；重复组批返回 `409`。
- 创建批次不向支付宝提交资金请求。

## 提交批次

`POST /v1/sys/payment-batches/{id}/submit`，权限：`payment:batch:submit`。

- 只允许提交 `READY` 批次。
- 提交前，C2C 买币明细逐笔实时核对币安或欧易订单状态、金额、收款资料、平台付款方式和付款截止时间。
- 系统在一个数据库事务内将批次、全部明细和全部支付订单锁定为提交中；C2C 商家订单同时进入支付处理中。
- 使用批次 `batchNo` 作为支付宝 `out_batch_no`，支付订单 `paymentNo` 作为逐笔 `out_biz_no`。
- 支付宝明确拒绝时整批失败；请求超时或结果无法确认时整批进入 `UNKNOWN`，不得重新提交。
- 支付宝受理后立即使用原批次号查询逐笔结果。
- 支付账号、账号通道、支付通道、支付平台或支付方案停用后，不允许新的 `READY` 批次提交；已经提交的批次仍使用原凭据回查并收口，不能因配置停用遗留资金结果。

## 回查批次

`POST /v1/sys/payment-batches/{id}/reconcile`，权限：`payment:batch:retry`。

- 只允许回查 `PROCESSING` 或 `UNKNOWN` 批次。
- 固定调用 `alipay.fund.batch.detail.query`，使用原 `batchNo`，分页获取全部明细。
- 逐笔结果按支付宝 `out_biz_no` 与支付订单 `paymentNo` 精确对应，并再次校验金额。
- 未知明细、重复明细、金额不一致或成功批次缺少明细时，批次保持结果未知，支付订单结果不变。
- 成功明细记录支付宝流水号；机器人手工支付直接完成，C2C 买币支付继续执行交易平台“已付款”确认。
- C2C 买币明细已经支付成功但交易平台确认尚未完成时，后续批次回查仍会重新触发平台确认，不会再次发起支付宝支付。
- 批次提交成功后不会立即回查。支付通道 Adapter 以代码定义首次延迟、回查间隔和最大次数；支付宝批量有密当前为首次延迟 10 秒、间隔 5 秒、最多 12 次。
- 系统固定每 15 秒扫描一次到期批次，只有 `nextReconcileAt` 已到期的批次才会自动回查。15 秒任务是调度心跳，不覆盖通道策略。
- 人工“上游查询”不受自动调度到期时间限制，可立即查询当前上游状态。
- 明确失败明细恢复对应 C2C 商家订单为待支付；处理中和未知明细禁止再次付款。
- 全部明细终结后才可汇总为全部成功、部分成功或全部失败。

## 错误

| HTTP | 场景                                                          |
| ---- | ------------------------------------------------------------- |
| 400  | ID 格式错误、笔数超限、订单不属于当前所属单位、隔离维度不一致 |
| 401  | 未登录或令牌失效                                              |
| 403  | 缺少创建批次权限或所属单位范围不匹配                          |
| 404  | 支付批次不存在或不属于当前所属单位                            |
| 409  | 订单或批次状态已变化、锁定配置已失效、订单已加入其它活动批次  |
