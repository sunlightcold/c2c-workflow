# 买 USDT 广告与统一调价 API

本契约对应 `C2cAdController`、`AdRuleDto`、`C2cAdService` 与 `AdPricingRunner`。
两个平台共用规则、计算器和执行流程；平台接入层只转换查询、签名、广告字段和改价协议。
接口当前未声明独立响应 DTO，以下字段来自实体及 service 的展示字段，不代表已完成生产平台实盘验收。

## 通用约定

- 基础路径为 `/v1/sys`。所有接口要求 `Authorization: Bearer <accessToken>`，并校验各接口的动作权限。
- `tenantId` 是 UUID。代理商人员使用 JWT 的所属单位；传入其他所属单位返回 `403`。平台人员必须显式选择 `tenantId`。
- 单广告、单记录及广告操作必须携带 `merchantId`，并按 `tenantId + merchantId + id` 定位资源。广告 ID、记录 ID 是内部 UUID，`platformAdId` 是平台外部字符串标识。
- JSON 写入使用 `Content-Type: application/json`。金额、价格、价差和费率使用十进制字符串；不得传 JSON number。时间使用 ISO 8601 字符串，可空时间返回 `null`。
- 默认分页 `{ page: 1, pageSize: 20 }`；`page >= 1`，`1 <= pageSize <= 100`。未声明的 DTO 字段由全局白名单移除。
- 没有接口专用限流装饰器，沿用部署配置的全局 `throttlerTTL/throttlerLimit`；超过限制返回 `429`。

## 公共响应与数据结构

### 广告商家选项

`GET /v1/sys/merchant-ad-options/merchants?tenantId=<UUID>` 返回当前经营单位的
`{ id, name, platform }[]`，供广告列表、调价记录筛选及同步广告使用。
具有 `merchant:ad:read`、`merchant:ad:sync`、`merchant:ad:rule` 或
`merchant:adRun:read` 任一权限即可调用，无需 `merchant:account:read`。
接口仍使用通用所属单位范围校验；跨所属单位请求返回 `403`，未授权返回 `403`，
无效 UUID 返回 `400`。结果不包含商家配置或平台凭据。

### 成功包装

GET、PUT 成功 HTTP 状态为 `200`；POST 为 `201`。两者的 JSON `code` 都为 `200`。
各 Operation 引用本节的完整包装，`data` 按所列结构替换：

```json
{
  "code": 200,
  "data": {},
  "msg": "success",
  "timestamp": "2026-10-15T04:00:00.000Z"
}
```

分页成功包装如下，`items` 根据接口分别为 `AdView[]` 或 `AdRunView[]`：

```json
{
  "code": 200,
  "data": { "items": [], "total": 0, "page": 1, "pageSize": 20 },
  "msg": "success",
  "timestamp": "2026-10-15T04:00:00.000Z"
}
```

### 错误包装

各接口列出的 `400/401/403/404/409/429` 为 `HttpException`，由 `HttpExceptionFilter` 包装。
同一接口的相同 HTTP 状态在错误表中合并；`msg` 可能来自 DTO、范围鉴权、权限 Guard 或 service。

```json
{
  "code": 409,
  "data": {},
  "msg": "仍有待核实调价，请先回查",
  "timestamp": "2026-10-15T04:00:00.000Z",
  "path": "/v1/sys/merchant-ads/00000000-0000-4000-8000-000000000030/rule"
}
```

非 `HttpException` 的未处理异常由 Nest 默认处理，例如同步广告时平台返回无效结构或网络异常，
可能直接返回 HTTP `500`，不经过上述包装：

```json
{ "statusCode": 500, "message": "Internal server error" }
```

### AdView：广告

来源：`MerchantAdEntity` 加 `C2cAdService.adViews()` 的 `merchantName`。列表和详情使用相同字段。

广告列表、详情及保存结果统一新增 `pricing`，由服务端根据主广告的 `rule.linkedAdId` 派生，不另存角色字段：

- `{ role: 'INDEPENDENT' }`：独立广告。
- `{ role: 'MAIN', linkedAd: { id, platformAdId, status, enabled }, discount }`：主广告及其副广告。
- `{ role: 'LINKED', mainAd: { id, platformAdId, status, enabled }, discount }`：副广告及其主广告。

