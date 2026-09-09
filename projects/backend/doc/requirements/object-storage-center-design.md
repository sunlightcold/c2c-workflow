# 对象存储中心需求与设计

## 1. 文档状态

- 状态：第一阶段已实现，作为 C2C 后台可选平台能力保留
- 归属：`projects/backend`

## 2. 需求概述

系统需要支持多个 S3-compatible 对象存储渠道。后台管理员可以维护渠道配置，并为系统中不同的存储用途选择绑定渠道。业务模块只能通过统一的对象存储服务访问渠道，不能自行读取 endpoint、bucket 或密钥。

“S3 存储管理”在平台层统一命名为“对象存储中心”。S3 是当前支持的协议类型，Cloudflare R2、MinIO 和其它兼容 S3 API 的服务都通过同一套适配器接入。

## 3. 已确认范围

### 3.1 第一阶段必须支持

1. 后台维护多个对象存储渠道。
2. 渠道连接测试、启用、停用和凭据轮换。
3. 按存储用途绑定渠道，而不是按整个业务模块绑定。
4. 统一上传、预签名直传、私有下载签名、读取、校验、复制和删除能力。
5. 已写入对象保存所属渠道和对象 key，绑定变更不影响历史对象。
6. 公共 System 域 API、权限、数据库迁移、后台管理页面和接口文档。
7. 将现有固定 OSS 配置和重复的 S3 操作逐步收敛到统一执行器。

### 3.2 明确不做

- 后台对象文件浏览器或通用文件管理器。
- 跨渠道对象迁移、复制计划或批量搬迁。
- 自动故障切换、隐式默认渠道和静默回退。
- 多渠道复制、双写和跨渠道同步。
- 将用户自带 S3 存储并入平台渠道管理。

## 4. 领域模型

### 4.1 存储渠道（Storage Channel）

代表一个可连接的 S3-compatible bucket。渠道包含连接地址、访问凭据和公开访问地址，但不描述具体业务用途。

### 4.2 存储用途（Storage Purpose）

代表一个明确的业务写入场景，由代码注册并拥有安全策略。用途不能由后台任意创建，避免管理员把私有对象错误绑定到公开渠道。

首批用途示例：

- `system.avatar`
- `system.tutorial-image`
- 后续业务用途由所属 C2C 模块通过代码注册

一个业务模块可以拥有多个用途；用途可以拥有不同的公开性、生命周期、key 前缀和文件限制。

### 4.3 用途绑定（Storage Binding）

代表一个用途当前写入的渠道。每个用途只能绑定一个渠道，渠道可被多个用途使用。

### 4.4 对象引用（Storage Object Reference）

已写入对象必须由业务记录保存：

```text
storageChannelId + objectKey
```

完整 URL 只能作为展示结果，不能作为对象的唯一定位信息。读取和删除历史对象时使用对象记录中的渠道，不重新按当前用途绑定解析。

## 5. 系统边界

```text
业务模块
  -> StorageService（用途、对象 key、内容）
  -> StorageBindingResolver（用途绑定解析）
  -> StorageChannelService（渠道和凭据）
  -> S3ObjectGateway（AWS SDK v3）
  -> AWS S3 / Cloudflare R2 / MinIO / 其它 S3-compatible 服务
```

### 5.1 后端平台层

`projects/backend` 提供 `StorageModule`、渠道实体、用途绑定、统一执行器、后台接口和权限。业务模块只注册自己的用途并通过统一服务读写对象。

### 5.2 后台管理层

`projects/admin-web` 提供“系统管理 / 对象存储”页面，消费平台 API。页面不显示任何 secret，也不直接调用 S3。

## 6. 数据结构

### 6.1 `sys_storage_channel`

建议字段：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键 |
| `code` | 稳定唯一编码，供日志、迁移和运维引用 |
| `name` | 后台展示名称 |
| `provider` | 当前为 `s3_compatible` |
| `endpoint` | S3 API endpoint |
| `region` | S3 region，R2 默认 `auto` |
| `bucket` | bucket 名称 |
| `publicBaseUrl` | 可选的公开访问基础地址 |
| `forcePathStyle` | 是否使用 path-style 请求 |
| `accessKeyId` | 访问标识，不作为 secret 返回 |
| `encryptedSecretAccessKey` | 使用独立主密钥加密 |
| `credentialVersion` | 凭据轮换版本 |
| `status` | `active`、`disabled`、`error` |
| `lastCheckedAt` | 最近连接测试时间 |
| `lastCheckMessage` | 脱敏后的测试结果 |
| `createdAt/updatedAt` | 审计时间 |

### 6.2 `sys_storage_binding`

建议字段：

| 字段 | 说明 |
| --- | --- |
| `purposeCode` | 用途注册表中的稳定编码，唯一 |
| `channelId` | 绑定的渠道，外键关联 `sys_storage_channel` |
| `keyPrefixOverride` | 可选的安全对象前缀覆盖值；为空时使用用途默认前缀 |
| `updatedBy` | 修改绑定的后台用户 |
| `updatedAt` | 修改时间 |

第一阶段不新增通用 `sys_storage_object` 表。对象的归属由各业务聚合保存，避免建立一个无法正确表达业务所有权的“万能文件表”。只有未来明确需要跨域对象统计或迁移时，才单独引入对象索引。

## 7. 用途注册表

用途由代码注册，示例：

```ts
registerStoragePurpose({
  code: 'system.tutorial-image',
  visibility: 'public',
  keyPrefix: 'tutorials/',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSizeBytes: 5 * 1024 * 1024,
})
```

