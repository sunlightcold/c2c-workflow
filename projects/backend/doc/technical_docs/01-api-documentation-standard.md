# API 文档标准

本文档定义 `tpl-backend` 的 API 文档标准。`doc/api/` 下所有文档必须遵守本标准；后续新增、修改接口时禁止回到“只写路由清单”“只写 DTO 名”“重复堆错误示例”的旧格式。

## 标准来源

项目采用 **OpenAPI Specification (OAS / Swagger)** 的契约思路组织文档：

- 每个接口按一个 `Operation` 描述。
- 请求按 `path parameters`、`query parameters`、`headers`、`requestBody` 拆开。
- 响应按 `responses[statusCode]` 描述。
- 同一个 HTTP status code 在同一个接口里只能出现一次。

Markdown 文档是给前端和后端协作阅读的落地格式；字段、路由、认证、响应包装必须以真实代码为准。

## 真实代码来源

写 API 文档前必须核对以下代码，不允许凭经验猜：

- 路由：Controller 的 `@Controller()`、`@Get()`、`@Post()`、`@Put()`、`@Delete()`、RouterModule 前缀、全局 `app.setGlobalPrefix('v1')`。
- 请求：DTO、`@Param()`、`@Query()`、`@Body()`、`@UploadedFile()`、`@Headers()`。
- 认证：`@Public()`、`@Permission()`、`@User()`、Guard、第三方回调语义。
- 响应：`@Serialize()`、`@ApiResult()`、service 返回值、entity 返回值、e2e contract test。
- 包装：`ResponseInterceptor`、`HttpExceptionFilter`、`SkipResponseInterceptor()`。

## 目录归属

- `doc/api/main/`：`main` 分支公共平台、管理端、可复用 app 契约。
- `doc/api/registry.md`：API 文档注册表，必须能从控制器定位到文档。

`main` 分支不保存项目专属 API 文档。项目专属契约应在对应业务分支中维护，合并 `main` 后再补充。

## 单接口模板

每个接口必须使用下面的结构。字段未知时要写明“来源于 service/entity，代码当前未声明 DTO”，不能编造字段。

````md
### Operation: operationId

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/app/example` |
| Function | 一句话说明该接口给前端或调用方完成什么业务动作。 |
| Controller | `ExampleController.create` |
| Auth | `Public` / `Bearer token` / `Permission: xxx` |
| Rate limit | `5 / MINUTE` / `None` |
| Request DTO | `CreateExampleDto` |
| Success data | `ExampleResponseDto` / `ExampleEntity` / `void` |

#### Request

Headers:

| Name | Required | Description |
| --- | --- | --- |
| `Content-Type` | yes | `application/json` |

Body:

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | non-empty | 名称 |

#### Success Response

HTTP `200`，普通 JSON 接口由 `ResponseInterceptor` 统一包装：

| Field | Type | Description |
| --- | --- | --- |
| `code` | number | 固定 `200` |
| `data.id` | number | 示例业务字段 |
| `msg` | string | 固定 `success` |
| `timestamp` | string | ISO 时间 |

```json
{
  "code": 200,
  "data": {
    "id": 1
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

#### Error Responses

| HTTP Status | code | 场景 | msg 来源 |
| --- | ---: | --- | --- |
| 400 | 400 | 参数校验失败、请求体格式错误、必填字段缺失 | DTO validation / ValidationPipe |
| 401 | 401 | 未登录、token 无效或凭证错误 | Auth guard / service |
| 403 | 403 | 权限不足 | Permission guard |
| 429 | 429 | 请求频率超过限制 | Throttler / RateLimit |

```json
{
  "code": 400,
  "data": {},
  "msg": "字段错误消息",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/app/example"
}
```
````

## 响应包装规则

普通 JSON 成功响应：

```json
{
  "code": 200,
  "data": {},
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

普通 JSON 错误响应：

```json
{
  "code": 400,
  "data": {},
  "msg": "错误消息",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/app/example"
}
```

规则：

- 成功响应没有 `path`。
- 错误响应有 `path`，值来自 `request.url`，可能包含 query string。
- `void` 返回也会被包装，前端只依赖 `code` 和 `msg`。
- 文件流、第三方回调、明确 `SkipResponseInterceptor()` 的接口必须单独标注，不套用普通 JSON 示例。

## 错误响应去重规则

- 同一个接口中，同一个 HTTP status code 只能出现一次。
- 多个 `400` 场景必须合并到一个 `400 Bad Request` 表格行。
- 多个业务错误如果最终都是 `400`，用“场景”或“msg 来源”说明，不重复写多个 `400` 小节。
- 每个状态码最多保留一个主 JSON 示例；必要时用表格列出可能的 `msg`。

## 命名规则

- 文件名统一使用英文 `kebab-case`。
- 文件名要表达业务域，不使用 `api1.md`、`new-api.md`、`接口说明.md` 这类含糊命名。
- 分支归属通过目录体现，不靠文件名前缀猜测。
- `operationId` 使用稳定英文命名，格式建议为 `<scope><Domain><Action>`，例如 `appAuthLoginByEmail`。

## 维护流程

1. 先更新 Controller、DTO、Service、鉴权、错误语义。
2. 再更新 `doc/api/registry.md`。
3. 再更新对应业务域文档。
4. 最后补或调整 API/e2e contract test。
5. 文档提交必须和接口契约变更在同一分支完成；`main` 完成后再 merge 到 `app`。