关联查询按 tenantId、merchantId 限定，并独立于分页，主广告不在当前页也能识别副广告。`discount` 为十进制字符串。副广告保存独立策略、开启或暂停独立自动调价均返回 `409`；无在途记录时独立试算、执行也返回 `409`。已有联动记录仍可回查/恢复，不新建独立策略任务。页面以 `pricing` 展示角色，副广告只读查看联动并进入主广告管理，不显示独立调价开关、试算与新调价入口。

解除关联在主广告策略中清空副广告并保存；存在副广告在途调价时返回 `409`。解除后副广告保留此前的独立策略，自动调价保持暂停，不自动恢复运行。关联本身不改变平台在线状态；副广告离线时执行会阻断，并展示具体原因。

| 字段                                   | 类型                         | 含义                                                   |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `id / tenantId / merchantId`           | string                       | 内部 UUID、所属单位、商家                              |
| `createdAt / updatedAt / lastSyncedAt` | string                       | ISO 时间；`lastSyncedAt` 是最近成功获取平台广告的时间  |
| `merchantName`                         | string                       | 后台商家名称；不能代替平台公开昵称                     |
| `platform`                             | `BINANCE / OKX`              | 来源平台                                               |
| `platformAdId`                         | string                       | 当前绑定的平台广告标识，OKX 改价后可能变化             |
| `asset / fiatCurrency / side`          | string                       | 仅收录 `asset=USDT`、商家视角 `side=BUY`；法币来自广告 |
| `price`                                | string                       | 最近查询的广告价格                                     |
| `status`                               | `ONLINE / OFFLINE / UNKNOWN` | 平台广告状态；只有 `ONLINE` 可进入调价                 |
| `paymentMethods`                       | string[]                     | 自己广告的支付方式                                     |
| `availableAmount`                      | string \| null               | 可交易 USDT 数量                                       |
| `minFiatAmount / maxFiatAmount`        | string \| null               | 自己广告的单笔法币限额                                 |
| `rule`                                 | `UnifiedAdRule` \| null      | 已保存的统一策略，见下一节                             |
| `ruleVersion`                          | number                       | 每次成功保存策略递增                                   |
| `enabled`                              | boolean                      | 自动调价开关；不是平台广告上架开关                     |
| `nextRunAt`                            | string \| null               | 下次可调价或回查的时间                                 |
| `lastError`                            | string \| null               | 最近一次执行/回查问题；具体选价原因看记录 `reason`     |
| `pendingRunId`                         | string \| null               | 待核实记录 ID；存在时禁止提交新的改价                  |

所有金额列由 PostgreSQL decimal 返回字符串，可能包含末尾零；前端不得假设固定两位小数。
响应不包含 API Key、Secret Key、Cookie、Authorization、私钥或凭据引用。

### UnifiedAdRule：统一策略

规则使用整体替换，不做字段级 PATCH。公共金额格式为非负十进制字符串：最多 12 位整数、8 位小数，
不接受负数、科学计数法或前导零（`0` 除外）。模式不使用的金额字段保存为 `null`。

| 字段                       | 类型 / 必填             | 校验与运行影响                                                                       |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `mode`                     | `FIXED / DYNAMIC`，必填 | 普通模式手填上限；动态模式根据卖币参考价算上限                                       |
| `step`                     | string，必填            | 必须是 `0.01` 的正整数倍；目标价为 `(floor(同行价 / step) + 1) × step` |
| `competitorAmount`         | string，必填            | 法币查询金额；`"0"` 表示不按金额限制，正数必须落在同行广告限额内                     |
| `competitorPaymentMethods` | string[]，必填          | 最多 20 个不重复的平台支付方式编码，各 1～64 字符；空数组不限，多个值匹配任意一个    |
| `competitorPeriod`         | number \| null，可省略  | 1～1440 分钟；`null` 不筛选。OKX 当前不支持此条件                                    |
| `merchantOnly`             | boolean，必填           | 同行和卖币参考查询都使用；字符串 `"false"` 无效                                      |
| `followNickname`           | string \| null，可省略  | 1～128 字符；仅跟随这个精确昵称，不能是自己或黑名单成员                              |
| `blockedNicknames`         | string[]，必填          | 最多 100 个不重复昵称，各 1～128 字符；只排除收币同行                                |
| `fixedLimit`               | string，FIXED 必填      | 必须大于 `0`；最终可提交价格的上限                                                   |
| `profitPerUsdt`            | string，DYNAMIC 必填    | 每个 USDT 预留的法币价差；允许 `"0"`，不是百分比                                     |
| `feePercent`               | string，DYNAMIC 必填    | 百分数，必须小于 `100`；`"0.11"` 表示 `0.11%`                                        |
| `referencePaymentMethods`  | string[]，必填          | 最多 20 个不重复编码，各 1～64 字符；只影响动态参考，空数组不限                      |
| `referencePosition`        | number，必填            | 1～10；卖币参考按价格升序排除自己后取第 N 条，不足 N 条取最后一条并记录实际位置      |
| `intervalSeconds`          | number，必填            | 15～86400 秒；自动调价和待核实回查的间隔                                             |

