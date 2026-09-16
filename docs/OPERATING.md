# C2C 单仓库执行手册

目标：让开发者和 AI 在单一 Git 仓库内准确选择项目、契约、Skill 与验证命令。

## 1. 仓库结构

```text
c2c-workflow/                         # 唯一 Git 仓库
  projects.json                       # 项目、依赖和标准命令
  skills.json                         # 本地 Skills 声明
  skills.lock.json                    # Skill 来源提交锁
  AGENTS.md                           # 根级强制规则
  C2C-Workflow.code-workspace         # VS Code 多根目录视图
  docs/                               # 需求、设计和 ADR
  scripts/                            # 状态、执行、验证、Skill 同步
  .codex/skills/                      # 可追踪的仓库本地 Skills
  projects/
    backend/                          # NestJS 后端项目
    admin-web/                        # Vue/Vben 管理后台项目
  templates/                          # 临时、只读、Git 忽略的参考代码
```

根 Git 直接跟踪 `projects/backend` 和 `projects/admin-web`。两者各自保留原 pnpm workspace 与锁文件，但都不得包含嵌套 `.git`。根目录不再创建额外的包管理 workspace。

## 2. 每次任务入口

1. 读取 `projects.json` 与 `skills.json`。
2. 读取 `AGENTS.md` 和本手册。
3. 完整读取目标项目绑定且与任务相关的 `SKILL.md`。
4. 读取目标项目的 `AGENTS.md`、README、包清单及相关契约。
5. 运行 `./scripts/Repo-Status.ps1`，确认现有修改。
6. 判断是根级、单项目、跨项目、契约、数据迁移还是基础设施任务。

## 3. 项目命名与职责

| 项目 ID | 路径 | 职责 |
| --- | --- | --- |
| `backend` | `projects/backend` | RBAC、任务、商家、订单、支付、Telegram 和外部平台接入 |
| `admin-web` | `projects/admin-web` | 平台与代理商后台管理界面 |

项目 ID 是脚本和文档中的稳定名称。`templates/*` 不属于项目清单，不参与构建、提交或发布；其中的 `pfa-pay` 仅用于流程与字段研究。

## 4. 默认研发流程

跨前后端功能按以下顺序：

1. 需求与验收：角色、租户范围、状态机、幂等、异常和审计。
2. 契约：API、DTO、错误码、权限码、金额/时间格式、分页和兼容策略。
3. 后端：Migration、Entity、Repository、Service、Controller、任务 Handler 和测试。
4. 前端：API Client、类型、动态菜单、权限按钮、页面状态和错误展示。
5. 集成：最小业务路径、越权路径、重复请求、外部超时和恢复路径。
6. 验证与交接：按项目记录命令、结果、未覆盖风险和发布顺序。

## 5. 标准命令

```powershell
.\scripts\Start-Local.ps1
.\scripts\Start-LocalInfra.ps1
.\scripts\Test-Workflow.ps1
.\scripts\Test-Secrets.ps1
.\scripts\Repo-Status.ps1
.\scripts\Invoke-Project.ps1 -List
.\scripts\List-Skills.ps1
.\scripts\Invoke-Project.ps1 -Project backend -Command lint
.\scripts\Invoke-Project.ps1 -Project admin-web -Command typecheck
```

### Windows 本地启动

Windows 本地开发固定使用 WSL2 内的 Docker Engine。先运行
`.\scripts\Start-Local.ps1` 一键启动并探测 `c2c-postgres-dev`、`c2c-redis-dev`、后端、Mock 和管理后台。
在 Git Bash 中使用：

```bash
./scripts/start-local.sh
```

脚本把进程信息和日志写入根目录 `.runtime/`；已健康运行的服务会跳过，固定端口被其他进程占用时会停止并明确报错。
全部服务就绪后，当前终端默认持续显示后端的标准输出和错误日志；按 `Ctrl+C` 只停止日志跟随，后台服务继续运行。
CI 或其他脚本只需完成启动、不需要持续跟随日志时使用：

```bash
./scripts/start-local.sh -NoFollowLogs
```

只需启动基础设施时使用 `.\scripts\Start-LocalInfra.ps1`。不要调用 Windows Docker CLI，也不要连接 Windows 原生 PostgreSQL/Redis 服务。
PostgreSQL 与 Redis 数据固定保存在 `E:\software\develop\docker-volumes\c2c-workflow`，不得改用 C 盘目录或 Docker 命名卷。

固定端口为：后端 `13001`、Mock `13002`、管理后台 `15666`、容器 PostgreSQL `15433`、容器 Redis
`16380`。后端必须用 `http://127.0.0.1:13001/v1/auth/captcha` 的真实响应验收，不能只检查监听端口。

`Invoke-Project.ps1` 只执行 `projects.json` 中的参数数组，不解析任意命令字符串。

## 6. 验证矩阵

后端默认顺序：`lint -> typecheck -> test -> build -> workspaceCheck`。涉及数据库结构时追加 `testIntegration` 和迁移链验证。

前端默认顺序：`lint -> typecheck -> test -> build`。涉及核心流程时追加 `testE2e` 和桌面/移动视口检查。

根级工作流变更至少执行：

```powershell
.\scripts\Test-Workflow.ps1
.\scripts\Invoke-Project.ps1 -List
.\scripts\List-Skills.ps1
.\scripts\Repo-Status.ps1
```

## 7. C2C 专项门槛

- RBAC 同时校验功能权限和资源范围，不能分别求并集。
- 所有代理商业务表和队列上下文携带 `tenantId`；商家数据同时携带 `merchantId`。
- 订单、支付和批次状态迁移必须幂等并写状态历史；资金请求超时进入 `UNKNOWN` 后先回查。
- OKX Cookie 私有接口使用独立 Worker、白名单 Origin、Secret 引用、会话熔断和契约测试。
- Telegram 最终确认时重新鉴权；Bot、群、成员和超级管理员范围不得跨租户。
- 用户 App 域不进入目标系统。

## 8. Git 与发布

- 只能从根目录提交和推送，`projects/*` 不单独执行 Git 操作。
- 一个功能提交应包含可兼容的后端契约、前端适配和必要文档；大型变更按可独立验证的阶段拆分。
- 后端仍应先提供向后兼容契约，再发布依赖该契约的前端。
- 破坏性数据库修改使用 expand-contract，不因单仓库而合并发布步骤。
- `templates/*` 始终不进入 Git；确认参考价值已迁移到文档或测试后可整体删除。

## 9. 最终交付格式

交付必须说明：修改的项目、契约和行为变化、执行的验证、未运行项及原因、迁移/发布顺序和残余风险。
