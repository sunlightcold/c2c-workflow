# C2C Merchant Backoffice

本仓库用于开发币安、欧易（OKX）C2C 商户后台，并沉淀需求、系统设计和可追踪的开发工作流。

项目采用单一 Git 仓库模式：后端和管理后台分别位于 `projects/backend`、`projects/admin-web`，由根仓库统一跟踪、评审和提交。两个项目继续使用各自的 pnpm workspace 和锁文件。

## 开发入口

- [执行手册](docs/OPERATING.md)
- [根级 Agent 规则](AGENTS.md)
- `projects.json`：项目、依赖、写入策略和标准命令
- `skills.json` / `skills.lock.json`：工作区 Skills 与来源提交锁
- `C2C-Workflow.code-workspace`：VS Code 多根工作区

```powershell
.\scripts\Test-Workflow.ps1
.\scripts\Test-Secrets.ps1
.\scripts\Repo-Status.ps1
.\scripts\Invoke-Project.ps1 -List
.\scripts\List-Skills.ps1
```

## 当前文档

- [管理层版：C2C 商户运营管理平台需求说明书](docs/c2c-backoffice-business-requirements.md)
- [V2：基于 tpl-backend / tpl-frontend 的实施需求与系统设计](docs/c2c-backoffice-template-based-design-v2.md)
- [V1：通用产品需求与系统设计（历史参考）](docs/c2c-merchant-backoffice-requirements.md)

## 项目

- `projects/backend`：C2C 平台后端，来源基线为 `tpl-backend` 提交 `a8ec0a9dd84eea1f521a631343825544dbc42731`
- `projects/admin-web`：C2C 管理后台，来源基线为 `tpl-frontend` 提交 `9c54d39a6b67be30129655734ee7a3d840e13712`

## 临时参考

- `templates/tpl-backend`
- `templates/tpl-frontend`
- `templates/pfa-pay`

`templates/*` 被根 Git 忽略，不属于构建和发布范围，待参考完成后删除。模板中的用户 App、商品、价格方案、积分、App 交易订单等模块不属于 C2C 后台范围；`pfa-pay` 中的 MongoDB 模型、认证和密钥存储、单进程机器人运行方式及跨模块耦合不会直接照搬。
