# C2C IP 代理 API

源码基准：`Wei-Shaw/sub2api@455d317d6a87d8519a52c8769a0727824c403171`。
控制器 `ProxyController` 经 `SystemModule` 的 sys 前缀挂载，菜单为商家管理 / 代理管理。
全部接口使用 Bearer token，权限码前缀为 `system:proxy`；绑定还需要 `merchant:account:update`。
平台账号必须显式提供 tenantId；单位账号由服务端约束 tenantId，禁止替换单位。
没有单接口独立限流，沿用后台全局 Throttler。

## 字段与文件格式

ProxyInput：name（可选，≤100字符，缺省default）、protocol（http/https/socks5/socks5h）、host（≤255字符，不带协议或路径）、port（整数1–65535）、username（可选≤255）、password（只写≤1024）、status（active/inactive）、expires_at（Unix秒或null）、expiry_warn_days（0–36500，缺省7）、fallback_mode（none/proxy/direct，缺省none）、backup_proxy_id（同单位UUID或null）。
选择 proxy 策略必须指定备用代理，禁止指向自身。

ProxyView 来自 service 显式映射：id/name/protocol/host/port/username/password_configured/status/expires_at/expiry_warn_days/fallback_mode/backup_proxy_id/account_count/created_at/updated_at/last_test/last_quality。
到期时 status 派生为 expired。created_at/updated_at 是 ISO 时间，expires_at 是 Unix 秒；ID 始终为字符串。
密码、加密值和去重指纹不返回。

JSON 文件保留 sub2api 原格式：

```json
{"exported_at":"2026-10-16T00:00:00Z","proxies":[{"proxy_key":"http|example.invalid|8080|user|value","name":"example","protocol":"http","host":"example.invalid","port":8080,"username":"user","password":"value","status":"active","expires_at":null,"expiry_warn_days":7,"fallback_mode":"none"}],"accounts":[]}
```

备用引用使用 backup_proxy_name，按当前单位已有记录和本批已创建记录顺序查找；未找到时按源实现降级 none 并返回警告。逐条失败不会回滚其他成功项。
proxy_key 由实际配置重新计算用于去重，不信任上传值；disabled/expired 状态映射为 inactive。
因根 AGENTS Secret 规则，导出省略 password，proxy_key 的密码段为空；含认证代理跨实例恢复需重新提供密码。
创建、编辑、批量与导入禁用请求体日志。

连接探测要求 HTTP 200；ip-api 还要求 status=success，失败后通过同一代理尝试 ipify。

每分钟扫描到期策略：none 保持绑定；direct 解绑直连；proxy 沿备用链选择启用且未到期代理。环路、缺失节点或无解时保持原绑定并拒绝出口请求。
代理连接异常不会触发直连。HTTP 和币安现有 WebSocket 均采用商家绑定出口。
覆盖商家调用币安/欧易的全部接口，包括订单、广告、行情、平台付款确认、聊天、申诉及平台文件上传；币安预签名文件地址的实际 PUT 上传同样走商家代理，不附加平台鉴权头。支付宝支付、支付回单下载及 Telegram 调用不受商家代理控制。
绑定变化持久化；不会因主代理续期擅自切回。

统一错误包装（各 Operation 的错误表列出对应 HTTP/code，另有全局429）：

```json
{"code":400,"data":{},"msg":"错误消息","timestamp":"2026-10-16T00:00:00.000Z","path":"/v1/sys/proxies"}
```

## Operation: proxyList

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/proxies` |
| Function | 按筛选、排序分页查询代理 |
| Controller | `ProxyController.list` |
| Auth | Bearer token；`system:proxy:read` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `ProxyListDto` |
| Success data | {items: ProxyView[], total, page, page_size, pages} |

### Request

Authorization: Bearer token。
Query：tenantId + page（默认1）、page_size（默认20，1–1000）、search（≤100字符）、protocol、status（active/inactive/expired）、sort_by（id/name/protocol/status/created_at/expiry/account_count）、sort_order（asc/desc）。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":{"items":[],"total":0,"page":1,"page_size":20,"pages":0},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |


## Operation: proxyAll

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/proxies/all` |
| Function | 查询启用且未到期的代理选项 |
| Controller | `ProxyController.all` |
| Auth | Bearer token；`system:proxy:read` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `TenantContextDto` |
| Success data | ProxyView[] |

