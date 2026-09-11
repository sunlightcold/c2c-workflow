# C2C 业务配置 API

Controller：`BusinessController`。基础路径：`/v1/sys`。所有接口均要求
`Authorization: Bearer <accessToken>`，成功与失败响应使用 API 总览定义的统一包装体。

## 所属单位

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/tenants` | `agency:tenant:read` | 无 | `TenantEntity[]` |
| POST | `/tenants` | `agency:tenant:create` | `{ code, name, timezone? }` | `TenantEntity` |
| PATCH | `/tenants/{id}/status` | `agency:tenant:update` | `{ status: active/disabled }` | `TenantEntity` |

`POST /tenants` 只创建代理商所属单位。总部自营由迁移固定创建且不可停用。

## 商家账号

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/merchants` | `merchant:account:read` | Query `{ tenantId?, accountName?, accountCode?, externalMerchantId?, platform?, status?, page?, pageSize? }` | 商家账号分页结果 |
| POST | `/merchants` | `merchant:account:create` | 商家账号配置和平台凭据 | `MerchantEntity` |
| PUT | `/merchants/{id}` | `merchant:account:update` | 可编辑的账号、同步、通知和申诉配置 | `MerchantEntity` |
| PATCH | `/merchants/{id}/status` | `merchant:account:update` | Body `{ status }`，Query `{ tenantId? }` | `MerchantEntity` |
| DELETE | `/merchants/{id}` | `merchant:account:delete` | Query `{ tenantId? }` | 无 |
| POST | `/merchants/{id}/test` | `merchant:account:test` | Query `{ tenantId? }` | 连接测试结果 |
| GET | `/merchants/{id}/platform-credentials` | `merchant:account:read` | Query `{ tenantId? }` | 凭据版本元数据数组 |
| POST | `/merchants/{id}/platform-credentials` | `merchant:account:credential` | 币安 `{ apiKey, secretKey, clientType?, xUserId? }`；欧易 `{ sessionCookie, authorization }` | 新凭据版本元数据 |

`platform` 只能是 `BINANCE` 或 `OKX`，创建后不可修改。创建币安账号时必须提交 API Key 和 Secret Key；创建欧易账号时必须提交 Cookie 和 Authorization。代理商用户的 `tenantId` 从 JWT
取得，即使提交其他值也会被拒绝；平台用户必须显式提交当前经营的 `tenantId`。

账号支持同步页大小、重叠秒数、同步状态范围、请求超时、付款确认间隔、机器人和群组、三类聊天通知、自动申诉与备注。平台凭据在数据库中加密保存；更新凭据会停用旧版本并创建递增版本，同一商家账号仅一个版本生效。列表、详情、日志和接口响应均不返回凭据密文或明文。已有商家订单的账号不能删除，只能停用。

## 支付账号、通道和方案

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/payment-platforms` | `payment:account:read` | 无 | 支付平台及其支付通道目录 |
| GET | `/payment-accounts` | `payment:account:read` | Query `{ tenantId?, accountName?, accountCode?, externalAccountId?, platformId?, status?, page?, pageSize? }` | 当前所属单位的支付账号分页结果及已开通通道 |
| POST | `/payment-accounts` | `payment:account:create` | `{ tenantId?, platformId, code, name, externalAccountId, credentialRef }` | `PaymentAccountEntity` |
| PUT | `/payment-accounts/{id}` | `payment:account:update` | `{ tenantId?, name?, externalAccountId?, credentialRef? }` | 脱敏后的 `PaymentAccountEntity` |
| PATCH | `/payment-accounts/{id}/status` | `payment:account:update` | Query `{ tenantId? }`；Body `{ status }` | 脱敏后的 `PaymentAccountEntity` |
| DELETE | `/payment-accounts/{id}` | `payment:account:delete` | Query `{ tenantId? }` | 无 |
| POST | `/payment-accounts/{id}/channels` | `payment:account:bind` | `{ tenantId?, channelId, configRef?, minimumAmount?, maximumAmount?, concurrencyLimit? }` | 脱敏后的 `PaymentAccountChannelEntity` |
| PUT | `/payment-accounts/{id}/channels/{bindingId}` | `payment:account:bind` | `{ tenantId?, configRef?, minimumAmount?: string\|null, maximumAmount?: string\|null, concurrencyLimit? }` | 脱敏后的 `PaymentAccountChannelEntity` |
| PATCH | `/payment-accounts/{id}/channels/{bindingId}/status` | `payment:account:bind` | Query `{ tenantId? }`；Body `{ status }` | 脱敏后的 `PaymentAccountChannelEntity` |
| DELETE | `/payment-accounts/{id}/channels/{bindingId}` | `payment:account:bind` | Query `{ tenantId? }` | 无 |
| GET | `/payment-plans` | `payment:account:read` | Query `{ tenantId?, merchantId? }` | 当前所属单位的 `MerchantPaymentPlanEntity[]` |
| POST | `/payment-plans` | `payment:account:bind` | `{ tenantId?, merchantId, paymentAccountId, paymentAccountChannelId, scene, currency, priority, weight }` | `MerchantPaymentPlanEntity` |
| PUT | `/payment-plans/{id}` | `payment:account:bind` | `{ tenantId?, paymentAccountId?, paymentAccountChannelId?, priority?, weight? }` | `MerchantPaymentPlanEntity` |
| PATCH | `/payment-plans/{id}/status` | `payment:account:bind` | Query `{ tenantId? }`；Body `{ status }` | `MerchantPaymentPlanEntity` |
| DELETE | `/payment-plans/{id}` | `payment:account:bind` | Query `{ tenantId? }` | 无 |

支付方案中的 `paymentAccountChannelId` 必须属于 `paymentAccountId` 且已启用；商家和支付账号
必须属于同一所属单位。账号只提交 Secret Manager/KMS 的 `credentialRef`，不通过本接口保存明文秘钥；创建响应、后续查询和导出均不返回 `credentialRef` 或 Secret 内容。

支付账号查询按经营单位隔离并返回 `{ items, total, page, pageSize }`。账号编码、支付平台和经营单位创建后不可修改；名称、支付宝商户号和账号凭据引用可覆盖更新。账号凭据和通道配置只允许提交新引用，不回显原值。通道金额使用最多两位小数的非负字符串，最小金额不得大于最大金额，并发上限为 1 至 1000；编辑时金额字段提交 `null` 表示清除该项限制，字段不提交表示保留原值。

支付账号查询返回账号基本信息、`credentialConfigured` 和已开通通道；创建、编辑、查询均不返回账号 `credentialRef` 或通道 `configRef`。支付账号或通道一旦被支付方案、支付订单或支付批次引用，不允许删除或移除，只能停用；停用不影响已锁定支付组合的历史回查。支付方案查询始终按当前所属单位隔离，可再按商家筛选。

支付方案可修改支付账号与通道、使用顺序和分配比例；修改支付路由时必须同时提交支付账号与通道，且两者属于当前经营单位并处于启用状态。重新启用支付方案时会再次校验支付账号和通道。已被支付订单引用的支付方案不能删除，只能停用。

## 响应与错误

成功：HTTP `200/201`，`data` 为上表实体或实体数组。失败统一为：

| HTTP | 场景 |
| --- | --- |
| 400 | DTO 格式错误、商家平台不支持、账号或通道不可用、支付组合不合法 |
| 401 | 未登录或令牌失效 |
| 403 | 缺少动作权限、所属单位范围不匹配、平台人员未选择经营所属单位 |
| 404 | 路径资源不存在 |
| 409 | 支付账号、账号通道或支付方案已被业务引用，不能删除 |
