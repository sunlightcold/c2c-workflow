# 管理后台 API 文档索引

本目录记录当前后端真实存在的管理端与平台契约。

| 文档 | 覆盖范围 | 主要前缀 |
| --- | --- | --- |
| [system-iam-api.md](system-iam-api.md) | 认证、账号、用户、角色、菜单、参数 | `/v1/auth`、`/v1/sys` |
| [system-ops-api.md](system-ops-api.md) | 日志、在线会话、任务、静态文件、OSS | `/v1/sys`、`/v1/static`、`/v1/oss` |
| [system-ai-api.md](system-ai-api.md) | AI 渠道、模型、功能路由 | `/v1/sys/ai` |
| [client-error-api.md](client-error-api.md) | 客户端错误采集与管理 | `/v1/client-errors`、`/v1/sys/client-errors` |
| [c2c-business-config.md](c2c-business-config.md) | 所属单位、商家、支付账号、通道和方案 | `/v1/sys` |
| [c2c-payment-orders.md](c2c-payment-orders.md) | 支付订单创建与重新匹配 | `/v1/sys/payment-orders` |
| [c2c-payment-batches.md](c2c-payment-batches.md) | 支付批次创建、提交与结果查询 | `/v1/sys/payment-batches` |
| [c2c-merchant-orders.md](c2c-merchant-orders.md) | 买币商家订单、详情与同步 | `/v1/sys/merchant-orders`、`/v1/sys/merchants/*/orders/sync` |

接口文档必须与 Controller、DTO、权限码、响应包装和 contract test 同步。
