# API 文档总览

这里存放后端 HTTP 契约文档。文档采用 OpenAPI Operation 的组织方式，用 Markdown 输出给前端和后端协作阅读。

## 强制规范

- 写接口前必须核对真实 Controller、DTO、RouterModule、全局响应拦截器和异常过滤器。
- 每个接口必须写清楚 Method、Path、Controller、Auth、Request、Success Response、Error Responses。
- 普通 JSON 成功响应必须展示完整包装体，不能只写 `data`。
- 普通 JSON 错误响应必须展示完整包装体，且同一个接口中同一个 HTTP status code 只能出现一次。
- 多个 `400`、`401`、`403`、`429` 场景必须合并到同一个状态码下，用“场景”和“msg 来源”说明。
- 代码没有声明响应 DTO 时，文档必须标注返回来源是 service/entity，不能凭空补字段。

完整写作标准见 [../technical_docs/01-api-documentation-standard.md](../technical_docs/01-api-documentation-standard.md)。

## 通用响应格式

普通 JSON 接口成功响应由 `ResponseInterceptor` 包装：

```json
{
  "code": 200,
  "data": {},
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

普通 JSON 接口错误响应由 `HttpExceptionFilter` 包装：

```json
{
  "code": 400,
  "data": {},
  "msg": "错误消息",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/sys/example?foo=bar"
}
```

前端读取规则：

- 成功业务数据：`response.data.data`
- 成功状态码：`response.data.code`
- 成功消息：`response.data.msg`
- 错误提示：`response.data.msg`
- 错误路径：`response.data.path`
- 认证头：`Authorization: Bearer <accessToken>`

## 文档目录

- [main](main/README.md)：当前管理端和平台契约。
- [C2C 业务配置](main/c2c-business-config.md)：所属单位、商家、支付账号、账号通道和支付方案。
- [registry.md](registry.md)：API 路由注册表。

## Contract Test

API/e2e contract 测试位于 `server/backend/test/e2e/`，用于验证路由、DTO 校验、统一响应包装和错误语义。新增或修改接口时，必须同步检查对应 API 文档和 contract test。