动态原始上限为 `参考卖价 - profitPerUsdt - 参考卖价 × feePercent / 100`，
按固定价格单位 `0.01` 向下取整后参与同一套同行选择。例：参考 `7.20`、价差 `0.05`、费率 `0.11%`、
价格单位 `0.01`，得到本轮上限 `7.14`；同行 `7.12`、步长 `0.01` 得到目标 `7.13`。
加格后的目标超过上限就排除该同行，继续选择本轮已取得的合格候选；不把超限结果截成上限。

### AdRunView：调价记录

来源：`MerchantAdRunEntity` 加 `C2cAdService.runViews()` 的 `merchantName/platform`。

| 字段                                | 类型                      | 含义                                       |
| ----------------------------------- | ------------------------- | ------------------------------------------ |
| `id / tenantId / merchantId / adId` | string                    | 记录、所属单位、商家和内部广告 UUID        |
| `merchantName / platform`           | string                    | 后台商家名称和平台                         |
| `createdAt / updatedAt`             | string                    | ISO 时间                                   |
| `rule / ruleVersion`                | object / number           | 本次执行时冻结的完整策略及版本             |
| `trigger`                           | `PREVIEW / MANUAL / AUTO` | 试算、人工执行或自动任务                   |
| `status`                            | string                    | 见下表；HTTP 成功不等于平台改价成功        |
| `currentPrice`                      | string \| null            | 本次计算前查询到的价格                     |
| `targetPrice`                       | string \| null            | 本轮建议提交价格                           |
| `actualPrice`                       | string \| null            | 最近一次平台广告查询价格                   |
| `platformAdId / resultPlatformAdId` | string / string \| null   | 请求原广告 ID、平台更新返回的 ID           |
| `evidence`                          | `PriceEvidence` \| null   | 查询、选价与排除依据；查询阶段失败时可为空 |
| `reason`                            | string                    | 保持、阻断、失败或待核实的具体原因         |
| `createdBy`                         | string \| null            | 人工操作账号 ID 字符串；自动任务为空       |
| `finishedAt`                        | string \| null            | 终结时间；`PENDING` 不填，试算完成会填     |

| status    | 含义                                                             |
| --------- | ---------------------------------------------------------------- |
| `READY`   | 试算已有可提交结果；`trigger=PREVIEW` 时没有改价请求             |
| `HOLD`    | 保持价格，例如当前价已等于建议价，或没有合格同行且当前价未超上限 |
| `BLOCKED` | 本轮禁止提交，例如广告离线、参考列表为空或动态上限非正           |
| `PENDING` | 已持久化改价意图，实际是否生效仍待平台回查                       |
| `APPLIED` | 平台回查价格已等于目标价                                         |
| `FAILED`  | 查询/计算失败，或平台明确拒绝改价；看 `reason`                   |

### PriceEvidence：选价证据

`rule` 为完整规则；新记录的 `ownAdIds` 是本轮从平台查询的当前商家全部自有广告号，用于自动排除买单同行和卖单参考中的自己；不需要用户填写昵称。`rawLimit/limit` 为取整前/后上限字符串或 `null`；`reference` 是选中的卖币报价或 `null`；
`actualReferencePosition` 为实际参考位置或 `null`；`selected` 是选中的收币同行报价或 `null`；
`candidates` 为 `{ quote, targetPrice: string|null, reason: string, eligible: boolean }[]`。

每个 `quote` 包含 `platformAdId, traderNickname, asset, fiatCurrency, side, price, minFiatAmount,
maxFiatAmount, paymentMethods`。其中方向均为商家视角，金额为字符串，不含平台原始响应或秘密数据。

