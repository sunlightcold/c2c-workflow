# Binance C2C 商家订单 Mock

模拟以下 Binance C2C 接口，供 `BinanceC2cClient` 本地联调：

- `POST /sapi/v1/c2c/orderMatch/listOrders`
- `GET /sapi/v1/c2c/orderMatch/listUserOrderHistory`（订单历史/日报）
- `POST /sapi/v1/c2c/orderMatch/getUserOrderDetail`
- `POST /sapi/v1/c2c/orderMatch/markOrderAsPaid`
- `POST /sapi/v1/c2c/complaint/get-complaint-reasons`
- `GET /sapi/v1/c2c/file-upload/get-s3-presigned-url`
- `POST /sapi/v1/c2c/complaint/submit-complaint`

申诉上传地址会指向 mock 自己的 `PUT /api/mock/binance-c2c/complaint-upload`，不会访问真实 S3。

网关地址直接配置为 `http://127.0.0.1:13002`。Mock 会校验 `X-MBX-APIKEY`、`clientType`、`timestamp`、`recvWindow` 和 HMAC-SHA256 `signature`。默认配置来自项目根目录 `.env`：

```dotenv
MOCK_BINANCE_API_KEY=mock-binance-api-key
MOCK_BINANCE_SECRET_KEY=mock-binance-secret-key
MOCK_BINANCE_CLIENT_TYPE=WEB
```

添加测试订单：

```bash
curl -X POST http://127.0.0.1:13002/api/mock/binance-c2c/orders \
  -H 'content-type: application/json' \
  -d '{"externalMerchantId":"mock-hq-binance","orderNumber":"22924521759466590208","totalPrice":"133.00","amount":"0.0019","realName":"杨圳","paymentMethod":{"id":"1","identifier":"BANK","tradeMethodName":"银行卡","payAccount":"13822079784","fieldList":[{"fieldName":"account_name","fieldValue":"杨圳"}]}}'
```

`externalMerchantId` 是 Mock 内部归属键。业务端凭证通过 `x-user-id` 传入商家账号编号；列表、详情、
标记付款和申诉接口只允许访问同一账号的订单。

订单可通过 `complaintReasons` 自定义上游返回的申诉原因。例如：

```json
{
  "orderNumber": "MOCK_C2C_PAID_NO4",
  "orderStatus": 2,
  "totalPrice": "260.50",
  "amount": "0.00365000",
  "createTime": "2026-08-29T13:40:00+08:00",
  "complaintReasons": [
    { "reasonCode": 6, "reasonDesc": "卖家收款后未放行" },
    { "reasonCode": 8, "reasonDesc": "订单状态异常" }
  ]
}
```

查看和重置：

```bash
curl http://127.0.0.1:13002/api/mock/binance-c2c/orders
curl -X POST http://127.0.0.1:13002/api/mock/binance-c2c/reset

# 模拟标记付款失败；恢复时改为 false
curl -X PATCH http://127.0.0.1:13002/api/mock/binance-c2c/config \
  -H 'Content-Type: application/json' \
  -d '{"markOrderAsPaidFailure":true}'
```

详情响应中的 `selectedPayId` 会匹配 `payMethods`，实名和 KYC 字段与正式接口结构一致，便于测试核验通过、KYC 失败、姓名不一致和收款账号变化等场景。
