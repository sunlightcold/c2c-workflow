# C2C 业务配置 API

Controller：`BusinessController`。基础路径：`/v1/sys`。所有接口均要求
`Authorization: Bearer <accessToken>`，成功与失败响应使用 API 总览定义的统一包装体。

## 所属单位

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/tenants` | `agency:tenant:read` | 无 | `TenantEntity[]` |
| POST | `/tenants` | `agency:tenant:create` | `{ name, timezone? }` | `TenantEntity` |
| PATCH | `/tenants/{id}/status` | `agency:tenant:update` | `{ status: active/disabled }` | `TenantEntity` |

`POST /tenants` 只创建代理商所属单位。总部自营由迁移固定创建且不可停用。

## 商家账号

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/merchants` | `merchant:account:read` | Query `{ tenantId?, accountName?, accountCode?, externalMerchantId?, platform?, status?, page?, pageSize? }` | 商家账号分页结果 |
| POST | `/merchants` | `merchant:account:create` | 商家账号配置和平台凭据 | `MerchantEntity` |
| PUT | `/merchants/{id}` | `merchant:account:update` | 可编辑的账号、同步、通知和申诉配置；通过 `telegramGroupId` 绑定群组 | `MerchantEntity` |
| PATCH | `/merchants/{id}/status` | `merchant:account:update` | Body `{ status }`，Query `{ tenantId? }` | `MerchantEntity` |
| DELETE | `/merchants/{id}` | `merchant:account:delete` | Query `{ tenantId? }` | 无 |
| POST | `/merchants/{id}/test` | `merchant:account:test` | Query `{ tenantId? }` | 连接测试结果 |
| GET | `/merchants/{id}/platform-credentials` | `merchant:account:read` | Query `{ tenantId? }` | 凭据版本元数据数组 |
| POST | `/merchants/{id}/platform-credentials` | `merchant:account:credential` | 币安 `{ apiKey, secretKey, clientType?, xUserId? }`；欧易 `{ sessionCookie, authorization, signaturePrivateKey, skipPaymentProofUpload? }` | 新凭据版本元数据 |

`platform` 只能是 `BINANCE` 或 `OKX`，创建后不可修改。创建币安账号时必须提交 API Key 和 Secret Key；创建欧易账号时必须提交 Cookie、Authorization 和 PKCS#8 DER Base64 编码的 EC 签名私钥。`skipPaymentProofUpload` 默认为 `true`；设置为 `false` 时，自动付款必须提供欧易付款凭证图片。代理商用户的 `tenantId` 从 JWT
取得，即使提交其他值也会被拒绝；平台用户必须显式提交当前经营的 `tenantId`。

账号支持同步页大小、重叠秒数、同步状态范围、请求超时、付款确认间隔、机器人群组、三类聊天通知、自动申诉与备注。机器人群组只能从当前经营单位、当前商家账号已完成绑定且处于启用状态的 C2C 支付群组中选择；服务端根据 `telegramGroupId` 写入对应机器人编码和 Telegram Chat ID，客户端不得直接提交这两个内部字段，提交 `null` 表示解除绑定。新建商家账号时三类聊天消息使用系统默认文案，旧数据消息为空时查询也返回同一套默认文案。平台凭据在数据库中加密保存；更新凭据会停用旧版本并创建递增版本，同一商家账号仅一个版本生效。列表、详情、日志和接口响应均不返回凭据密文或明文。已有商家订单的账号不能删除，只能停用。

Telegram 通知按事件开关投递，并使用 HTML 格式。符合自动付款条件的新商家订单直接进入支付流程，不因收款人姓名与平台实名不一致而拦截或要求二次确认；订单详情和自动创建通知仍展示两项姓名及实名核验结果。同步订单无法创建支付订单时，向绑定商家群发送订单号和失败原因，每个订单只登记并发送一次，不因后续任务扫描重复尝试或重复通知。单笔支付仅在 `COMPLETED`、`FAILED`、`CANCELLED` 或 `FUND_EXCEPTION` 等终态发送，`SUBMITTING`、`PROCESSING`、`UNKNOWN` 和平台确认等待态静默。批量支付不发送批次子单的单笔结果，也不发送提交中/处理中的批次状态，只在成功、部分成功、失败、取消或异常终态发送一条汇总，并附失败明细；成功的单笔支付通知提供“获取回单”按钮。

Telegram 群组成员和超级管理员通过 Telegram User ID 识别，属于所属单位下独立的 Telegram 身份，不绑定 `sys_user`，也不提供后台用户候选接口。机器人最终鉴权只检查 Telegram 身份记录、机器人、群组、商家和能力交集；审计使用 Telegram User ID、用户名、群组 ID 和所属单位记录操作来源。

## 支付账号、通道和方案

