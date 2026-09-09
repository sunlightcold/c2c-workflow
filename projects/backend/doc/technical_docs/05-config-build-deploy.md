# 配置、构建与部署 (Config, Build & Deploy)

本文说明 C2C 后端如何读取环境变量、构建和部署。

## 1. 运行配置环境变量 (Configurations)

框架没有采用原生硬编码去连接数据库，而是提供了一套基于环境的注入方案：

- 所有配置位于 `server/backend/config/`，基于具体的 `NODE_ENV` 载入。
- 例如 `development.ts` 与 `production.ts`。系统内通过自定义的 `getConfig('admin')` 方法去获取指定块。

主要涵盖的配置快照：

- **`common`**: 系统超管预置信息 (`superAdminUid`, `superAdminPassword` 等)。
- **`admin`**: 此模块独有设定。如启动端口 (`port: 3000`)、各种时长设置 (JWT Token过期时间, 图形验证码过期时间)、限流器阈值 (`throttlerLimit`)，以及外部连接核心 —— **Database** (PostgreSQL) 与 **Redis** 配置。

对象存储、AI 和后续 C2C 渠道凭据保存在数据库，但密文依赖 `C2C_CREDENTIAL_MASTER_KEY` 对应的 `admin.credentialMasterKey`。开发和生产必须使用不同随机值；轮换主密钥时必须提供密文迁移，不能直接覆盖配置。

生产配置不提供 Secret 默认值。`C2C_SUPER_ADMIN_PASSWORD`、数据库连接、Redis URL 和凭据主密钥缺失时必须快速失败。

## 2. 脚本运行与构建模式 (Build Scripts)

项目的任务流被集中定义在最外层的 `package.json` 及 `server/backend/package.json` 中：

### 2.1 高效开发模式

由于项目使用了较新的工具链，NestJS 项目除了传统的 `tsc` 编译监视外，它还通过依赖配置了基于 **Webpack HRMR (热更新)** 亦或者是类似快速编译器(`swc`)。在 `main.ts` 结尾存在一段显式的 HMR 代码：

```typescript
if (module.hot) {
  module.hot.accept()
  module.hot.dispose(() => app.close())
}
```

结合外围的 `pnpm dev:server` 命令，使得代码更改后的重编速度与服务重启速度大幅度增强。

### 2.2 打包 (Build)

- 运行 `pnpm build` 时会构建后端应用和发布包。
- 发布包同时包含 `apps/admin/main.js` 和 `apps/migrate/main.js`，分别用于提供 API 和执行
  版本化数据库迁移。

## 3. 生产环境部署方案 (Deploying)

为了保障业务在真实的 Linux Server/云容器中高可用运行，该项目同时提供了**宿主机直接运行 (PM2)** 与 **容器化部署 (Docker)** 两套完善指南。

### 3.1 PM2 多核集群部署

项目根目录提供了 `pm2.config.js`，这是专给运维进程管理器 [PM2](https://pm2.keymetrics.io/) 准备的脚本。

- **启动路径**: 指向构建后的 `dist/apps/admin/main.js`。
- **性能伸缩**: `exec_mode: 'cluster'`。借助 Node.js Cluster 能力压榨机器多核性能，使得流量压力自动在主进程中均衡到多子进程。
- **自愈恢复**: 内置遇到崩溃时的自动退出与重启检测。通过自定义不同指令，挂载不同 `NODE_ENV` 环境变量。

### 3.2 Docker 容器化编排

如果在 Kubernetes 或单机 Docker 引擎上部署，`docker/` 目录下备有标准的云原生材料：

#### Dockerfile

- 使用 Node.js 22 和锁定版本的 pnpm 进行多阶段构建。
- Builder 同时编译 `admin` 和 `migrate`，再生成只包含生产依赖的运行目录。
- Runner 直接以 `node dist/apps/admin/main.js` 启动。进程重启交给 Docker，容器内不再叠加 PM2。
- `server/backend/config/production.ts` 不进入 Docker 构建上下文；生产配置由服务器只读挂载。

#### Docker Compose (`compose.yaml`)

编排固定保持以下启动顺序：

1. **`postgres` 服务**：启动 PostgreSQL 16，并通过 `pg_isready` 提供迁移前健康检查。
2. **`migrate` 服务**：数据库就绪后使用发布镜像执行全部待运行迁移，完成后正常退出。
3. **`redis` 服务**：启动固定版本 Redis 并通过健康检查确认可用。
4. **`app` 服务**：只有迁移成功且 Redis 健康后才启动。

Compose 从 `.env` 读取镜像、宿主机端口和基础设施凭据。应用代码与 `initJson` 固化在镜像内，禁止再用宿主机目录覆盖；服务器只挂载生产配置、日志和持久化数据。

#### GitHub Actions

容器基础设施在 `main` 维护并合并到 `app`。镜像工作流只接受 `app` 分支：

- `app-latest`：当前 `app` 分支最新成功构建；
- `app-<commit SHA>`：不可变版本，用于发布审计和精确回滚。

工作流先执行 lint、TypeScript 检查、测试和 workspace 检查，全部通过后才构建并推送 GHCR 镜像。服务器更新使用：

```bash
docker compose pull
docker compose up -d
```

迁移版本记录在 PostgreSQL 的 `schema_migrations` 表中，已经成功执行的版本不会重复运行。

---
