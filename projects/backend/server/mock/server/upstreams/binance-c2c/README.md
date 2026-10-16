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

## 固定文字聊天

本地开发启动 Mock 和后端后，在后台同步上述 Mock 商家的待付款买单，再进入“商家管理 / 实时聊天”选择对应单位、商家。
已有订单无需重置；新增 Mock 订单后需要先同步到后台。

- 每笔订单固定显示两条买家消息：“你好，请问这笔订单什么时候付款？”、“收款信息已确认，有问题请联系我。”。
- 发送任意文字，Mock 先回显原消息确认发送，再固定回复：“收到，请稍等，我正在核实订单。”。
- 支持签名凭据、HTTP 消息分页、WebSocket 收发；通过 `x-user-id` 和聊天 Token 隔离商家。
- 固定消息 ID 不变，时间使用当前请求时间，适配后台当前进程的消息窗口。自动回复只经 WebSocket 发送，不提供历史回放，不持久化聊天。
- 仅模拟文字，不模拟图片上传/下载、超时或真实平台已读状态。

后端必须以 `NODE_ENV=development` 运行，且该商家网关为 `http://127.0.0.1:13002`（现有本地种子商家已配置）。
只有这组本地配置允许 `ws://127.0.0.1:13002/chat`；生产环境仍只允许原币安 WSS 地址。
不需要新增前端 Mock 开关、菜单、数据库迁移或机器人转发。
