# C2C Repository Agent Rules

默认执行手册：[docs/OPERATING.md](docs/OPERATING.md)。本文件只保留不可违反的根级规则。

## 工作区定位

- 本项目是单一 Git 仓库，根目录统一跟踪工作流、文档、Skills、后端和管理后台代码。
- `projects/backend` 是 C2C 后端项目，内部保留自己的 pnpm workspace 边界。
- `projects/admin-web` 是 C2C 管理后台项目，内部保留 Vben/pnpm/Turbo workspace 边界。
- `templates/*` 仅为临时只读参考，始终由根 `.gitignore` 排除，后续可整体删除。
- 根目录不建立第三个 pnpm workspace，也不提升或合并两个项目的业务依赖。

## Windows 本地开发环境（不可违反）

- 本仓库在 Windows 主机上的容器运行时固定为 WSL2；所有 Docker/Compose 命令必须通过
  `wsl.exe` 执行。Windows `PATH` 中找不到 `docker.exe` 不代表 Docker 不可用。
- 本地 PostgreSQL 与 Redis 只能使用 WSL 容器 `c2c-postgres-dev`、`c2c-redis-dev`，宿主机端口
  固定为 `15433`、`16380`。禁止回退到 Windows 服务的 `5432`、`6379`，也禁止临时启动原生或
  其他数据库实例替代容器。
- 启动后端前必须先运行 `scripts/Start-LocalInfra.ps1`。不得通过修改 `C2C_POSTGRES_PORT` 或
  `C2C_REDIS_URL` 绕过容器检查。
- “后端启动成功”的判据是 `GET /v1/auth/captcha` 返回成功响应，且启动日志不存在数据库或 Redis
  连接错误；仅端口监听、进程存在或根路径返回 404 均不算成功。

## 固定读取顺序

1. 读取 `projects.json`，确认项目路径、依赖和标准命令。
2. 读取 `skills.json`，确认相关项目绑定的本地 Skills。
3. 读取本文件与 `docs/OPERATING.md`。
4. 完整读取相关 Skill 的 `SKILL.md`。
5. 读取目标项目目录的 `AGENTS.md`、README、包清单和契约入口。
6. 运行 `scripts/Repo-Status.ps1` 或检查目标路径状态，保留用户已有改动。

## 项目边界

- 单项目任务只修改对应 `projects/*` 项目和必要的根级契约文档。
- 跨项目功能先定义 API、DTO、错误码、鉴权、金额/时间格式和兼容策略，再实现后端与前端。
- `pfa-pay` 只提供领域流程和协议字段参考；不得照搬其 MongoDB 模型、明文 Secret、MD5 密码、跨租户权限或单进程机器人架构。
- 模板中的用户 App、商品、积分、价格方案和 App 订单模块不属于本系统，禁止基于它们扩展 C2C 业务。
- OKX 网页 Cookie 私有接口必须隔离在 `OKX_WEB_PRIVATE` Adapter，不得扩展为模拟登录、验证码绕过或任意 URL 请求。

## 标准开发顺序

1. 明确任务类型和涉及仓库。
2. 契约优先，先写验收条件和失败语义。
3. 后端实现 DTO、Controller、Service、迁移、测试和接口文档。
4. 前端实现 API Client、类型、权限、页面和异常状态。
5. 按 `projects.json` 执行最小验证，再执行完整验证。
6. 分仓库汇总变更、验证和风险。

## 安全与质量

- 所有租户业务查询必须显式约束 `tenantId`；商家资源同时约束 `merchantId`。
- 金额使用 Decimal 和字符串传输，外部 ID 使用字符串。
- Secret 不得写入 Git、日志、任务参数或 API 查询响应。
- 数据库结构变更必须使用 TypeORM migration，生产保持 `synchronize: false`。
- 系统任务使用服务端 `taskCode` 注册表，禁止客户端输入 `Service.method`。
- 不使用 `Invoke-Expression` 执行项目清单中的命令。
- 不回滚、不覆盖用户已有改动，不使用破坏性 Git 命令。

## 提交边界

- 根文档、后端、前端属于同一提交历史；提交仍应按逻辑保持小而完整。
- 跨项目功能推荐在一个提交中包含兼容的后端契约、前端适配和必要文档；大型变更可按可独立构建的阶段拆分。
- 只能从根仓库执行提交和推送；`templates/*` 的上游远端不属于产品发布链路。
