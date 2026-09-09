# API 路由注册表

| 业务组 | 控制器 | 主要路径 | 文档 |
| --- | --- | --- | --- |
| 认证与账号 | `system/auth`、`system/auth/account` | `/v1/auth/*` | [main/system-iam-api.md](main/system-iam-api.md) |
| 用户、角色、菜单、参数 | `system/user`、`system/role`、`system/menu`、`system/params` | `/v1/sys/*` | [main/system-iam-api.md](main/system-iam-api.md) |
| 日志、在线会话、任务 | `system/log`、`system/online`、`system/task` | `/v1/sys/*` | [main/system-ops-api.md](main/system-ops-api.md) |
| 客户端错误 | `client-error` | `/v1/client-errors`、`/v1/sys/client-errors` | [main/client-error-api.md](main/client-error-api.md) |
| 静态文件与 OSS | `static`、`oss`、`system/storage` | `/v1/static/*`、`/v1/oss/*`、`/v1/sys/storage/*` | [main/system-ops-api.md](main/system-ops-api.md) |
| AI 平台能力 | `system/ai` | `/v1/sys/ai/*` | [main/system-ai-api.md](main/system-ai-api.md) |

新增 Controller 时必须同步更新本表、对应契约文档和 contract test。