### Request

Authorization: Bearer token。
Query：tenantId。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":[],"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |


## Operation: proxyCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies` |
| Function | 创建代理并异步测试连通性 |
| Controller | `ProxyController.create` |
| Auth | Bearer token；`system:proxy:create` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `CreateProxyDto` |
| Success data | ProxyService.view（未声明响应 DTO） |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Body：tenantId + 下述 ProxyInput；protocol/host/port 必填。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"id":"00000000-0000-4000-8000-000000000101","name":"example","protocol":"http","host":"127.0.0.1","port":8080,"username":"","password_configured":false,"status":"active","expires_at":null,"expiry_warn_days":7,"fallback_mode":"none","backup_proxy_id":null,"account_count":0,"created_at":"2026-10-16T00:00:00.000Z","updated_at":"2026-10-16T00:00:00.000Z","last_test":null,"last_quality":null},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 409 | 同单位连接配置已存在 |
| 500 | 保存或凭据加密失败 |

## Operation: proxyBatch

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies/batch` |
| Function | 创建批量 URL 解析后的代理并跳过已存在项 |
| Controller | `ProxyController.batch` |
| Auth | Bearer token；`system:proxy:create` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `BatchProxyDto` |
| Success data | {created:number,skipped:number} |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Body：{tenantId,proxies:[ProxyInput,...]}，非空数组。按 host/port/username/password 去重，不含 protocol；不改动前端源 URL 格式。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"created":1,"skipped":0},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 500 | 保存失败；此前已创建记录保留 |

## Operation: proxyImportData

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies/data` |
| Function | 导入原始 sub2api JSON 文件内容 |
| Controller | `ProxyController.importData` |
| Auth | Bearer token；`system:proxy:import` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `ImportProxyDto` |
| Success data | ProxyImportResult |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Body：{tenantId,data:文件原始JSON}。data.proxies、data.accounts 必须是数组；accounts 忽略。type 可省略或 sub2api-data/sub2api-bundle，version 可省略或1。代理字段见下述文件格式。请求体上限10MiB。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"proxy_created":1,"proxy_reused":0,"proxy_failed":0,"account_created":0,"account_failed":0,"errors":[]},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |


## Operation: proxyExportData

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/proxies/data` |
| Function | 按选中ID或筛选条件导出 JSON 数据 |
| Controller | `ProxyController.exportData` |
| Auth | Bearer token；`system:proxy:export` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `ProxyListDto` |
| Success data | ProxyService.exportData（未声明响应 DTO） |

### Request

Authorization: Bearer token。
Query：tenantId + 列表筛选/排序参数；ids 可选逗号分隔 UUID（最多1000个），导出不分页。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":{"exported_at":"2026-10-16T00:00:00.000Z","proxies":[],"accounts":[]},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |


## Operation: proxyUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/proxies/:id` |
| Function | 覆盖指定字段，未提交密码时保留密码 |
| Controller | `ProxyController.update` |
| Auth | Bearer token；`system:proxy:update` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `UpdateProxyDto` |
| Success data | ProxyView（同创建响应） |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Path：id（UUID）。Body：tenantId + 可选 ProxyInput 字段；expires_at=null 清除有效期，backup_proxy_id=null 清除备用引用，password="" 清除密码。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":{"id":"00000000-0000-4000-8000-000000000101","name":"example","protocol":"http","host":"127.0.0.1","port":8080,"password_configured":false,"status":"active","expires_at":null,"fallback_mode":"none","backup_proxy_id":null},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 代理不存在或不属于当前单位 |
| 409 | 连接配置重复 |
| 500 | 保存失败 |