`competitorQuery/referenceQuery` 记录统一查询条件：`asset, fiatCurrency, side, amount,
paymentMethods, merchantOnly, periodMinutes, limit`；普通模式的 `referenceQuery` 为 `null`。
`competitorSnapshot/referenceSnapshot` 记录 `{ quotes, fetchedAt, window: { page, rows } }`；
普通模式的 `referenceSnapshot` 为 `null`。币安取第一页 20 条同行、10 条参考；OKX 查询第一页最多 100 条，
按支付方式、金额等统一筛选后只在本轮返回窗口中选价，不表示全市场最优。

## Operation: merchantAdsList

| 项            | 值                                           |
| ------------- | -------------------------------------------- |
| Method / Path | `GET /v1/sys/merchant-ads`                   |
| Function      | 分页读取已同步的买 USDT 广告与当前策略       |
| Controller    | `C2cAdController.list`                       |
| Auth          | Bearer；`merchant:ad:read`；通用所属单位范围 |
| Request DTO   | `AdListDto`                                  |
| Success data  | service 分页结构，`items: AdView[]`          |

### Request

Query：`tenantId?`；`merchantId?`（UUID）；`platform?`（`BINANCE/OKX`）；`page?`；`pageSize?`。
Headers、所属单位与分页校验见通用约定。

### Success Response

HTTP `200`，使用公共分页成功包装，`data.items` 为 `AdView[]`。本接口只读本地已同步数据，不自动向平台同步。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                                   |
| ----------- | --------------------------------------------------------------------------------- |
| `400 / 400` | DTO UUID、平台或分页无效；ValidationPipe                                          |
| `401 / 401` | 未登录、令牌失效；认证 Guard                                                      |
| `403 / 403` | 缺少读取权限、所属单位不匹配或平台人员未选单位；权限 Guard / BusinessScopeService |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                                              |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsDetail

| 项            | 值                                           |
| ------------- | -------------------------------------------- |
| Method / Path | `GET /v1/sys/merchant-ads/{id}`              |
| Function      | 读取一张广告、已保存策略和待核实标识         |
| Controller    | `C2cAdController.detail`                     |
| Auth          | Bearer；`merchant:ad:read`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Query `AdScopeDto`           |
| Success data  | service `AdView`，无独立响应 DTO             |

### Request

Path：内部广告 UUID `id`。Query：`tenantId?`、必填 `merchantId`（UUID）。Headers 见通用约定。

### Success Response

HTTP `200`，使用公共成功包装，`data` 为完整 `AdView`。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                             |
| ----------- | --------------------------------------------------------------------------- |
| `400 / 400` | 路径 UUID、Query UUID 无效或缺少 merchantId；ParseUUIDPipe / ValidationPipe |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                                |
| `403 / 403` | 无读取权限或所属单位范围不合法；权限 Guard / BusinessScopeService           |
| `404 / 404` | 该所属单位及商家下没有这张广告；`广告不存在`                                |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                                        |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsSync

| 项            | 值                                            |
| ------------- | --------------------------------------------- |
| Method / Path | `POST /v1/sys/merchants/{id}/ads/sync`        |
| Function      | 从平台同步当前商家自己的买 USDT 广告          |
| Controller    | `C2cAdController.sync`                        |
| Auth          | Bearer；`merchant:ad:sync`；通用所属单位范围  |
| Request DTO   | Path 商家 UUID `id`；Query `TenantContextDto` |
| Success data  | service `{ scanned: number, synced: number }` |

### Request

Path：商家 UUID `id`。Query：`tenantId?`。无请求体；Headers 见通用约定。

### Success Response

HTTP `201`：

```json
{
  "code": 200,
  "data": { "scanned": 3, "synced": 2 },
  "msg": "success",
  "timestamp": "2026-10-15T04:00:00.000Z"
}
```

`scanned` 是本次返回的平台广告数；`synced` 是实际写入的 BUY-USDT 广告数。
待核实广告及已知的待核实新平台 ID 会跳过，避免覆盖在途记录。
新同步广告默认未配置规则、自动开关关闭；同步不会自动开启调价，也不会删除本次列表中未出现的旧广告。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                                 |
| ----------- | ------------------------------------------------------------------------------- |
| `400 / 400` | UUID 无效、所属单位或商家停用、没有生效凭据；Pipe / C2cAdService / 凭据 service |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                                    |
| `403 / 403` | 无同步权限或所属单位范围不合法；权限 Guard / BusinessScopeService               |
| `404 / 404` | 当前所属单位下没有该商家；`商家不存在`                                          |
| `409 / 409` | 同一商家正在同步、保存或调价；`该商家正在同步或调价，请稍后重试`                |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                                            |