| Method | Path | 权限 | Request | data 来源 |
| --- | --- | --- | --- | --- |
| GET | `/payment-platforms` | `payment:account:read` | 无 | 支付平台及其支付通道目录 |
| GET | `/payment-accounts` | `payment:account:read` | Query `{ tenantId?, accountName?, accountCode?, externalAccountId?, platformId?, status?, page?, pageSize? }` | 当前所属单位的支付账号分页结果及已开通通道 |
| POST | `/payment-accounts` | `payment:account:create` | `{ tenantId?, platformId, name, externalAccountId, credential }` | 脱敏后的支付账号 |
| PUT | `/payment-accounts/{id}` | `payment:account:update` | `{ tenantId?, name?, externalAccountId? }` | 脱敏后的支付账号 |
| PUT | `/payment-accounts/{id}/credential` | `payment:account:update` | 唯一的完整支付宝凭据 | 脱敏后的支付账号 |
| PATCH | `/payment-accounts/{id}/status` | `payment:account:update` | Query `{ tenantId? }`；Body `{ status }` | 脱敏后的 `PaymentAccountEntity` |
| DELETE | `/payment-accounts/{id}` | `payment:account:delete` | Query `{ tenantId? }` | 无 |
| POST | `/payment-accounts/{id}/channels` | `payment:account:bind` | `{ tenantId?, channelId, minimumAmount?, maximumAmount? }` | 支付账号通道 |
| PUT | `/payment-accounts/{id}/channels/{bindingId}` | `payment:account:bind` | `{ tenantId?, minimumAmount?: string\|null, maximumAmount?: string\|null }` | 支付账号通道 |
| PATCH | `/payment-accounts/{id}/channels/{bindingId}/status` | `payment:account:bind` | Query `{ tenantId? }`；Body `{ status }` | 脱敏后的 `PaymentAccountChannelEntity` |
| DELETE | `/payment-accounts/{id}/channels/{bindingId}` | `payment:account:bind` | Query `{ tenantId? }` | 无 |
| GET | `/payment-plans` | `payment:account:read` | Query `{ tenantId?, merchantId? }` | 当前所属单位的 `MerchantPaymentPlanEntity[]` |
| POST | `/payment-plans` | `payment:account:bind` | `{ tenantId?, merchantId, paymentAccountId, paymentAccountChannelId, batchPolicyId?, automaticPaymentEnabled?, scene, currency, priority, weight }` | `MerchantPaymentPlanEntity` |
| PUT | `/payment-plans/{id}` | `payment:account:bind` | `{ tenantId?, paymentAccountId?, paymentAccountChannelId?, batchPolicyId?, automaticPaymentEnabled?, priority?, weight? }` | `MerchantPaymentPlanEntity` |
| PATCH | `/payment-plans/{id}/status` | `payment:account:bind` | Query `{ tenantId? }`；Body `{ status }` | `MerchantPaymentPlanEntity` |
| DELETE | `/payment-plans/{id}` | `payment:account:bind` | Query `{ tenantId? }` | 无 |

支付方案中的 `paymentAccountChannelId` 必须属于 `paymentAccountId` 且已启用；商家和支付账号
必须属于同一所属单位。开启 `automaticPaymentEnabled` 的方案可被自动付款任务选择；关闭时仍可由操作员
从商家订单发起支付。同一商家的自动付款方案必须使用相同付款模式，付款模式由方案绑定的支付通道决定。
一个支付账号有且只有一套当前凭据，不存在多套凭据、凭据列表或通道级凭据。创建账号时必须同时提交完整凭据；后续更新通过 `/credential` 接口整套覆盖，不能局部合并。凭据中的 `gateway` 为完整的 HTTP/HTTPS API 网关地址，支持支付宝官方地址、自定义代理网关和本地 Mock，不限制固定域名。

支付宝凭据支持两种模式：`KEY` 提交应用 ID、应用私钥、支付宝公钥和 API 网关地址；`CERT` 提交应用 ID、应用私钥、应用公钥证书、支付宝公钥证书、支付宝根证书和 API 网关地址。前端读取用户选择的本地密钥或证书文件内容后提交；服务端使用凭据主密钥加密保存。任何创建、更新、查询、导出、日志和错误响应均不返回私钥、公钥、证书内容或内部密文。

支付账号查询按经营单位隔离并返回 `{ items, total, page, pageSize }`。账号编码、支付平台和经营单位创建后不可修改；名称和支付宝商户号可编辑，唯一凭据可整套覆盖。支付通道只维护能力开通状态和单笔金额范围，共用所属支付账号的唯一凭据。通道金额使用最多两位小数的非负字符串，最小金额不得大于最大金额；编辑时金额字段提交 `null` 表示清除该项限制，字段不提交表示保留原值。

支付账号查询返回账号基本信息、凭据模式、应用 ID、网关、凭据更新时间、`credentialConfigured` 和已开通通道；创建、编辑、查询均不返回账号内部凭据密文。支付账号或通道一旦被支付方案、支付订单或支付批次引用，不允许删除或移除，只能停用；停用不影响已锁定支付组合的历史回查。支付方案查询始终按当前所属单位隔离，可再按商家筛选。

内部业务编号全部由服务端生成，客户端不得提交：代理商 `AGT`、商家账号 `MCH`、支付账号 `PAC`、Telegram 机器人 `BOT`、支付订单 `PAY`、支付批次 `BAT`。编号格式为三位前缀、十四位业务时间和六位随机数字。平台商家编号、支付宝商户号、Telegram User ID 和外部商户订单号属于外部业务标识，仍由业务方提交。

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
