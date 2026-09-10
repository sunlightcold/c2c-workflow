# 数据库迁移

开发和生产应用配置保持 `synchronize: false`。表、字段、索引和约束变更必须实现为
`server/backend/apps/admin/database/migrations/` 下的 TypeORM migration，并登记到同目录
`index.ts`。

## 仓库归属

- 迁移 runner、注册表、数据库配置和业务 migration 都由根 Git 仓库跟踪。
- 后端迁移仅放在 `projects/backend/server/backend/apps/admin/database/migrations`。
- 跨前后端功能先稳定后端迁移与 API 契约，再接入 `projects/admin-web`。

## 部署执行

`pnpm run build:libs` 会同时生成：

- `output/volumes/apps/admin/main.js`
- `output/volumes/apps/migrate/main.js`

服务器覆盖 `output` 后只执行：

```bash
docker compose up -d --build
```

Compose 会等待 PostgreSQL 健康检查通过，启动一次性 `migrate` 服务，再在迁移成功后启动
`app`。迁移执行失败时 `migrate` 返回非零退出码，`app` 不会启动新版本。

迁移 runner 在一个进程中初始化一次数据库连接池，并持有 PostgreSQL advisory lock。每个待执行
版本使用独立事务完成结构检查、变更和结果校验；成功后由 TypeORM 写入
`schema_migrations`。已登记的版本不会再次执行。

## 新增迁移

1. 使用带 13 位时间戳的类名实现 `MigrationInterface`。
2. 在 `migrations/index.ts` 按版本顺序登记。
3. `up()` 在同一事务内完成迁移并校验最终结构。
4. 添加临时 PostgreSQL schema 集成测试，验证首次执行和重复执行。
5. 不在普通迁移中执行长时间回填或不可控的外部请求。

## 禁止事项

- 禁止把开发或生产应用配置的 `synchronize` 改为 `true` 解决缺表或缺字段问题；仅允许用后即销毁、
  不连接共享数据的隔离测试数据库使用它创建测试夹具。
- 禁止只新增 Entity 而不新增并登记 migration。
- 禁止在 Controller、Service、Module 生命周期或应用 `main.ts` 中执行迁移。
- 禁止为自动迁移和人工诊断命令维护两份 SQL。
- 禁止依赖开发电脑直连生产数据库执行常规发布迁移。
- 禁止把长时间数据回填、HTTP 请求、R2 操作或消息队列消费放入结构迁移事务。
- 禁止在新增替代结构的同一次发布中删除旧结构；破坏性清理必须延后到独立版本。

## 验收清单

涉及数据库结构的任务未满足以下条件时不得声明完成：

1. Entity 与 migration 同时提交，迁移已登记到 `migrations/index.ts`。
2. migration 与数据模型位于同一后端项目边界。
3. `synchronize` 仍为 `false`。
4. 隔离 PostgreSQL schema 测试验证首次执行和最终结构。
5. TypeORM 迁移链测试验证 `schema_migrations` 记录版本且第二次执行返回零项。
6. `lint:server`、`typecheck:server`、`test:server`、`test:integration` 和 `build` 通过。
7. `output/volumes/apps/migrate/main.js` 与 `output/compose.yaml` 已检查。

## C2C 迁移顺序

1. `C2cBusinessFoundation1789000000000`：所属单位、商家和支付配置。
2. `C2cPaymentOrders1789001000000`：支付订单、支付尝试和状态历史。
3. `C2cPaymentRouting1789002000000`：待配置状态、可空路由快照、支付方式和执行方式。
4. `C2cMerchantPlatformCredentials1789003000000`：按商家隔离、单版本生效的平台凭据引用。
5. `C2cMerchantOrders1789004000000`：买币商家订单、状态历史和每商家同步检查点。