以上均使用公共错误包装。平台请求拒绝、网络异常或广告字段不合法等普通 Error 可能返回公共说明中的默认 `500`，不得按统一包装读取这类响应。

## Operation: merchantAdsSaveRule

| 项            | 值                                           |
| ------------- | -------------------------------------------- |
| Method / Path | `PUT /v1/sys/merchant-ads/{id}/rule`         |
| Function      | 整体保存一套普通或动态策略，并递增版本       |
| Controller    | `C2cAdController.rule`                       |
| Auth          | Bearer；`merchant:ad:rule`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Body `AdRuleDto`             |
| Success data  | service `AdView`，无独立响应 DTO             |

### Request

Path：内部广告 UUID `id`。Body：`{ tenantId?, merchantId, rule }`，`merchantId` 必须是 UUID，
`rule` 必填且使用完整 `UnifiedAdRule`。Headers 见通用约定。普通策略请求示例：

```json
{
  "tenantId": "00000000-0000-4000-8000-000000000010",
  "merchantId": "00000000-0000-4000-8000-000000000020",
  "rule": {
    "mode": "FIXED",
    "step": "0.01",
    "competitorAmount": "1000",
    "competitorPaymentMethods": ["ALIPAY"],
    "competitorPeriod": null,
    "merchantOnly": true,
    "followNickname": null,
    "blockedNicknames": [],
    "fixedLimit": "7.10",
    "profitPerUsdt": null,
    "feePercent": null,
    "referencePaymentMethods": [],
    "referencePosition": 3,
    "intervalSeconds": 15
  }
}
```

价格单位固定为 `0.01`，无需提交 `priceTick`。动态模式改为 `mode=DYNAMIC`，
`fixedLimit=null`，并填写 `profitPerUsdt`、`feePercent`；其余参数共用。

### Success Response

HTTP `200`，使用公共成功包装，`data` 为完整 `AdView`。自动开关已开启时更新 `nextRunAt` 为当前时间，
由后续任务按新版本计算；保存本身不提交平台改价。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `400 / 400` | UUID、必填规则或字段格式错误；加价格子不是 `0.01` 的正整数倍、普通上限非正、费率不小于 100%、指定同行在黑名单中；Pipe / C2cAdService |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                                                                                         |
| `403 / 403` | 无策略权限或所属单位范围不合法；权限 Guard / BusinessScopeService                                                                    |
| `404 / 404` | 该范围内广告不存在；`广告不存在`                                                                                                     |
| `409 / 409` | 商家操作锁冲突，或仍有待核实调价；AdLockService / `仍有待核实调价，请先回查`                                                         |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                                                                                                 |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsStart

| 项            | 值                                            |
| ------------- | --------------------------------------------- |
| Method / Path | `PUT /v1/sys/merchant-ads/{id}/start`         |
| Function      | 开启自动调价，并将广告标记为可立即执行        |
| Controller    | `C2cAdController.start`                       |
| Auth          | Bearer；`merchant:ad:start`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Body `AdScopeDto`             |
| Success data  | service `AdView`，无独立响应 DTO              |

### Request

Path：广告 UUID `id`。Body：`{ tenantId?, merchantId }`，`merchantId` 为必填 UUID。Headers 见通用约定。

### Success Response

HTTP `200`，使用公共成功包装，`data` 为完整 `AdView`，其中 `enabled=true`。
服务端任务每 5 秒扫描到期广告，按各自 `intervalSeconds` 安排后续执行；开启接口本身不保证已向平台提交。
开启时检查商家/所属单位和凭据，但不另设“广告能力”检查接口。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                                              |
| ----------- | -------------------------------------------------------------------------------------------- |
| `400 / 400` | UUID/Body 无效、商家或所属单位停用、凭据未配置或尚无策略；Pipe / C2cAdService / 凭据 service |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                                                 |
| `403 / 403` | 无开启权限或所属单位范围不合法；权限 Guard / BusinessScopeService                            |
| `404 / 404` | 广告或商家不存在；C2cAdService                                                               |
| `409 / 409` | 商家操作锁冲突，或有待核实调价；AdLockService / C2cAdService                                 |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                                                         |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsStop

| 项            | 值                                           |
| ------------- | -------------------------------------------- |
| Method / Path | `PUT /v1/sys/merchant-ads/{id}/stop`         |
| Function      | 停止发起新的自动改价，保留在途请求回查       |
| Controller    | `C2cAdController.stop`                       |
| Auth          | Bearer；`merchant:ad:stop`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Body `AdScopeDto`            |
| Success data  | service `AdView`，无独立响应 DTO             |

### Request

Path：广告 UUID `id`。Body：`{ tenantId?, merchantId }`，`merchantId` 为必填 UUID。Headers 见通用约定。

### Success Response

HTTP `200`，使用公共成功包装，`data` 为完整 `AdView`，其中 `enabled=false`。
无待核实请求时 `nextRunAt=null`；有待核实请求时继续排队回查。
暂停不会把平台广告下架，也不会取消已经发出的请求；人工执行权限仍可单独使用。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                   |
| ----------- | ----------------------------------------------------------------- |
| `400 / 400` | UUID/Body 无效或缺少 merchantId；Pipe                             |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                      |
| `403 / 403` | 无暂停权限或所属单位范围不合法；权限 Guard / BusinessScopeService |
| `404 / 404` | 该范围内广告不存在；`广告不存在`                                  |
| `409 / 409` | 同一商家正在同步或调价；AdLockService                             |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                              |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsPreview

| 项            | 值                                                     |
| ------------- | ------------------------------------------------------ |
| Method / Path | `POST /v1/sys/merchant-ads/{id}/preview`               |
| Function      | 按已保存策略查询并试算，记录取舍依据，不向平台提交改价 |
| Controller    | `C2cAdController.preview`                              |
| Auth          | Bearer；`merchant:ad:preview`；通用所属单位范围        |
| Request DTO   | Path UUID `id`；Body `AdScopeDto`                      |
| Success data  | runner 返回的 `AdRunView`，无独立响应 DTO              |

### Request

Path：广告 UUID `id`。Body：`{ tenantId?, merchantId }`，`merchantId` 为必填 UUID。Headers 见通用约定。
接口读取已保存版本；不接收临时策略参数。

### Success Response

HTTP `201`，使用公共成功包装，`data` 为完整 `AdRunView`。正常试算的 `trigger=PREVIEW`，
可返回 `READY/HOLD/BLOCKED/FAILED`，必须结合 `status/reason` 展示结果。
若已有 `pendingRunId`，优先回查并返回原记录，不创建试算记录、不提交新的改价。
平台不支持已选条件时返回 `FAILED` 记录。例如 OKX 设置付款时限后，`reason` 为
`当前平台不支持广告付款时限筛选，请清空该条件`；该结果不代表网络连接失败。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                   |
| ----------- | ----------------------------------------------------------------- |
| `400 / 400` | UUID/Body 无效或尚未保存策略；Pipe / `请先保存策略`               |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                      |
| `403 / 403` | 无试算权限或所属单位范围不合法；权限 Guard / BusinessScopeService |
| `404 / 404` | 该范围内广告不存在；`广告不存在`                                  |
| `409 / 409` | 同一商家操作锁冲突；AdLockService                                 |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                              |

以上均使用公共错误包装。广告/行情查询失败通常写成 `FAILED` 记录并按 HTTP `201` 返回；
回查失败保留原记录为 `PENDING`。未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdsExecute

| 项            | 值                                              |
| ------------- | ----------------------------------------------- |
| Method / Path | `POST /v1/sys/merchant-ads/{id}/execute`        |
| Function      | 人工执行一次已保存策略；有在途记录时只回查      |
| Controller    | `C2cAdController.execute`                       |
| Auth          | Bearer；`merchant:ad:execute`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Body `AdScopeDto`               |
| Success data  | runner 返回的 `AdRunView`，无独立响应 DTO       |

### Request

Path：广告 UUID `id`。Body：`{ tenantId?, merchantId }`，`merchantId` 为必填 UUID。Headers 见通用约定。
无需开启自动开关；仍检查当前商家/所属单位、已保存策略与平台广告状态。

### Success Response

