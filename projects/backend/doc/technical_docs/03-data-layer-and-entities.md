# 数据层与实体模型 (Data Layer & Entities)

本文档旨在介绍 `tpl-backend` 项目中的数据存储方案、ORM 配置以及最核心的实体数据关系。

## 1. 数据库基建与 ORM 设置

项目选型了成熟的 **TypeORM** 作为对象关系映射工具，底层数据库明确指出使用的是 **PostgreSQL**。

### 1.1 `DatabaseModule` 挂载
在 `apps/admin/database/database.module.ts` 中，通过 `TypeOrmModule.forRoot()` 进行了全局数据源的注册。核心配置 (host, port, username, 等) 都是在启动时根据部署环境由 `getConfig('admin').postgres` 动态载入的。

同时，为了保证多模块加载实体的简易性，这里启用了 `autoLoadEntities: true`，并通过 `TypeOrmModule.forFeature(pgEntities)` 将所有内部表(如用户表、角色表、菜单表、任务关联表、文件表等) 一次性注入了上下文。

### 1.2 缓存增强
除了关系型数据库进行长久的数据落盘之外，系统大量引入了 `@nestjs/cache-manager` 以及 Redis (`@keyv/redis`)，并在 Guard 和某些数据聚合服务中（例如防重放的 UUID Guard）直接操作 Redis，起到了提速和校验减负的作用。

## 2. 基础实体抽象层 (Base Entities)

为了规范字段行为并降低重复代码，开发者在 `common/entities/` 下定义了一系列强大的抽象基类。所有真实的业务 Entity 统一继承这些基类以获得系统字段：

- **`TimestampEntity`**: 注入 `createdAt` 和 `updatedAt` 的时间戳字段。
- **`CommonEntity` / `CommonUuidEntity`**: 在时间戳之上，增加数字自增主键 (`id: number`) 或 UUID 字符主键 (`id: string`) 的提供。
- **`TraceableEntity`**: 更深一层的追踪抽象。增加了 `createBy` 和 `updateBy`，这两个字段可以由后续针对登录用户的全局订阅器或者特定 Service 在执行录入和修改时自动塞入操作者的 ID，以达到审计(Audit) 的目的。

## 3. 核心业务实体分析 (RBAC 模型)

在 `apps/admin/database/system` 中，存放了构成系统管理后台的表。这里以最核心的 **RBAC (基于角色的访问控制)** 实体切入说明表关系。

### 3.1 `SysUserEntity` (`sys_user` 用户表)
- **基类**: 继承自 `TraceableEntity`。
- **核心字段**: `username`, `password`, `salt` (独立盐值，意味着采用加盐哈希), `status` (启用/禁用), `avatar`, `isOtpEnabled` (支持动态口令)。
- **关联**: 通过 `@ManyToMany` 关联了 `SysRoleEntity`。定义中间表为 `sys_user_role`。这意味着该系统允许多角色赋予多用户。

### 3.2 `SysRoleEntity` (`sys_role` 角色表)
- **核心字段**: `value` (角色标识，通常用于代码级别的硬比对如 `admin`, `guest`), `name` (角色名称显示用), `status`。
- **关联**: 同样采用 `@ManyToMany`。除了与上面的 User 双向管理外，它往另一端连接了 `SysMenuEntity`。中间表名为 `sys_role_menu`。

### 3.3 `SysMenuEntity` (`sys_menu` 菜单与权限表)
此表极其关键，因为它既承载着左侧导航菜单，又承载着页面按钮级别的权限点(`sys_menu` 表结构常作为树形折叠树使用)。
- **系统注册字段**: `key` 是代码注册表维护的稳定标识，`source` 区分 `system` 内置菜单和 `custom` 用户自定义菜单，`locked` 用于禁止后台接口手动修改系统菜单结构，`managedHash` 用于识别代码定义变化。
- **核心字段**: `parentId` (树形依赖的核心), `name`, `path` (路由地址), `component` (前端组件地址), `permission` (用于后端 `@Permission()` 装饰器防守的关键字符串，如 `system:user:read`)。
- **类型细分 `type`**: 采用枚举 `SysMenuType`：
    - `FOLDER`: 目录（无实体页面，只展平下级）
    - `MENU`: 页面菜单
    - `PERMISSION`: 细粒度按钮级权限点
    - `EMBED`: 内嵌 iframe 外链
- 其与 `SysRoleEntity` 处于通过引用的多对多级联关系中。
- **默认数据来源**: 系统默认菜单不再通过旧 JSON 种子文件按名称插入，而是由 `MenuRegistryService` 根据 `registry/default-admin-menus.ts` 在启动时幂等同步。开发阶段如果需要清理旧脏数据，可直接执行维护脚本 `pnpm --dir server/backend exec cross-env NODE_ENV=development ts-node --transpile-only -r tsconfig-paths/register scripts/reset-admin-menus.ts`，该脚本会清空全部菜单和 `sys_role_menu` 关联后按注册表重建。数据维护脚本不注册到 `package.json`。

### 3.4 `SysParamsEntity` (`sys_params` 系统参数表)
此表用于保存可由后台查看和修改的运行期参数，不承载数据库连接、密钥、支付证书等部署级配置。
- **系统注册字段**: `source` 区分 `system` 内置参数和 `custom` 自定义参数，`locked` 用于禁止后台接口修改系统参数结构。
- **核心字段**: `name`, `key`, `value`, `type`, `description`。
- **默认数据来源**: 系统内置参数由 `ParamsBootstrapService` 在启动时注册。目前唯一内置参数是 `staticServerUrl`，用于本地静态资源服务的公开访问域名，和 OSS 配置无关。

## 4. 辅助数据模块概览
除此之外，`admin/database/system` 还收纳了：
- **`SysLogEntity` / `SysTaskLogEntity`**: 日志聚合实体。分别记录用户接口操作轨迹日志和计划任务执行的抛出结果日志。
- **`SysOnlineUserEntity`**: 用于跟踪实时在线会话和用户。
- **`SysUserFileEntity` / `SysStaticFileEntity`**: 用来将系统中上传的文件通过文件指纹、URL及拥有者 ID 在数据库落盘进行管理和关联，而非单纯扔在对象存储中不管。

---
