# 支付宝批量到户有密 Mock

该 Mock 用于模拟支付宝批量到户有密代付，固定使用 `BATCH_PAY_V2 + MESSAGE_BATCH_PAY` 和 RSA2、PKCS8 应用私钥模式。

协议实现位于当前目录，测试控制路由位于 `server/api/mock/alipay-batch`，支付宝兼容网关位于 `server/api/alipay/gateway`。

## 获取通道配置

启动 Mock 后请求：

```text
GET http://127.0.0.1:3002/api/mock/alipay-batch/config
```

响应中的 `pfaParams` 可直接作为 `PfaAlipayBatchAdapter` 的通道实例配置，包含 `appId`、`privateKey`、`alipayPublicKey`、网关地址、创建/查单/余额查询方法名、回单申请与查询方法名、`userId` 和 `payeeIdentityType`。

首次运行会在 `.data/alipay-keys.json` 生成应用密钥和支付宝公钥。密钥仅用于本地测试，禁止用于生产环境。

## 模拟行为

- 创建订单默认返回 `DEALING`。
- 回单按支付宝真实流程模拟：`alipay.data.bill.ereceipt.apply` 申请文件，再用 `alipay.data.bill.ereceipt.query` 查询状态；成功时返回短时效 PDF 下载地址。
- 批次明细回单使用 `alipay.fund.batch.detail.query` 返回的 `detail_id` 作为申请接口的 `FUND_DETAIL.key`。
- 默认通过转发应用 `http://127.0.0.1:3100/v1/notify/alipay-batch` 发送回调；创建订单会异步发送一次已签名通知。通知失败不会影响下单响应，结果会记录在订单的 `lastNotifyResult`。
- Mock、转发应用或后端端口变化时，通过 `MOCK_ALIPAY_NOTIFY_URL` 或控制接口覆盖 `notifyUrl`。
- 查单将订单从处理中推进到成功或失败等终态时，也会异步发送一次终态通知。
- 关单仅支持 `INIT` 和 `WAIT_PAY` 批次，成功后批次变为 `DISUSE`、全部明细变为 `FAIL`，并发送一次批次回调。
- 第一次查单默认推进到终态，并按 `randomDetailFailRate=20` 逐笔随机模拟失败；多笔批次至少产生一笔失败，批次状态按明细汇总为 `PART_SUCCESS` 或 `FAIL`。
- 将 `randomDetailFailRate` 设为 `0` 可关闭随机失败并恢复全部成功。
- 只有 `INIT`、`WAIT_PAY`、`DEALING` 会自动推进，成功、失败等终态不会被覆盖。
- 可以通过控制接口设置余额、初始状态、自动推进次数、失败原因和回调地址。
- 回调为 `application/x-www-form-urlencoded`，使用 Mock 生成的支付宝私钥签名。

## 控制接口

| 方法    | 地址                                               | 用途                               |
| ------- | -------------------------------------------------- | ---------------------------------- |
| `GET`   | `/api/mock/alipay-batch/config`                    | 获取通道配置和当前行为配置         |
| `PATCH` | `/api/mock/alipay-batch/config`                    | 修改余额、状态推进和回调地址       |
| `GET`   | `/api/mock/alipay-batch/orders`                    | 查看全部 Mock 订单                 |
| `GET`   | `/api/mock/alipay-batch/orders/:outBatchNo`        | 查看单个 Mock 订单                 |
| `PUT`   | `/api/mock/alipay-batch/orders/:outBatchNo/status` | 手动修改状态和失败原因，可立即通知 |
| `POST`  | `/api/mock/alipay-batch/orders/:outBatchNo/notify` | 手动发送已签名异步通知             |
| `POST`  | `/api/mock/alipay-batch/reset`                     | 清空订单并恢复默认配置             |

支付宝协议也提供固定方法入口，适合手工或不使用 SDK 的测试：

| 方法   | 地址                                   |
| ------ | -------------------------------------- |
| `POST` | `/api/alipay/fund/batch/create`        |
| `POST` | `/api/alipay/fund/batch/detail/query`  |
| `POST` | `/api/alipay/fund/batch/close`         |
| `POST` | `/api/alipay/fund/account/query`       |
| `POST` | `/api/alipay/data/bill/ereceipt/apply` |
| `POST` | `/api/alipay/data/bill/ereceipt/query` |

SDK 推荐使用 `/api/alipay/gateway`，并在表单参数中传递 `method`。

### 修改行为和回调地址

```bash
curl -X PATCH http://127.0.0.1:3002/api/mock/alipay-batch/config \
  -H "Content-Type: application/json" \
  -d '{"availableAmount":"50000.00","autoAdvanceAfterQueries":2,"randomDetailFailRate":20,"notifyUrl":"http://127.0.0.1:3100/v1/notify/alipay-batch"}'
```

### 模拟失败

```bash
curl -X PUT http://127.0.0.1:3002/api/mock/alipay-batch/orders/SYS_ORDER_NO/status \
  -H "Content-Type: application/json" \
  -d '{"batchStatus":"FAIL","errorCode":"PAYEE_ACCOUNT_INVALID","errorMsg":"收款账号不存在"}'
```

### 修改状态并通知

```bash
curl -X PUT http://127.0.0.1:3002/api/mock/alipay-batch/orders/SYS_ORDER_NO/status \
  -H "Content-Type: application/json" \
  -d '{"batchStatus":"SUCCESS","notify":true}'
```

部分成功批次可按 `outBizNo` 分别设置明细状态：

```bash
curl -X PUT http://127.0.0.1:3002/api/mock/alipay-batch/orders/BATCH_NO/status \
  -H "Content-Type: application/json" \
  -d '{"batchStatus":"PART_SUCCESS","details":[{"outBizNo":"ORDER_1","detailStatus":"SUCCESS"},{"outBizNo":"ORDER_2","detailStatus":"FAIL","errorCode":"PAYEE_ACCOUNT_INVALID","errorMsg":"收款账号不存在"}],"notify":true}'
```

## 协议入口

业务适配器通过支付宝 SDK 请求：

```text
POST /api/alipay/gateway
```

请求中的 `method` 决定插件方法：

| `method`                          | 业务             |
| --------------------------------- | ---------------- |
| `alipay.fund.batch.create`        | 创建批次         |
| `alipay.fund.batch.detail.query`  | 查询批次明细     |
| `alipay.fund.batch.close`         | 关闭未支付批次     |
| `alipay.fund.account.query`       | 查询余额         |
| `alipay.data.bill.ereceipt.apply` | 申请电子回单     |
| `alipay.data.bill.ereceipt.query` | 查询电子回单状态 |

创建和查单支持一批多笔明细。`total_count` 必须是正整数字符串并与 `trans_order_list` 数量一致，
`out_biz_no` 在批次内必须唯一，`total_trans_amount` 必须与全部明细金额精确合计一致。查单会返回该批次的完整 `acc_detail_list`。

## 测试

协议和状态测试位于 `test/alipay-batch.test.ts`，覆盖插件分发、请求验签、响应验签、多笔批次创建与查单、金额及笔数校验、部分成功、余额、电子回单和批次回调签名。
