# 项目整体架构概述 (Architecture Overview)

本文档是针对 `tpl-backend` 项目从顶层架构视角的总体技术分析。项目采用 **Node.js** 环境下的 **NestJS** 框架为核心，运用了 Monorepo (单体多包) 架构理念管理应用和公共代码模块。

## 1. 核心技术栈

- **框架**: [NestJS](https://nestjs.com/) (v11 + Platform Express)
- **语言**: TypeScript (通过 SWC 和 Webpack 进行编译)
- **包管理器**: pnpm (应用 `pnpm workspace` 特性，定义在 `pnpm-workspace.yaml`)
- **包管理模式**: Catalog 功能（通过 `catalog:` 集中管理项目全部依赖版本，见 `pnpm-workspace.yaml` 中 `catalog` 块）。

## 2. 目录结构与隔离模式

该项目采用了嵌套层级式的 Monorepo，主要的业务层划分如下：

### 2.1 外层 Workspace ( `libs/` 和 `server/` )

在项目根目录下，`pnpm-workspace.yaml` 定义了 `libs/*` 和 `server/*` 均属于包管理范围。
- `libs/` 目录用于非直接业务相关的工具集（如 `@tpl-backend/build`, `@tpl-backend/utils`），与业务进行了解耦。
- `server/` 包含主服务 `backend`。

### 2.2 服务层 ( `server/backend/` )

所有 NestJS 相关的业务和公共组件均位于 `server/backend/` 下，其中包含一个完整的嵌套 Monorepo，受 `nest-cli.json` 控制。它主要划分为两大部分：

#### `apps/admin`
存放主应用程序（**Admin 核心业务**）。
作为微小隔离体的体现，它本身也可以被当成一个独立的服务。其中：
- `main.ts`: 整个应用的启动入口。
- 配置了全局通过的 Winston 日志记录仪（`nest-winston` `winston-daily-rotate-file`）。
- 定义了利用 `class-validator` 的全局 `ValidationPipe`。
- 定义了基于端口的环境启动（通过 `getConfig('admin')` 获取环境）。
- `app.module.ts`: 引入了系统的全部大模块，涵盖了请求拦截、缓存、Socket通信、事件系统、定时任务以及授权等领域。相关的子模块都在相对路径 `./modules` 下。

#### `common/`
用于管理整个后端域**可以复用的公共基础设施**，使得后续如果需要在 `apps/` 增加诸如 `apps/api` (前端接口应用) 时，可以共享这些轮子。
包括了：
- `decorators/`: 自定义装饰器
- `filters/`: 异常过滤器（例如 `main.ts` 中引入的 `HttpExceptionFilter`）
- `interceptors/`: 全局拦截器（例如 `ResponseInterceptor` 和 `LogInterceptor`）
- `middlewares/`: 全局中间件（请求 IP 处理跨度、Token 拦截等）
- `utils/`: 本地工具类集（如 `getConfig` 等）

## 3. 全局关键流程设计

### 3.1 启动引导 (Bootstrap) - `main.ts`

- 启用了源码追踪 (`source-map-support`)，便于定位报错。
- `Big.js`: 将全局金额/超大数值类的最大小数位限制为 2 (`Big.DP = 2`)，暗示项目存在精度敏感场景。
- **日志设计**: 摒弃 NestJS 自带普通控制台输出，改为利用内置集成 `typeorm` 与按天滚动文件归档(`app-YYYY-MM-DD.log`)结合方式。
- **接口约束与异常抛归**:
    - 所有 API 挂载在 `/v1` 路径下，说明有良好版本控制。
    - DTO (数据传输对象) 开通了 `whitelist: true`，拒绝一切未声明属性流入系统，通过转换生成自定义 `BadRequestException`。

### 3.2 模块聚合 (AppModule)

在根级 `AppModule` 中，聚合了以下高层级业务能力块：

- **系统核心 (`SystemModule`)**: 后台用户、角色、菜单权限、系统任务和可观测性能力。
- **任务调度 (`system/task`)**: 基于 `@nestjs/bullmq` / `bullmq` 开发的消息队列与计划任务，由 `SystemModule` 统一挂载到 `/v1/sys/tasks`。
- **访问控制 (`AuthModule`, `IThrottlerModule`)**: 整合身份鉴定、JWT签发拦截以及接口节流防刷控制。
- **通信 (`SocketModule`, `EventEmitterModule`)**: 提供长链接和模块间事件解耦触发能力。
- **数据与组件管理 (`DatabaseModule`, `CacheModule`, `BullMqModule`, `StaticModule`, `LoggerModule`)**: 连接外围环境（数据库、Redis 缓存、BullMQ 队列等）。

---
