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

## 商家

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/merchants` | `merchant:account:read` | Query `{ tenantId? }` | `MerchantEntity[]` |
| POST | `/merchants` | `merchant:account:create` | `{ tenantId?, code, name, platform, externalMerchantId? }` | `MerchantEntity` |
| GET | `/merchants/{id}/platform-credentials` | `merchant:account:read` | Query `{ tenantId? }` | 凭据版本元数据数组 |
| POST | `/merchants/{id}/platform-credentials` | `merchant:account:credential` | `{ tenantId?, credentialRef, clientType?, xUserId?, requestTimeoutMs? }` | 新凭据版本元数据 |

`platform` 只能是 `BINANCE` 或 `OKX`，创建后不可修改。代理商用户的 `tenantId` 从 JWT
取得，即使提交其他值也会被拒绝；平台用户必须显式提交当前经营的 `tenantId`。

新增平台凭据会停用该商家的旧版本并创建递增版本。同一商家仅一个版本生效。币安要求
`clientType`；欧易不接受 `clientType` 和 `xUserId`。接口只返回是否已配置和版本元数据，
不返回 `credentialRef` 或 Secret 内容。

## 支付账号、通道和方案

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| POST | `/payment-accounts` | `payment:account:create` | `{ tenantId?, platformId, code, name, externalAccountId, credentialRef }` | `PaymentAccountEntity` |
| POST | `/payment-accounts/{id}/channels` | `payment:account:bind` | `{ tenantId?, channelId, configRef? }` | `PaymentAccountChannelEntity` |
| POST | `/payment-plans` | `payment:account:bind` | `{ tenantId?, merchantId, paymentAccountId, paymentAccountChannelId, scene, currency, priority, weight }` | `MerchantPaymentPlanEntity` |

支付方案中的 `paymentAccountChannelId` 必须属于 `paymentAccountId` 且已启用；商家和支付账号
必须属于同一所属单位。账号只提交 Secret Manager/KMS 的 `credentialRef`，不通过本接口保存明文秘钥。

## 响应与错误

成功：HTTP `200/201`，`data` 为上表实体或实体数组。失败统一为：

| HTTP | 场景 |
| --- | --- |
| 400 | DTO 格式错误、商家平台不支持、账号或通道不可用、支付组合不合法 |
| 401 | 未登录或令牌失效 |
| 403 | 缺少动作权限、所属单位范围不匹配、平台人员未选择经营所属单位 |
| 404 | 路径资源不存在 |