HTTP `201`，使用公共成功包装，`data` 为完整 `AdRunView`；新记录的 `trigger=MANUAL`。
`APPLIED` 表示平台回查价格一致；`PENDING` 表示结果尚未核实；`FAILED/BLOCKED/HOLD` 都不能显示为“改价成功”。
具体在途语义见下文“提交与回查”。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                   |
| ----------- | ----------------------------------------------------------------- |
| `400 / 400` | UUID/Body 无效或尚未保存策略；Pipe / `请先保存策略`               |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                      |
| `403 / 403` | 无执行权限或所属单位范围不合法；权限 Guard / BusinessScopeService |
| `404 / 404` | 该范围内广告不存在；`广告不存在`                                  |
| `409 / 409` | 同一商家操作锁冲突；AdLockService                                 |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                              |

以上均使用公共错误包装。平台查询/改价失败通常转换为记录结果并按 HTTP `201` 返回，
不会仅因返回 HTTP `201` 宣称写入成功；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdRunsList

| 项            | 值                                              |
| ------------- | ----------------------------------------------- |
| Method / Path | `GET /v1/sys/merchant-ad-runs`                  |
| Function      | 分页查询试算、人工和自动调价记录                |
| Controller    | `C2cAdController.runs`                          |
| Auth          | Bearer；`merchant:adRun:read`；通用所属单位范围 |
| Request DTO   | `AdRunListDto`                                  |
| Success data  | service 分页结构，`items: AdRunView[]`          |

### Request

Query：`tenantId?`、`merchantId?`、`adId?`（UUID）、`platform?`（`BINANCE/OKX`）、`page?`、`pageSize?`。
Headers、所属单位与分页校验见通用约定。

### Success Response

HTTP `200`，使用公共分页成功包装，`data.items` 为 `AdRunView[]`，按创建时间倒序。
记录列表和详情都包含已保存的 `evidence`，没有单独向平台查询。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                   |
| ----------- | ----------------------------------------------------------------- |
| `400 / 400` | UUID、平台或分页无效；ValidationPipe                              |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                      |
| `403 / 403` | 无记录权限或所属单位范围不合法；权限 Guard / BusinessScopeService |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                              |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## Operation: merchantAdRunsDetail

| 项            | 值                                              |
| ------------- | ----------------------------------------------- |
| Method / Path | `GET /v1/sys/merchant-ad-runs/{id}`             |
| Function      | 读取单次执行的规则快照、查询证据和平台回查结果  |
| Controller    | `C2cAdController.runDetail`                     |
| Auth          | Bearer；`merchant:adRun:read`；通用所属单位范围 |
| Request DTO   | Path UUID `id`；Query `AdScopeDto`              |
| Success data  | service `AdRunView`，无独立响应 DTO             |

### Request

Path：记录 UUID `id`。Query：`tenantId?`、必填 `merchantId`（UUID）。Headers 见通用约定。

### Success Response

HTTP `200`，使用公共成功包装，`data` 为完整 `AdRunView`。本接口只读记录；
主动回查通过广告的 `execute` 进行，有待核实记录时该操作不会再次改价。
广告列表有待核实记录时，操作菜单显示“核实结果”，复用执行权限并调用 `execute`，不会强制重试写入。

### Error Responses

| HTTP / code | 场景与 msg 来源                                                   |
| ----------- | ----------------------------------------------------------------- |
| `400 / 400` | UUID 无效或缺少 merchantId；Pipe                                  |
| `401 / 401` | 未登录或令牌失效；认证 Guard                                      |
| `403 / 403` | 无记录权限或所属单位范围不合法；权限 Guard / BusinessScopeService |
| `404 / 404` | 当前所属单位和商家下无此记录；`调价记录不存在`                    |
| `429 / 429` | 全局限流；`请求过于频繁，请稍后再试`                              |

以上均使用公共错误包装；未处理的基础设施异常使用公共 `500` 说明。

## 提交与回查

提交前在短事务中保存 `PENDING` 记录和广告 `pendingRunId`，再向平台发出改价。
已确认尚未发送改价请求的准备失败，或平台明确拒绝时，记为 `FAILED` 并清除待核实标识；
已进入写请求后超时、网络中断或回查价格不一致时保留 `PENDING`。
OKX 改价前重新读取广告或构造必要字段失败时，记录原因为
`广告改价准备失败，本次未提交，请重新查询广告后重试`；可以修正后重新执行，不会长期锁在待核实状态。
后续人工执行及自动任务先回查这条记录，不重复计算和提交；试算只返回已有记录，不发出写请求。
没有“超时后强制重试”或自动丢弃待核实记录的操作。

