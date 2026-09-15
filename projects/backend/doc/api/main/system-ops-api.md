# main / System Ops API

归属分支：`main`

基础前缀：

- 系统运维模块：`/v1/sys`
- 静态文件：`/v1/static`
- OSS：`/v1/oss`
- 对象存储：`/v1/sys/storage`

代码来源：

- Log Controller: `server/backend/apps/admin/modules/system/log/log.controller.ts`
- Online Controller: `server/backend/apps/admin/modules/system/online/online.controller.ts`
- Task Controller: `server/backend/apps/admin/modules/system/task/task.controller.ts`
- Static Controller: `server/backend/apps/admin/modules/static/static.controller.ts`
- OSS Controller: `server/backend/apps/admin/modules/oss/oss.controller.ts`
- Storage Controller: `server/backend/apps/admin/modules/system/storage/storage.controller.ts`

## 路由清单

| Operation | Method | Path | Auth |
| --- | --- | --- | --- |
| `systemLogFilter` | `GET` | `/v1/sys/logs/filter` | Permission `monitor:log:read` |
| `systemTaskLogFilter` | `GET` | `/v1/sys/logs/task/filter` | Permission `monitor:taskLog:read` |
| `systemOnlineFilter` | `GET` | `/v1/sys/online/filter` | Permission `monitor:online:read` |
| `systemOnlineKick` | `DELETE` | `/v1/sys/online/kick/:id` | Permission `monitor:online:delete` |
| `systemTaskCreate` | `POST` | `/v1/sys/tasks` | Permission `monitor:task:create` |
| `systemTaskUpdate` | `PUT` | `/v1/sys/tasks/:id` | Permission `monitor:task:update` |
| `systemTaskFilter` | `GET` | `/v1/sys/tasks/filter` | Permission `monitor:task:read` |
| `systemTaskDelete` | `DELETE` | `/v1/sys/tasks/:id` | Permission `monitor:task:delete` |
| `systemTaskRunOnce` | `PUT` | `/v1/sys/tasks/:id/once` | Permission `monitor:task:once` |
| `systemTaskStop` | `PUT` | `/v1/sys/tasks/:id/stop` | Permission `monitor:task:stop` |
| `systemTaskStart` | `PUT` | `/v1/sys/tasks/:id/start` | Permission `monitor:task:start` |
| `systemStaticFilter` | `GET` | `/v1/static/filter` | Permission `system:static:read` |
| `systemStaticUploadImage` | `POST` | `/v1/static/upload/image` | Permission `system:static:upload_image` |
| `systemStaticDeleteByPath` | `DELETE` | `/v1/static/path/:path` | Permission `system:static:delete` |
| `systemStaticDeleteById` | `DELETE` | `/v1/static/:id` | Permission `system:static:delete` |
| `systemOssAvatarUploadSignature` | `GET` | `/v1/oss/upload-signature/avatar` | Bearer token |
| `systemStorageChannelList` | `GET` | `/v1/sys/storage/channels` | Permission `system:storage:read` |
| `systemStorageChannelCreate` | `POST` | `/v1/sys/storage/channels` | Permission `system:storage:create` |
| `systemStorageChannelGet` | `GET` | `/v1/sys/storage/channels/:id` | Permission `system:storage:read` |
| `systemStorageChannelUpdate` | `PUT` | `/v1/sys/storage/channels/:id` | Permission `system:storage:update` |
| `systemStorageChannelRotateCredentials` | `PUT` | `/v1/sys/storage/channels/:id/credentials` | Permission `system:storage:update` |
| `systemStorageChannelTest` | `POST` | `/v1/sys/storage/channels/:id/test` | Permission `system:storage:test` |
| `systemStorageChannelEnable` | `POST` | `/v1/sys/storage/channels/:id/enable` | Permission `system:storage:update` |
| `systemStorageChannelDisable` | `POST` | `/v1/sys/storage/channels/:id/disable` | Permission `system:storage:update` |
| `systemStorageChannelDelete` | `DELETE` | `/v1/sys/storage/channels/:id` | Permission `system:storage:delete` |
| `systemStoragePurposeList` | `GET` | `/v1/sys/storage/purposes` | Permission `system:storage:read` |
| `systemStoragePurposeBind` | `PUT` | `/v1/sys/storage/purposes/:purposeCode/binding` | Permission `system:storage:bind` |

## 路由挂载备注

