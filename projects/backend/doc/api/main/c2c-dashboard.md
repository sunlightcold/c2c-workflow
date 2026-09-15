# C2C 经营工作台 API

Controller：`DashboardController`。基础路径：`/v1/sys/dashboard`。接口要求
`Authorization: Bearer <accessToken>`，响应使用 API 总览定义的统一包装体。

## 接口

| Method | Path        | 权限                  | Request                              | data 来源                                      |
| ------ | ----------- | --------------------- | ------------------------------------ | ---------------------------------------------- |
| GET    | `/overview` | `dashboard:workspace` | Query `{ tenantId?, days? }`         | 所属单位经营、支付、平台、批次和商家聚合数据   |

`days` 只能为 `7`、`14` 或 `30`，默认 `14`。平台人员可通过 `tenantId` 选择所属单位；代理商人员使用登录账号绑定的所属单位，服务端忽略客户端传入的其它范围。

示例：

```http
GET /v1/sys/dashboard/overview?tenantId=00000000-0000-4000-8000-000000000001&days=14
```

## 响应数据

```json
{
  "range": {
    "days": 14,
    "dateFrom": "2026-09-02",
    "dateTo": "2026-09-15"
  },
  "generatedAt": "2026-09-15T08:30:00.000Z",
  "summary": {
    "paymentAmount": "1944.15",
    "paymentSuccessAmount": "1600.00",
    "paymentSuccessRate": "82.30",
    "paymentCount": 10,
    "paymentSuccessCount": 8,
    "paymentProcessingCount": 1,
    "paymentExceptionCount": 1,
    "merchantOrderAmount": "2100.00",
    "merchantOrderCount": 12,
    "pendingPaymentCount": 2,
    "pendingReleaseCount": 1,
    "batchCount": 3,
    "batchSuccessCount": 2,
    "batchProcessingCount": 1,
    "batchExceptionCount": 0,
    "activeMerchantCount": 2,
    "automatedMerchantCount": 2,
    "activeBotCount": 1,
    "activeGroupCount": 1
  },
  "dailyTrend": [],
  "paymentStatuses": [],
  "paymentSources": [],
  "platforms": [],
  "merchantRanking": []
}
```

金额字段统一使用两位小数字符串，比例字段使用两位小数字符串；数量字段使用整数。`dailyTrend` 会返回所选时间范围内的每个自然日，缺少业务数据的日期使用零值，便于前端连续绘图。

## 统计口径

- `summary` 汇总支付总额、成功额、成功率、处理中与异常支付订单，以及商家订单、支付批次和运行资源数量。
- `dailyTrend` 按业务日期汇总商家订单、支付订单和支付成功情况。
- `paymentStatuses`、`paymentSources` 分别按支付状态和订单来源聚合数量与金额。
- `platforms` 对比币安和欧易商家订单的金额、已支付、待处理数量。
- `merchantRanking` 按成功支付金额降序返回最多 8 个商家，并给出订单量和成功率。
- 所有业务查询均显式限制服务端解析出的 `tenantId`；不接受 `merchantId`，工作台只提供所属单位级聚合。

## 错误

| HTTP | 场景                                                |
| ---- | --------------------------------------------------- |
| 400  | `tenantId` 不是 UUID，或 `days` 不在允许范围内      |
| 401  | 未登录或令牌失效                                    |
| 403  | 缺少工作台权限，或请求所属单位超出账号可访问范围    |
