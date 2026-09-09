# 后端测试策略

本文定义 C2C 后端测试分层、命令入口和新增测试时的边界。当前项目使用 NestJS、Jest、`@nestjs/testing` 和 Supertest。

## 1. 测试分层

| 层级 | 目录 / 命令 | 目标 | 依赖策略 |
| --- | --- | --- | --- |
| 单元测试 | `server/backend/apps/**/*.spec.ts` / `pnpm run test:server` | 验证 Service、helper、strategy 等业务逻辑 | mock 外部支付、数据库 manager、队列、网络 |
| 集成测试 | `server/backend/test/integration/**/*.spec.ts` / `pnpm --filter ./server/backend run test:integration` | 验证数据库、时区、ORM 映射等基础行为 | 使用明确测试数据库或跳过不满足环境的用例 |
| API/e2e contract 测试 | `server/backend/test/e2e/**/*.e2e-spec.ts` / `pnpm --filter ./server/backend run test:e2e` | 验证 HTTP 路由、DTO 校验、统一响应、错误包装、全局前缀 | 使用真实 Controller + mocked provider，不直接连接生产数据库 |

## 2. API/e2e contract 测试规范

API/e2e contract 测试不是端到端业务全链路测试。它的重点是接口契约：

- 路径必须包含生产一致的 `/v1` 全局前缀和 `RouterModule` 子路径。
- 请求必须经过生产一致的全局 `ValidationPipe`。
- 成功响应必须经过 `ResponseInterceptor`，保持 `code/msg/data/timestamp` 包装。
- 失败响应必须经过 `HttpExceptionFilter`，保持 `code/msg/timestamp/path` 包装。
- Controller 使用真实类，Service、数据库、支付网关、队列、缓存等 provider 使用 mock。

公共接口契约测试工具位于 `server/backend/test/e2e/helpers/admin-contract-test-app.ts`。新增管理端或业务接口时，应补充同类 contract 测试，至少覆盖：

- 一个成功响应。
- 一个 DTO 或 path/query/body 校验失败。
- 关键鉴权语义：Public、OptionalAuth 或 Bearer token 需求。
- 关键错误码：`400`、`401`、`403`、`404`、`429` 中与接口相关的部分。

## 3. 单元测试规范

单元测试覆盖稳定的业务规则，不测试私有实现细节。

- 优先测试公开方法和 helper 的可观察输出。
- 对支付网关、数据库、队列、缓存等外部适配使用 mock。
- 避免通过 `as any` 调用私有方法；如果只能这样测试，说明需要提炼更合适的公开测试 Interface。
- 复杂状态流转应使用表驱动测试覆盖合法流转和拒绝流转。

## 4. 文档与测试同步

修改接口时必须同步检查：

- DTO 校验规则。
- Controller 路由、鉴权装饰器和参数来源。
- Service 的错误语义。
- `doc/api/` 中对应接口文档。
- `test/e2e/` 中 API/e2e contract 覆盖。

修改公共启动管道、全局 filter/interceptor、错误包装时，必须运行：

```powershell
pnpm --filter ./server/backend run test:e2e
pnpm run lint:server
pnpm run typecheck:server
pnpm run test:server
pnpm run build
pnpm run monorepo:check
```

## 5. 后续补强方向

- 为 DB 写入型接口补充 Testcontainers 或专用测试库驱动的数据库级 e2e。
- 为认证、商家订单同步、支付回调、退款和取消订单补充 API/e2e contract 测试。
- 为每个 C2C 领域维护契约覆盖清单，并包含租户越权与幂等场景。
