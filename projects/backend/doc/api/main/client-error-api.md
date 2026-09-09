# main / Client Error API

归属分支：`main`

Client Error Event 是通用 Platform API。客户端匿名上报技术异常；后台管理员分页查询、查看详情和删除事件。事件默认从服务端接收时间起保留 30 天，由系统任务清理。

## 路由

| Operation | Method | Path | Auth |
| --- | --- | --- | --- |
| `clientErrorCreate` | `POST` | `/v1/client-errors` | Public，单 IP 每分钟 60 次 |
| `clientErrorFilter` | `GET` | `/v1/sys/client-errors` | `monitor:clientError:read` |
| `clientErrorGet` | `GET` | `/v1/sys/client-errors/:eventId` | `monitor:clientError:read` |
| `clientErrorDelete` | `DELETE` | `/v1/sys/client-errors/:eventId` | `monitor:clientError:delete` |

## 上报 Contract

必填字段：`eventId`、`appCode`、`environment`、`release`、`platform`、`level`、`source`、`message`、`occurredAt`。

可选字段：`errorType`、`stack`、`componentStack`、`route`、`feature`、`locale`、`sessionId`、`userRef`、`breadcrumbs`。`breadcrumbs` 最多 20 条，每条只包含 `category`、`message`、`timestamp`。

`platform`：`web`、`pwa`、`android`、`ios`、`desktop`。

`level`：`error`、`fatal`、`warning`。

`source`：`global`、`promise`、`react`、`network`、`worker`、`resource`、`caught`。

客户端不得上报请求体、Authorization、Cookie、密码、API Key、Base64、签名 URL 或私密项目内容。服务端使用 `eventId` 作为幂等键，重复提交不会新增记录。

```json
{
  "eventId": "00000000-0000-4000-8000-000000000201",
  "appCode": "magic-perler",
  "environment": "production",
  "release": "3a8e870c",
  "platform": "web",
  "level": "error",
  "source": "react",
  "errorType": "TypeError",
  "message": "Cannot read properties of undefined",
  "stack": "TypeError: ...",
  "route": "/zh/editor",
  "occurredAt": "2026-08-04T01:00:00.000Z"
}
```

成功响应的 `data` 为 `{ "eventId": string }`。DTO 校验失败返回统一 `400`；限流返回 `429`；管理员权限不足返回 `401/403`。

## 扩展规则

- 新客户端使用独立 `appCode` 接入，不需要新增后端模块或数据表。
- 新业务功能使用 `feature` 区分，并通过受限的 `breadcrumbs.category` 增加定位上下文。
- `platform`、`level`、`source` 是跨客户端受控词汇；只有出现新的通用语义时才升级 Contract、数据库约束和后台展示。
- 不接受任意 metadata 或请求上下文透传。新增结构化字段必须先明确查询价值、长度限制和脱敏规则。
