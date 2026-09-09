# C2C Backend Agent Rules

## 项目定位

- 本目录是单一 C2C Git 仓库中的后端 API 项目。
- 根目录 `projects.json` 中的稳定项目 ID 是 `backend`。
- 本仓库使用 `pnpm workspace`，包边界由 `pnpm-workspace.yaml` 管理。

## 开发规则

- 修改后端接口时，必须同步检查 DTO、Controller、Service、鉴权、错误码和接口文档。
- 如果变更会影响前端，必须同步检查 `projects/admin-web` 的 API 调用和类型适配。
- 不要在本仓库内引入 npm 或 yarn 锁文件；默认使用 `pnpm`。
- 不要把前端代码放进本项目；跨项目契约通过 DTO、OpenAPI、错误码和根级设计文档同步。

## 数据库迁移强制规则

- 受版本控制的应用运行配置必须保持 `synchronize: false`，禁止通过 TypeORM 自动同步代替迁移。
  仅允许不连接共享数据、用后即销毁的隔离测试数据库显式使用 `synchronize: true` 创建测试夹具。
- 新增或修改表、字段、索引、枚举、外键、唯一约束、检查约束时，必须同时提交
  `server/backend/apps/admin/database/migrations/` 下的版本化 `MigrationInterface`。
- 新迁移必须使用带 13 位时间戳的稳定名称，并按版本顺序登记到
  `server/backend/apps/admin/database/migrations/index.ts`；未登记的迁移视为未完成。
- 标准生产发布只能通过 `output` 中的 `migrate` 服务自动执行待迁移版本，禁止把手工执行
  `ops -- migrate-*` 写成常规部署前置步骤。
- `scripts/migrate-*.ts` 只能作为人工诊断适配器，必须复用正式迁移模块的实现；禁止复制 SQL、
  状态检查或校验逻辑。
- 每项迁移必须在同一事务中完成结构检查、变更和最终校验，成功后由 TypeORM 写入
  `schema_migrations`；禁止在应用启动过程中自行调用 `runMigrations()`。
- 新迁移必须增加隔离 PostgreSQL schema 集成测试，至少覆盖首次执行、结果校验和重复部署跳过。
- 长时间数据回填、外部请求和不可逆清理不得混入普通结构迁移。删除旧字段、旧表或旧枚举必须使用
  expand-contract 分阶段发布，并提供单独的运维确认步骤。
- 修改迁移架构、打包入口或 Compose 启动顺序时，必须验证
  `output/volumes/apps/migrate/main.js`、`output/compose.yaml` 和 `output.zip` 均已生成。
- 详细设计与新增迁移清单以 [doc/ops/database-migrations.md](doc/ops/database-migrations.md) 为准。

## 常用验证

```powershell
pnpm run lint:server
pnpm run typecheck:server
pnpm run build
pnpm run monorepo:check
```

涉及数据库迁移时还必须运行：

```powershell
pnpm --filter ./server/backend run test:integration
```