## Operation: proxyRemove

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/proxies/:id` |
| Function | 删除未被商家或备用策略引用的代理 |
| Controller | `ProxyController.remove` |
| Auth | Bearer token；`system:proxy:delete` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `TenantContextDto` |
| Success data | {id:string} |

### Request

Authorization: Bearer token。
Path：id（UUID）。Query：tenantId。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":{"id":"00000000-0000-4000-8000-000000000101"},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 代理不存在 |
| 409 | 商家或备用策略仍引用该代理 |

## Operation: proxyRemoveMany

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies/batch-delete` |
| Function | 逐条删除，返回成功和失败 ID |
| Controller | `ProxyController.removeMany` |
| Auth | Bearer token；`system:proxy:delete` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `DeleteProxiesDto` |
| Success data | {deleted_ids:string[],failed:{id,reason}[]} |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Body：{tenantId,ids:[UUID,...]}，非空、不重复、最多1000个；失败记录保留。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"deleted_ids":[],"failed":[]},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |


## Operation: proxyAccounts

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/proxies/:id/accounts` |
| Function | 查询代理绑定商家摘要 |
| Controller | `ProxyController.accounts` |
| Auth | Bearer token；`system:proxy:read + merchant:account:read` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `TenantContextDto` |
| Success data | MerchantEntity[]（仅选取 id/name/platform/status） |

### Request

Authorization: Bearer token。
Path：id（UUID）。Query：tenantId。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":[],"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 代理不存在 |

## Operation: proxyTest

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies/:id/test` |
| Function | 通过代理访问固定 IP 探测服务 |
| Controller | `ProxyController.test` |
| Auth | Bearer token；`system:proxy:test` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `TenantContextDto` |
| Success data | TestResult |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Path：id（UUID）。Query：tenantId；无 Body。代理网络失败返回 success=false，不能自动改成直连。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"success":false,"message":"代理连接失败，请检查地址、认证和网络"},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 代理不存在 |
| 500 | 凭据不可解密 |

## Operation: proxyQuality

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/proxies/:id/quality-check` |
| Function | 执行源实现的固定目标质量检测和评分 |
| Controller | `ProxyController.quality` |
| Auth | Bearer token；`system:proxy:quality` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `TenantContextDto` |
| Success data | ProxyProbeService.quality（未声明响应 DTO） |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Path：id（UUID）。Query：tenantId；无 Body。不接受自定义探测URL。

### Success Response

HTTP `201`；统一包装：

```json
{"code":200,"data":{"proxy_id":"00000000-0000-4000-8000-000000000101","score":78,"grade":"B","passed_count":0,"warn_count":0,"failed_count":1,"challenge_count":0,"summary":"通过 0 项，告警 0 项，失败 1 项，挑战 0 项","checked_at":1792108800,"items":[{"target":"base_connectivity","status":"fail","message":"代理连接失败，请检查地址、认证和网络"}]},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 代理不存在 |
| 500 | 凭据不可解密 |

## Operation: proxyBind

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/proxies/bindings/:merchantId` |
| Function | 绑定同单位可用代理或显式解绑为直连 |
| Controller | `ProxyController.bind` |
| Auth | Bearer token；`system:proxy:bind + merchant:account:update` |
| Rate limit | 后台全局 Throttler |
| Request DTO | `BindProxyDto` |
| Success data | {merchantId:string,proxyId:string|null} |

### Request

Authorization: Bearer token。有 Body 时 Content-Type: application/json。
Path：merchantId（UUID）。Body：{tenantId,proxyId:UUID|null}；null 表示解绑。

### Success Response

HTTP `200`；统一包装：

```json
{"code":200,"data":{"merchantId":"00000000-0000-4000-8000-000000000201","proxyId":null},"msg":"success","timestamp":"2026-10-16T00:00:00.000Z"}
```

### Error Responses

| HTTP/code | 场景 |
| --- | --- |
| 400 | DTO 校验失败、ID/字段类型/策略配置无效 |
| 401 | 未登录或 token 无效 |
| 403 | 功能权限不足或 tenantId 越权 |
| 429 | 后台全局频率限制 |
| 404 | 商家不存在 |