后台只能读取用途策略；绑定时可以为当前用途设置渠道级的 `keyPrefixOverride`，不能修改用途默认前缀、公开性、大小限制和生命周期策略。运行时以 `keyPrefixOverride ?? keyPrefix` 作为生效前缀，业务调用方传相对路径即可。启动时发现代码已注册但数据库没有绑定时，该用途不可写入并返回明确的配置错误。

## 8. 运行时契约

业务代码只依赖统一服务，不依赖具体 S3 client：

```ts
const uploaded = await storageService.put('system.tutorial-image', {
  objectKey: `${tutorialId}/${fileId}.webp`,
  body,
  contentType: 'image/webp',
})

// 业务表保存 uploaded.channelId + uploaded.objectKey
```

统一服务至少提供：

- `put`
- `createPresignedPut`
- `createPresignedGet`
- `head`
- `getStream`
- `copy`
- `delete`

渠道解析规则：

1. 新写入先按用途读取当前绑定。
2. 绑定不存在、渠道停用或渠道测试失败时直接返回明确错误。
3. 不自动尝试其它渠道，不使用隐藏默认渠道。
4. 读取、删除和复制历史对象时使用对象记录中的 `storageChannelId`。

底层使用项目已有的 `@aws-sdk/client-s3` 和 `@aws-sdk/s3-request-presigner`。通过 NestJS injection token 暴露 `S3ObjectGateway`，便于单元测试替换实现；不引入假设单一静态 client 的额外 Nest S3 封装。

## 9. 后台 API 草案

以下是实现阶段需要稳定到 `doc/api/` 的接口草案：

```text
GET    /v1/sys/storage/channels
POST   /v1/sys/storage/channels
GET    /v1/sys/storage/channels/:id
PUT    /v1/sys/storage/channels/:id
PUT    /v1/sys/storage/channels/:id/credentials
POST   /v1/sys/storage/channels/:id/test
POST   /v1/sys/storage/channels/:id/disable
DELETE /v1/sys/storage/channels/:id

GET    /v1/sys/storage/purposes
PUT    /v1/sys/storage/purposes/:purposeCode/binding
```

权限统一使用 `system:storage:*`。接口响应只返回渠道元数据、状态和 `hasSecret`，不返回 secret 原文。

删除和修改规则：

- 被用途绑定的渠道不能删除。
- 被历史对象引用的渠道不能删除。
- `endpoint`、`bucket`、`region`、`forcePathStyle` 在渠道产生对象引用后不可修改。
- 凭据通过独立接口轮换，轮换后递增 `credentialVersion`。
- `publicBaseUrl` 可以修改，但必须明确说明会影响之后生成的公开 URL。

## 10. 后台页面

入口：`系统管理 / 对象存储`。

### 10.1 存储渠道

列表显示渠道名称、协议、endpoint、bucket、状态、绑定用途数、最近测试时间和操作。创建/编辑抽屉提供 AWS S3、Cloudflare R2、MinIO、Custom S3 预设。Secret 输入框永不回显，留空表示保持原值。

连接测试使用临时对象执行 `PUT -> HEAD -> GET -> DELETE`，不要求 bucket 全量列表权限。

### 10.2 用途绑定

按 System/App 分组显示代码注册的用途。每行展示当前渠道、默认前缀和生效前缀，通过配置弹窗原子保存渠道与可选的前缀覆盖值；公开性、大小限制和 MIME 类型策略保持只读。

## 11. 安全要求

1. Secret 使用环境变量 `C2C_CREDENTIAL_MASTER_KEY` 对应的 `admin.credentialMasterKey` 加密存储。
2. 开发和生产必须配置不同的独立主密钥，不能使用 S3 secret 自身作为加密主密钥；配置文件及其备份必须随部署环境妥善保存，变更主密钥前必须先完成凭据重加密。
3. 日志、异常、审计记录和 API 响应都必须脱敏 endpoint 查询参数、Access Key 和 Secret。
4. 连接测试只能操作服务生成的随机临时 key。
5. 后台接口使用现有系统权限和认证守卫。
6. 所有 DTO 使用 class-validator 校验 endpoint、bucket、region、URL、key 前缀和大小限制。

从来源模板发现的 OSS 凭据已从产品配置移除；如果这些值曾对应有效环境，必须在服务商侧轮换。新凭据只能通过受控配置或后台 Secret 写入流程提供。

## 12. 迁移和发布顺序

### 12.1 后端平台

1. 增加实体、迁移、`StorageModule`、用途注册机制和 System API。
2. 增加隔离 PostgreSQL schema 迁移测试，以及存储服务和绑定解析单元测试。
3. 通过管理 API 创建渠道、执行连接测试并绑定 `system.avatar`，Secret 不写入脚本或日志。
4. 后台页面、API 文档和权限码在同一根仓库变更中保持兼容。

### 12.2 数据库规则

所有表、字段、索引和外键都必须通过版本化 TypeORM migration，并登记到 migration index。禁止修改 `synchronize`，禁止在应用启动时调用 `runMigrations()`。

## 13. 验证要求

- 后端：lint、typecheck、unit、migration integration、API E2E、build、workspace check。
- 迁移：首次执行、最终结构校验、重复执行跳过。
- 存储适配器：使用 MinIO 或等效 S3-compatible 测试服务覆盖 PUT、HEAD、GET、DELETE、presigned URL。
- 安全：secret 不出现在响应、日志和错误信息；权限覆盖查询、写入、测试、绑定和删除。
- 前端：lint、unit、typecheck、build；UI 由人工验收。

## 14. 非目标和后续议题

本需求不解决对象浏览、跨渠道迁移、自动故障切换、复制策略和成本统计。任何一个议题都需要单独定义对象生命周期、失败补偿和历史引用策略，不能在本功能中顺手加入。
