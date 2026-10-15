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

从仓库根目录重置 Binance Mock 并生成指定数量的待付款订单：

```powershell
.\scripts\Reset-BinanceMockOrders.ps1             # 默认 5 笔
.\scripts\Reset-BinanceMockOrders.ps1 -Count 20   # 指定 20 笔
.\scripts\Reset-BinanceMockOrders.ps1 -Count 0    # 只清空
.\scripts\Reset-BinanceMockOrders.ps1 -Count 5 -ExternalMerchantId mock-agent-binance
```

每次执行都会先清空 Binance Mock 的旧内存订单，再创建全新的 BUY/USDT/CNY、支付宝、实名/KYC
一致的待付款订单。默认归属于总部币安商家账号 `mock-hq-binance`；Mock 根据请求的 `x-user-id`
隔离商家账号。脚本只操作本地 Mock 控制接口，不调用真实币安接口。

## 已实现上游

| 上游              | 说明                | 渠道文档                                                                                   |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `alipay-batch`    | 支付宝批量到户有密  | [`server/upstreams/alipay-batch/README.md`](server/upstreams/alipay-batch/README.md)       |
| `alipay-transfer` | 支付宝商家单笔转账  | [`server/upstreams/alipay-transfer/README.md`](server/upstreams/alipay-transfer/README.md) |
| `binance-c2c`     | 币安 C2C 订单与广告 | [`server/upstreams/binance-c2c/README.md`](server/upstreams/binance-c2c/README.md)         |
| `okx-c2c`         | OKX C2C 买单与广告  | 本文“OKX C2C”章节                                                                          |

## 买 USDT 广告测试

启动 Mock 后自动准备以下广告，对应 `seed-local-workflow.ts` 创建的现有商家账号。无需添加新商家或广告能力配置。

| 商家账号                                   | 广告                       |
| ------------------------------------------ | -------------------------- |
| 总部币安自动付款商家（`mock-hq-binance`）  | 1 张在线买单、1 张离线买单 |
| 总部欧易批次付款商家（`mock-hq-okx`）      | 1 张在线买单、1 张离线买单 |
| 代理商币安测试商家（`mock-agent-binance`） | 1 张在线买单               |

两平台使用同一套行情样例：同行 A/B/C 的买价为 `7.08/7.09/7.12`，参考卖家 A/B/C 的卖价为
`7.20/7.21/7.22`。广告均为 USDT/CNY，支持 `BANK`、`ALIPAY`，单笔范围 `100–50000` 元。
在线自有买单初始价为 `7.05`（代理商为 `7.03`），离线买单为 `7.00`。币安通过 `x-user-id`
区分总部和代理商的自有广告；公共行情可以看到其他商家的在线广告。

在后台打开“广告列表”→“同步广告”，选择对应经营单位和商家。同步后可保存策略、试算、立即调价、
开启/暂停自动调价，并在调价记录中查看结果。测试用参考条件：

- 自有广告由系统按平台广告号自动排除，无需填写昵称。价格单位和加价步长都填 `0.01`，同行金额填 `1000`，支付方式用 `BANK`。
- 普通跟价：买价上限 `7.14` → 跟随同行 C，目标价 `7.13`。
- 动态跟价：参考卖价第 1 位、每 USDT 预留价差 `0.08`、手续费率 `0` → 上限 `7.12`，跳过同行 C，跟随同行 B，目标价 `7.10`。
- 离线广告试算/执行应被阻断，不会因调价重新上架。

Mock 实现了币安的广告列表、详情、行情搜索和价格更新，以及欧易的自有广告列表、行情搜索和广告修改。
价格更新会写入内存，后续详情/列表返回更新后的价格，供后端回查确认；试算不更新价格。

广告测试控制接口：

```text
GET    /api/mock/binance-c2c/ads  查看币安全部广告（含市场行情）
POST   /api/mock/binance-c2c/ads  添加自定义广告
DELETE /api/mock/binance-c2c/ads  清空币安广告，供隔离测试使用
GET    /api/mock/okx-c2c/ads      查看欧易全部广告（含市场行情）
POST   /api/mock/okx-c2c/ads      添加自定义广告
DELETE /api/mock/okx-c2c/ads      清空欧易广告，供隔离测试使用
POST   /api/mock/c2c-ads/reset   仅恢复两平台默认广告和行情，保留订单及凭据配置
```

测试完可执行下面命令恢复初始价格，再在后台同步广告。Mock 重启或单平台 `/reset` 也会恢复默认广告；
单平台 `/reset` 还会重置该平台的订单及凭据配置。广告样例不会替后台保存策略或开启自动调价。

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:13002/api/mock/c2c-ads/reset
```

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
