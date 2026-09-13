# 管理后台 API 文档索引

本目录记录当前后端真实存在的管理端与平台契约。

| 文档 | 覆盖范围 | 主要前缀 |
| --- | --- | --- |
| [system-iam-api.md](system-iam-api.md) | 认证、账号、用户、角色、菜单、参数 | `/v1/auth`、`/v1/sys` |
| [system-ops-api.md](system-ops-api.md) | 日志、在线会话、任务、静态文件、OSS | `/v1/sys`、`/v1/static`、`/v1/oss` |
| [c2c-business-config.md](c2c-business-config.md) | 所属单位、商家、支付账号、通道和方案 | `/v1/sys` |
| [c2c-payment-orders.md](c2c-payment-orders.md) | 支付订单查询、创建、重新匹配和结果回查 | `/v1/sys/payment-orders` |
| [c2c-payment-batches.md](c2c-payment-batches.md) | 支付批次查询、创建、提交与结果回查 | `/v1/sys/payment-batches` |
| [c2c-merchant-orders.md](c2c-merchant-orders.md) | 买币商家订单、详情与同步 | `/v1/sys/merchant-orders`、`/v1/sys/merchants/*/orders/sync` |

接口文档必须与 Controller、DTO、权限码、响应包装和 contract test 同步。
