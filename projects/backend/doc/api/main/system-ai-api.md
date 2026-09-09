# 系统 AI 能力中心 API

Controller：`AiController`。Auth：全部接口需要 Bearer Token 和对应权限；调用日志使用独立的
`monitor:aiCallLog:read`，其余接口使用 `system:ai:*`。
成功与错误响应均使用 [API 文档总览](../README.md) 定义的统一包装体。

## 渠道

| Method | Path | Permission | Request | Success data | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| GET | `/v1/sys/ai/channels` | `system:ai:read` | 无 | `AiChannelView[]` | `401`、`403` |
| POST | `/v1/sys/ai/channels` | `system:ai:create` | `CreateAiChannelDto` | `AiChannelView` | `400` DTO 或编码重复；`401`、`403` |
| PUT | `/v1/sys/ai/channels/:id` | `system:ai:update` | `UpdateAiChannelDto` | `AiChannelView` | `400` DTO；`404` 渠道不存在 |
| PUT | `/v1/sys/ai/channels/:id/credential` | `system:ai:update` | `RotateAiChannelCredentialDto` | `AiChannelView` | `400` DTO；`404` 渠道不存在 |
| POST | `/v1/sys/ai/channels/:id/test` | `system:ai:test` | `TestAiChannelDto` | `AiChannelView` | `400` 协议/能力不兼容或上游失败；`404` 渠道/模型不存在 |
| POST | `/v1/sys/ai/channels/:id/enable` | `system:ai:update` | 无 | `AiChannelView` | `400` 未通过连接测试；`404` 渠道不存在 |
| POST | `/v1/sys/ai/channels/:id/disable` | `system:ai:update` | 无 | `AiChannelView` | `404` 渠道不存在 |
| DELETE | `/v1/sys/ai/channels/:id` | `system:ai:delete` | 无 | `null` | `400` 渠道启用或仍被路由引用；`404` 渠道不存在 |

`CreateAiChannelDto.adapterCode` 必须是
`openai-chat-completions`、`openai-responses`、`openai-images` 或
`gemini-generate-content`。`supplier` 独立填写，API Key 不会出现在响应中。
`maxConcurrency` 取值 `1..100`，`maxQueuedRequests` 取值 `1..100000`；两者既用于通用 AI 调用容量
描述，也供异步业务在创建任务和开始执行时实施队列、并发限制。

## 模型

| Method | Path | Permission | Request | Success data | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| GET | `/v1/sys/ai/models` | `system:ai:read` | 无 | `SysAiModelEntity[]` | `401`、`403` |
| POST | `/v1/sys/ai/models` | `system:ai:create` | `CreateAiModelDto` | `SysAiModelEntity` | `400` 编码重复或协议不支持声明能力 |
| PUT | `/v1/sys/ai/models/:id` | `system:ai:update` | `UpdateAiModelDto` | `SysAiModelEntity` | `400` 能力不兼容；`404` 模型不存在 |
| DELETE | `/v1/sys/ai/models/:id` | `system:ai:delete` | 无 | `null` | `400` 仍被路由引用；`404` 模型不存在 |

## 功能路由

| Method | Path | Permission | Request | Success data | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| GET | `/v1/sys/ai/feature-routes` | `system:ai:read` | Query `featureCode?` | `AiFeatureRouteView[]` | `401`、`403` |
| POST | `/v1/sys/ai/feature-routes` | `system:ai:create` | `CreateAiFeatureRouteDto` | `SysAiFeatureRouteEntity` | `400` 协议/能力不兼容或优先级重复；`404` 渠道/模型不存在 |
| PUT | `/v1/sys/ai/feature-routes/:id` | `system:ai:update` | `UpdateAiFeatureRouteDto` | `SysAiFeatureRouteEntity` | `400` 优先级重复；`404` 路由不存在 |
| DELETE | `/v1/sys/ai/feature-routes/:id` | `system:ai:delete` | 无 | `null` | `404` 路由不存在 |

同一 `featureCode` 下 `priority` 唯一且数值越小越优先。渠道和模型必须使用完全相同的
`adapterCode`，不能把 Chat Completions 渠道绑定到 Responses 模型。

## 调用日志

| Method | Path | Permission | Request | Success data | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| GET | `/v1/sys/ai/call-logs/filter` | `monitor:aiCallLog:read` | 分页参数及 `featureCode?`、`capability?`、`status?`、`channelCode?`、`modelCode?`、`startedAt?`、`endedAt?` | `Pagination<AiCallLog>` | `401`、`403` |
| GET | `/v1/sys/ai/call-logs/stats` | `monitor:aiCallLog:read` | 同上（不含分页参数） | `AiCallLogStats` | `401`、`403` |

日志仅包含调用元数据（能力、功能、渠道、模型、状态、重试次数、耗时、Token 用量、请求 ID、用户 ID
和错误信息），不会保存 prompt、图片内容或渠道密钥。