OKX 返回新 `publicId` 时，先保存 `resultPlatformAdId` 并按新 ID 回查。
超时且新 ID 未知时保持待核实，不能根据价格或昵称猜测广告绑定。
暂停自动调价仍会安排已在途请求回查；商家/所属单位停用或凭据失效导致回查失败时继续保留记录。
配置上限约束本轮新提交价格；`HOLD/BLOCKED` 不会主动下架广告，旧广告可能仍在线。

## 当前平台边界与发布

- Binance 状态依据根目录 `docs/币安接口文档.pdf`（`sapi-v7.4.md`，2024-05-08）第 31、36、41 页：`advStatus` 是整数，`1` 为在线、`3` 为离线、`4` 为关闭。统一映射为 `1 → ONLINE`、`3/4 → OFFLINE`，未定义值为 `UNKNOWN` 并阻断改价。列表、详情和 Mock 使用相同数字协议，不依赖实盘写入确认枚举。
- 按当前业务约定，买 USDT 广告价格单位固定为 `0.01`，不再提供价格精度配置。旧客户端提交的 `priceTick` 作为未知字段被忽略，已有 JSON 中的旧值不参与计算；重新保存策略后移除，无数据库结构变更。历史调价记录保留原始证据。
- OKX 网页 Cookie 私有协议保留在 `OKX_WEB_PRIVATE` Adapter。改价只支持 `type=limit` 的固定价格广告，并保留刚读取的上架属性；不会硬编码重新上架。付款时限条件当前不支持，试算/执行会明确提示清空该条件；非固定价格广告提交时明确提示仅支持固定价格广告调价。
- 本地模拟协议、契约测试和隔离数据库验证不能替代真实平台实盘验收；本接口文档不承诺已验证真实商家广告写入。
- 首次生产发布先由标准 `migrate` 服务执行已登记迁移 `C2cMerchantAds1789029000000`，再启动兼容后端，最后发布前端；保持 `synchronize:false`。无需手工创建业务表或复制菜单 SQL。

API 契约测试：`server/backend/test/e2e/merchant-ads-contract.e2e-spec.ts`。
完整业务规则见根目录 [统一策略方案](../../../../../docs/c2c-usdt-ad-management-plan.md)。

## 源码广告筛选与联动补齐（2026-10-15）

- 新增策略字段：`excludeInactive`（默认 false）；`linkedAdId`、`linkedDiscount`（默认 null）。旧策略未配置时保持原行为，沿用现有 rule JSON，无表结构变化。
- 活跃筛选：币安映射 `advertiser.activeTimeInSecond`；超过 1200 秒排除，恰好 1200 秒保留。缺失时按源码不排除，记录中的原始值为 null；欧易没有已验证对应字段时同样处理。
- 副广告：选择同商家、同法币的已同步买 USDT 广告，折扣系数 0≤值<1；目标=主目标×(1−系数)，按 0.01 向下。禁止自身、循环、多主共用、独立自动调价与在途冲突。主广告需要改价时才联动，主价已相同不补发副价，遵循源码触发条件。
- 预览展示副广告目标，不写平台。主广告回查生效后，在同一事务保存主结果、副广告 READY 记录及其 pendingRunId；随后复用统一提交/回查。进程中断时由现有待执行扫描恢复 READY，在途仍只回查；副失败不重复写已成功主广告。
- 调价证据保存同行活跃秒数、关联广告目标及记录编号。权限复用广告策略/执行权限，查询均约束 tenantId、merchantId；平台更新仍只在本地 Mock 验证。
- 记录列表/详情新增 `linkedRun: { id, status, reason, actualPrice } | null`，展示关联副广告记录的当前结果；主记录 `APPLIED` 仅表示主广告已生效。副记录通过 `evidence.linkedFromRunId` 关联主记录，主记录通过 `evidence.linkedAd.runId` 关联副记录。尚未创建副记录时这些关联值为空。

2026-10-15 删除同行下单限制检查及币安网页 Cookie / CSRF 配置；旧策略中的该开关不再参与执行，旧客户端提交时作为未知字段忽略。币安查询与调价使用 API Key / Secret Key；欧易原有 Cookie 凭据不变。无表结构变化，无新增迁移。
