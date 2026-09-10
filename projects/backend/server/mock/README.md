# 支付与 C2C 上游 Mock

这个项目用于在本地模拟不同支付和 C2C 上游，不包含业务系统自身的下单逻辑。公共运行时负责插件注册和请求分发，各上游协议、签名、状态模型和渠道测试说明放在对应的 `server/upstreams/<upstream>` 目录中。

## 启动

首次运行时在 Mock 项目根目录准备环境文件。Nitro 只自动读取项目根目录的 `.env`，不要放到 `server/.env`：

```bash
cd server/mock
cp .env.example .env
```

在 `pay` 目录执行：

```bash
pnpm install
pnpm dev:mock
```

默认地址为 `http://127.0.0.1:13002`。获取健康状态：

```bash
curl http://127.0.0.1:13002/api/mock/health
```

## 已实现上游

| 上游              | 说明               | 渠道文档                                                                                   |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `alipay-batch`    | 支付宝批量到户有密 | [`server/upstreams/alipay-batch/README.md`](server/upstreams/alipay-batch/README.md)       |
| `alipay-transfer` | 支付宝商家单笔转账 | [`server/upstreams/alipay-transfer/README.md`](server/upstreams/alipay-transfer/README.md) |
| `binance-c2c`     | 币安 C2C 商家订单   | [`server/upstreams/binance-c2c/README.md`](server/upstreams/binance-c2c/README.md)          |
| `okx-c2c`         | OKX C2C 买单       | 本文“OKX C2C”章节                                                                                |

## OKX C2C

Mock 同时提供 OKX 网关和控制接口，可直接驱动系统的轮询、详情核验、自动创建支付订单以及标记付款流程。默认网关为 `http://127.0.0.1:13002`，账号中填写：

```text
API 网关：http://127.0.0.1:13002
Authorization：Bearer mock-okx-authorization
Cookie：token=mock-okx-token; sid=mock-okx-session
```

启动后会自动生成一笔可处理的 BUY/USDT/CNY 订单，订单号 `260905000000001`，收款账户 ID `25990076`，实名为“测试用户”。也可以通过控制接口创建来单：

```bash
curl -X POST http://127.0.0.1:13002/api/mock/okx-c2c/orders \
  -H "Content-Type: application/json" \
  -d '{"publicTradingOrderId":"260905000000002","baseAmount":"10.00","baseCurrency":"usdt","quoteAmount":"70.00","quoteCurrency":"cny","price":"7.00","receiptAccountId":"25990076","accountName":"测试用户","accountNo":"13800138000","payType":"aliPay","payMethodName":"支付宝","kycVerified":true}'
```

可用控制接口：

```text
GET  /api/mock/okx-c2c/config       查看配置
PATCH /api/mock/okx-c2c/config       修改 antiFraudReview 或 markOrderAsPaidFailure
GET  /api/mock/okx-c2c/orders        查看内存订单及状态
POST /api/mock/okx-c2c/reset         恢复默认订单和 headers
```

网关接口与 pay 的 OKX 客户端一致：`GET /v4/c2c/order/getOrderList`、`GET /v3/c2c/orders/{publicOrderId}`、`GET /v4/c2c/risk/antiFraudPopup/info`、`POST /v3/c2c/orders/{publicOrderId}/payment/paid`。所有请求必须原样携带上面的 `Authorization` 和 `Cookie` 请求头。

要验证标记付款，可执行：

```bash
curl -X POST "http://127.0.0.1:13002/v3/c2c/orders/260905000000001/payment/paid?t=1" \
  -H "Authorization: Bearer mock-okx-authorization" \
  -H "Cookie: token=mock-okx-token; sid=mock-okx-session" \
  -H "Content-Type: application/json" \
  -d '{"receiptAccountId":25990076}'
```

成功后订单变为 `orderStatus=completed`、`orderProcessStatus=4`、`paymentStatus=confirmed`。将 `antiFraudReview` 设为 `true` 时，风控接口会返回 `shouldShowPopup=true` 和 `isShowPopup=true`，pay 应停止自动付款并进入人工复核；将 `markOrderAsPaidFailure` 设为 `true` 可模拟确认付款失败。

## 目录结构

```text
server/
  core/                         通用插件契约、注册表、内存仓储和运行时
  upstreams/<upstream>/         单个上游的协议实现和专属文档
  api/<upstream>/               上游兼容网关（协议需要独立路由时使用）
  api/mock/<upstream>/          测试控制接口
test/                           协议与状态流测试
```

新增上游时，在 `server/upstreams/<upstream>` 实现 `UpstreamMockPlugin`，然后在 `server/core/runtime.ts` 注册。协议处理、签名、状态模型、测试说明和控制参数说明必须留在该上游目录；公共网关不写渠道业务判断。

## 验证

```bash
pnpm run test:mock
pnpm run typecheck:mock
pnpm run build:mock
```