`TaskModule` 只由 `SystemModule` 统一挂载，`TaskController` 使用模块内相对路径 `tasks`，实际契约固定为 `/v1/sys/tasks`。

## 通用错误响应

| HTTP Status | code | 场景 | msg 来源 |
| --- | ---: | --- | --- |
| 400 | 400 | DTO 校验失败、任务 service 标识不合法、文件类型或大小不符合要求 | DTO validation / pipes / service |
| 401 | 401 | 未登录或 token 无效 | Auth guard |
| 403 | 403 | 权限不足 | Permission guard |
| 429 | 429 | OSS 头像签名超过月度限制 | `@RateLimit` |
| 500 | 500 | 日志、任务、存储服务异常 | service |

```json
{
  "code": 400,
  "data": {},
  "msg": "文件类型错误",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/static/upload/image"
}
```

## Log Operations

### Operation: systemLogFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/logs/filter` |
| Function | 分页查询系统操作日志。 |
| Controller | `LogController.filter` |
| Auth | Permission `monitor:log:read` |
| Request DTO | `LogFilterDto` |
| Success data | paginated logs |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `pageIndex` | number | yes | integer, min `1` | 分页索引 |
| `pageSize` | number | yes | integer, min `1` | 分页大小 |
| `title` | string | no | string | 系统模块标题 |
| `content` | string | no | string | 调用内容描述 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "items": [],
    "meta": {
      "currentPage": 1,
      "itemsPerPage": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskLogFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/logs/task/filter` |
| Function | 分页查询定时任务执行日志。 |
| Controller | `LogController.filterTaskLog` |
| Auth | Permission `monitor:taskLog:read` |
| Request DTO | `TaskLogFilterDto` |
| Success data | paginated task logs |
| Sort | `startedAt DESC, id DESC`，最新执行记录优先 |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `pageIndex` | number | yes | integer, min `1` | 分页索引 |
| `pageSize` | number | yes | integer, min `1` | 分页大小 |
| `status` | number | no | `ExecuteEnum` | `0` 失败，`1` 成功 |
| `taskName` | string | no | string | 任务名称 |
| `taskSource` | enum | no | `custom` / `system` | 任务来源 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "items": [],
    "meta": {
      "currentPage": 1,
      "itemsPerPage": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

## Online Operations

### Operation: systemOnlineFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/online/filter` |
| Function | 分页查询后台 Token 会话。记录存在表示 token 仍可管理，状态表示该 token 当前 WebSocket 连接在线/离线。 |
| Controller | `OnlineController.filter` |
| Auth | Permission `monitor:online:read` |
| Request DTO | `OnlineFilterDto` |
| Success data | paginated admin token sessions |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `pageIndex` | number | yes | integer, min `1` | 分页索引 |
| `pageSize` | number | yes | integer, min `1` | 分页大小 |
| `username` | string | no | max `20` | 用户名 |
| `nickname` | string | no | max `20` | 用户昵称 |
| `status` | enum | no | `online` / `offline` | Token 当前连接状态 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "items": [],
    "meta": {
      "currentPage": 1,
      "itemsPerPage": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemOnlineKick

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/online/kick/:id` |
| Function | 撤销指定后台 Token 会话：使 token 失效、删除会话监控记录，并断开该 token 当前所有 WebSocket 连接。 |
| Controller | `OnlineController.kick` |
| Auth | Permission `monitor:online:delete` |
| Path parameter | `id`: online session ID |
| Success data | `{ revoked: boolean }` |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "revoked": true
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

## Task Operations

### Operation: systemTaskCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/tasks` |
| Function | 创建后台可配置的定时或间隔任务。 |
| Controller | `TaskController.create` |
| Auth | Permission `monitor:task:create` |
| Request DTO | `TaskCreateDto` |
| Success data | created task |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | max `20` | 任务名称 |
| `service` | string | yes | max `200`, format `service.method` | 任务标识 |
| `type` | enum | yes | `Cron` / `Interval` | 任务类型 |
| `status` | number | yes | `0` / `1` | 任务状态 |
| `startedAt` | string | no | Date | 开始时间 |
| `endedAt` | string | no | Date | 结束时间 |
| `limit` | number | no | integer | 执行间隔 |
| `cron` | string | no | string | cron 表达式 |
| `every` | number | no | integer | 执行次数 |
| `data` | string | no | string | 任务参数 |
| `description` | string | no | max `200` | 任务描述 |

```json
{
  "name": "sync-job",
  "service": "syncService.run",
  "type": "Cron",
  "status": 1,
  "cron": "0 * * * *"
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": "task-id",
    "name": "sync-job",
    "status": 1
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/tasks/:id` |
| Function | 更新后台任务配置。 |
| Controller | `TaskController.update` |
| Auth | Permission `monitor:task:update` |
| Path parameter | `id`: task ID |
| Request DTO | `TaskUpdateDto` |
| Success data | updated task |

#### Request

`TaskUpdateDto` 是 `TaskCreateDto` 的部分字段更新。当前实现会执行 `dto.service!.split('.')`，因此更新任务时仍应传入 `service`。

```json
{
  "service": "syncService.run",
  "status": 1,
  "cron": "0 */2 * * *"
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": "task-id",
    "status": 1
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/tasks/filter` |
| Function | 分页筛选后台可配置任务。 |
| Controller | `TaskController.filter` |
| Auth | Permission `monitor:task:read` |
| Request DTO | `TaskFilterDto` |
| Success data | paginated tasks |

#### Request

包含 `pageIndex`、`pageSize`，以及 `name`、`status`、`type`、`description`、`source`。`source` 可选值为 `custom` / `system`。

#### Success Response

```json
{
  "code": 200,
  "data": {
    "items": [],
    "meta": {
      "currentPage": 1,
      "itemsPerPage": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/tasks/:id` |
| Function | 删除指定后台可配置任务。 |
| Controller | `TaskController.delete` |
| Auth | Permission `monitor:task:delete` |
| Path parameter | `id`: task ID |
| Success data | delete result |

#### Success Response

```json
{
  "code": 200,
  "data": true,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskRunOnce

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/tasks/:id/once` |
| Function | 手动触发指定可配置任务立即执行一次。 |
| Controller | `TaskController.once` |
| Auth | Permission `monitor:task:once` |
| Path parameter | `id`: task ID |
| Success data | `void` |

#### Success Response

```json
{
  "code": 200,
  "data": null,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskStop

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/tasks/:id/stop` |
| Function | 停止指定后台可配置任务。 |
| Controller | `TaskController.stop` |
| Auth | Permission `monitor:task:stop` |
| Path parameter | `id`: task ID |
| Success data | `void` |

#### Success Response

```json
{
  "code": 200,
  "data": null,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemTaskStart

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/tasks/:id/start` |
| Function | 启动指定后台可配置任务。 |
| Controller | `TaskController.start` |
| Auth | Permission `monitor:task:start` |
| Path parameter | `id`: task ID |
| Success data | `void` |

#### Success Response

```json
{
  "code": 200,
  "data": null,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

## Static File Operations

### Operation: systemStaticFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/static/filter` |
| Function | 分页查询用户上传的静态文件。 |
| Controller | `StaticController.filter` |
| Auth | Permission `system:static:read` |
| Request DTO | `FilterUserFileDto` |
| Success data | paginated user files |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `pageIndex` | number | yes | integer, min `1` | 分页索引 |
| `pageSize` | number | yes | integer, min `1` | 分页大小 |
| `username` | string | no | string | 用户名 |
| `nickname` | string | no | string | 用户昵称 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "items": [],
    "meta": {
      "currentPage": 1,
      "itemsPerPage": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemStaticUploadImage

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/static/upload/image` |
| Function | 上传图片文件并生成静态文件记录。 |
| Controller | `StaticController.upload` |
| Auth | Permission `system:static:upload_image` |
| Request | `multipart/form-data`, field `file` |
| File validation | max `admin.maxFileSize`, image regex |
| Success data | uploaded file record |

#### Request

FormData:

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `file` | file | yes | image, max `admin.maxFileSize` | 图片文件 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "url": "https://example.com/image.webp",
    "path": "uploads/image.webp"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemStaticDeleteByPath

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/static/path/:path` |
| Function | 按文件路径删除静态文件。 |
| Controller | `StaticController.deleteByPath` |
| Auth | Permission `system:static:delete` |
| Path parameter | `path`: URL encoded file path |
| Success data | delete result |

#### Request

`path` 会在 Controller 中执行 `decodeURIComponent(path)`，前端必须 URL encode。

```http
DELETE /v1/static/path/uploads%2Fimage.webp
```

#### Success Response

```json
{
  "code": 200,
  "data": true,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemStaticDeleteById

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/static/:id` |
| Function | 按用户文件 ID 删除静态文件。 |
| Controller | `StaticController.delete` |
| Auth | Permission `system:static:delete` |
| Path parameter | `id`: user file ID, integer |
| Success data | delete result |

#### Success Response

```json
{
  "code": 200,
  "data": true,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

## OSS Operations

### Operation: systemOssAvatarUploadSignature

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/oss/upload-signature/avatar` |
| Function | 生成当前用户头像直传对象存储的预签名上传信息。 |
| Controller | `OssController.getAvatarSignature` |
| Auth | Bearer token |
| Rate limit | action `avatar_update`, `5 / MONTH` |
| Success data | presigned put signature |

#### Success Response

`maxSizeBytes` 固定 `200 * 1024`，`mimeType` 固定 `image/webp`。返回的 `fileUrl` 会追加时间戳参数，避免浏览器缓存。

```json
{
  "code": 200,
  "data": {
    "uploadUrl": "https://oss.example.com/presigned-put-url",
    "fileUrl": "https://cdn.example.com/avatars/user-id.webp?t=1779235200000",
    "headers": {
      "Content-Type": "image/webp"
    },
    "maxSizeBytes": 204800
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

## Object Storage Operations

对象存储中心只管理 S3-compatible 渠道和“存储用途 -> 写入渠道”的绑定，不提供对象浏览、跨渠道迁移或故障切换。渠道凭证由服务端加密保存，任何响应都不会返回 Secret Access Key。

### Operation: systemStorageChannelList

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/storage/channels` |
| Function | 查询已配置的对象存储渠道。 |
| Controller | `StorageController.listChannels` |
| Auth | Permission `system:storage:read` |

#### Success Response

`data` 为渠道数组。`hasSecret` 仅表示服务端已保存凭证，不返回凭证内容。

```json
{
  "code": 200,
  "data": [{
    "id": "00000000-0000-4000-8000-000000000001",
    "code": "r2-public",
    "name": "R2 Public",
    "provider": "s3_compatible",
    "endpoint": "https://account.r2.cloudflarestorage.com",
    "region": "auto",
    "bucket": "assets",
    "publicBaseUrl": "https://cdn.example.com",
    "forcePathStyle": true,
    "accessKeyId": "access-key",
    "credentialVersion": 1,
    "hasSecret": true,
    "status": "disabled",
    "lastCheckedAt": null,
    "lastCheckMessage": null,
    "updatedAt": "2026-05-20T00:00:00.000Z"
  }],
  "msg": "success"
}
```

### Operation: systemStorageChannelCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/storage/channels` |
| Function | 创建一个 S3-compatible 存储渠道。新渠道初始为 `disabled`，必须测试成功后再启用。 |
| Controller | `StorageController.createChannel` |
| Auth | Permission `system:storage:create` |
| Request DTO | `CreateStorageChannelDto` |

#### Request

```json
{
  "code": "r2-public",
  "name": "R2 Public",
  "provider": "s3_compatible",
  "endpoint": "https://account.r2.cloudflarestorage.com",
  "region": "auto",
  "bucket": "assets",
  "publicBaseUrl": "https://cdn.example.com",
  "forcePathStyle": true,
  "accessKeyId": "access-key",
  "secretAccessKey": "secret-value"
}
```

`code` 只能使用小写字母、数字和连字符；`endpoint`、`publicBaseUrl` 必须为 HTTP(S) URL；`secretAccessKey` 长度为 `8..512`。`region` 默认 `auto`，`forcePathStyle` 默认 `true`。

#### Success Response

返回 `StorageChannelView`，结构同 `systemStorageChannelList`。Secret Access Key 只在请求中出现。

### Operation: systemStorageChannelGet

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/storage/channels/:id` |
| Function | 查询单个对象存储渠道。 |
| Controller | `StorageController.getChannel` |
| Auth | Permission `system:storage:read` |
| Path parameter | `id`: 渠道 UUID |
| Success data | `StorageChannelView` |

### Operation: systemStorageChannelUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/storage/channels/:id` |
| Function | 修改渠道展示名称或公开访问基础地址。 |
| Controller | `StorageController.updateChannel` |
| Auth | Permission `system:storage:update` |
| Request DTO | `UpdateStorageChannelDto` |

#### Request

```json
{
  "name": "R2 CDN",
  "publicBaseUrl": "https://cdn.example.com"
}
```

传 `publicBaseUrl: null` 可清空公开地址。`endpoint`、`region`、`bucket`、`forcePathStyle` 和 `code` 创建后不可修改；需要更换连接目标时应创建新渠道并重新绑定用途。

### Operation: systemStorageChannelRotateCredentials

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/storage/channels/:id/credentials` |
| Function | 轮换渠道访问凭证。轮换后渠道自动停用，必须重新测试并启用。 |
| Controller | `StorageController.rotateCredentials` |
| Auth | Permission `system:storage:update` |
| Request DTO | `RotateStorageChannelCredentialsDto` |

```json
{
  "accessKeyId": "new-access-key",
  "secretAccessKey": "new-secret-value"
}
```

### Operation: systemStorageChannelTest

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/storage/channels/:id/test` |
| Function | 使用临时对象执行写入、读取、Head 和删除，验证渠道连接。 |
| Controller | `StorageController.testChannel` |
| Auth | Permission `system:storage:test` |
| Success data | 更新后的 `StorageChannelView`，`lastCheckMessage` 为 `ok` |

测试失败会将渠道状态置为 `error` 并返回 `400`；健康检查对象的清理失败只记录服务端告警。

### Operation: systemStorageChannelEnable / systemStorageChannelDisable

| Operation | Method | Path | Auth |
| --- | --- | --- | --- |
| `systemStorageChannelEnable` | `POST` | `/v1/sys/storage/channels/:id/enable` | Permission `system:storage:update` |
| `systemStorageChannelDisable` | `POST` | `/v1/sys/storage/channels/:id/disable` | Permission `system:storage:update` |

启用操作会先执行连接测试，测试成功后才将状态改为 `active`。停用不会删除渠道或历史对象，但绑定用途的新写入会被拒绝。

### Operation: systemStorageChannelDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/storage/channels/:id` |
| Function | 删除已停用且未被用途绑定引用的渠道配置。 |
| Controller | `StorageController.removeChannel` |
| Auth | Permission `system:storage:delete` |
| Success data | `null` |

活动渠道或仍被绑定的渠道不能删除，分别返回 `400`。

### Operation: systemStoragePurposeList

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/storage/purposes` |
| Function | 查询代码注册的存储用途及当前写入渠道。 |
| Controller | `StorageController.listPurposes` |
| Auth | Permission `system:storage:read` |

#### Success data

每项包含 `code`、`group`、`defaultKeyPrefix`、`keyPrefixOverride`、`keyPrefix`（当前生效值）、`maxSizeBytes`、`allowedMimeTypes`、`visibility`、`bindingChannelId` 和 `bindingChannelName`。用途由代码注册，后台不能新增用途。

### Operation: systemStoragePurposeBind

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/storage/purposes/:purposeCode/binding` |
| Function | 将一个已启用的渠道绑定到指定存储用途。 |
| Controller | `StorageController.bindPurpose` |
| Auth | Permission `system:storage:bind` |
| Request DTO | `BindStoragePurposeDto` |

```json
{
  "channelId": "00000000-0000-4000-8000-000000000001",
  "keyPrefixOverride": "profile-images/"
}
```

未知用途、未启用渠道或公开用途绑定到没有 `publicBaseUrl` 的渠道都会返回 `400`。绑定只影响之后按用途解析的写入；历史对象必须持久化并继续使用其 `channelId + objectKey` 引用。

### Object Storage Error Responses

| HTTP Status | 场景 |
| --- | --- |
| 400 | DTO 校验失败、重复渠道编码、渠道状态不满足操作、公开用途缺少公开地址、用途未绑定或对象约束不满足 |
| 401 | 未登录或 token 无效 |
| 403 | 缺少对应 `system:storage:*` 权限 |
| 404 | 渠道 UUID 不存在 |
| 500 | 凭证主密钥缺失/无法解密或底层存储服务异常 |

### OSS Error Responses

| HTTP Status | code | 场景 | msg 来源 |
| --- | ---: | --- | --- |
| 401 | 401 | 未登录或 token 无效 | Auth guard |
| 429 | 429 | 本月修改头像次数已达上限 | `@RateLimit` |
| 500 | 500 | 对象存储签名生成失败 | `StorageService` |

```json
{
  "code": 429,
  "data": {},
  "msg": "本月修改头像次数已达上限 (5次)，请下个月再试。",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/oss/upload-signature/avatar"
}
```
