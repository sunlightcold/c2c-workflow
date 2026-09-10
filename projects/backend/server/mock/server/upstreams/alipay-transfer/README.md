# 支付宝商家单笔转账 Mock

该插件模拟 `PfaAlipayAdapter` 已对接的支付宝单笔转账接口：

- `alipay.fund.trans.uni.transfer`
- `alipay.fund.trans.common.query`
- `alipay.fund.account.query` 由公共支付宝余额 Mock 提供

请求使用 RSA2 校验，响应使用 Mock 支付宝私钥签名。下单固定先返回 `DEALING`，压测运行计划再把订单推进为 `SUCCESS`、`FAIL` 或继续保持 `DEALING`。成功和失败通过转发应用的 `/v1/notify/alipay-transfer` 回调支付系统。
单笔回调按 `PfaAlipayAdapter` 协议使用 MD5 签名，Pay 成功处理后按支付宝通知规则返回纯文本小写 `success`。

## 本地链路

```text
支付系统 -> pfa-forwarder:3100/v1/gateway/alipay-transfer
         -> mock:13002/api/alipay/gateway

mock -> pfa-forwarder:3100/v1/notify/alipay-transfer
     -> 支付系统 /v1/api/pfa/notify/PfaAlipayAdapter
```

转发应用本地配置：

```env
ALIPAY_TRANSFER_GATEWAY_TARGET=http://127.0.0.1:13002/api/alipay/gateway
ALIPAY_TRANSFER_NOTIFY_TARGET=http://127.0.0.1:3000/v1/api/pfa/notify/PfaAlipayAdapter
```

获取完整本地通道配置：

```bash
curl http://127.0.0.1:13002/api/mock/alipay-transfer/config
```

返回的 `pfaParams.appKey` 必须原样配置到通道实例，用于本地回调验签。
返回的 `pfaParams.gateway` 默认指向转发应用；`mockGateway` 仅用于绕过转发应用诊断 Mock。需要修改转发器地址时配置 `MOCK_ALIPAY_TRANSFER_FORWARDER_GATEWAY`。
