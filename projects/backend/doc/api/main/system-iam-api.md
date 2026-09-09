# main / System IAM API

归属分支：`main`

基础前缀：

- 认证账号：`/v1/auth`
- 系统管理：`/v1/sys`

代码来源：

- Auth Controller: `server/backend/apps/admin/modules/system/auth/auth.controller.ts`
- Account Controller: `server/backend/apps/admin/modules/system/auth/controllers/account.controller.ts`
- User Controller: `server/backend/apps/admin/modules/system/user/user.controller.ts`
- Role Controller: `server/backend/apps/admin/modules/system/role/role.controller.ts`
- Menu Controller: `server/backend/apps/admin/modules/system/menu/menu.controller.ts`
- Params Controller: `server/backend/apps/admin/modules/system/params/params.controller.ts`
- RouterModule: `server/backend/apps/admin/modules/system/system.module.ts`

## 路由清单

| Operation | Method | Path | Auth |
| --- | --- | --- | --- |
| `systemAuthLogin` | `POST` | `/v1/auth/login` | Public |
| `systemAuthLogout` | `POST` | `/v1/auth/logout` | Public |
| `systemAuthRegister` | `POST` | `/v1/auth/register` | Public |
| `systemAuthCaptcha` | `GET` | `/v1/auth/captcha` | Public |
| `systemAuthMenus` | `GET` | `/v1/auth/menus` | Bearer token |
| `systemAuthPermissions` | `GET` | `/v1/auth/permissions` | Bearer token |
| `systemAuthOtpUrl` | `GET` | `/v1/auth/optUrl` | Bearer token |
| `systemAuthEnableOtp` | `PUT` | `/v1/auth/enabledOtp` | Permission `sys:auth:enabled_otp` |
| `systemAuthDisableOtp` | `PUT` | `/v1/auth/disabledOtp/:code` | Permission `sys:auth:disabled_otp` |
| `systemAuthModifyPassword` | `PUT` | `/v1/auth/modifyPwd` | Permission `sys:auth:modify_pwd` |
| `systemAccountUploadAvatar` | `POST` | `/v1/auth/account/avatar` | Permission `sys:account:avatar` |
| `systemAccountUpdate` | `PUT` | `/v1/auth/account` | Permission `sys:account:update` |
| `systemUserCreate` | `POST` | `/v1/sys/users` | Permission `system:user:create` |
| `systemUserFilter` | `GET` | `/v1/sys/users/filter` | Permission `system:user:read` |
| `systemUserInfo` | `GET` | `/v1/sys/users/info` | Bearer token |
| `systemUserUpdate` | `PUT` | `/v1/sys/users/:id` | Permission `system:user:update` |
| `systemUserDelete` | `DELETE` | `/v1/sys/users/:id` | Permission `system:user:delete` |
| `systemRoleCreate` | `POST` | `/v1/sys/roles` | Permission `system:role:create` |
| `systemRoleFilter` | `GET` | `/v1/sys/roles/filter` | Permission `system:role:read` |
| `systemRoleList` | `GET` | `/v1/sys/roles` | Permission `system:role:read` |
| `systemRoleDetail` | `GET` | `/v1/sys/roles/:id` | Permission `system:role:read` |
| `systemRoleUpdate` | `PUT` | `/v1/sys/roles/:id` | Permission `system:role:update` |
| `systemRoleDelete` | `DELETE` | `/v1/sys/roles/:id` | Permission `system:role:delete` |
| `systemMenuCreate` | `POST` | `/v1/sys/menus` | Permission `system:menu:create` |
| `systemMenuList` | `GET` | `/v1/sys/menus` | Permission `system:menu:read` |
| `systemMenuFilter` | `GET` | `/v1/sys/menus/filter` | Permission `system:menu:read` |
| `systemMenuWeb` | `GET` | `/v1/sys/menus/web` | Bearer token |
| `systemMenuDetail` | `GET` | `/v1/sys/menus/:id` | Permission `system:menu:read` |
| `systemMenuUpdate` | `PUT` | `/v1/sys/menus/:id` | Permission `system:menu:update` |
| `systemMenuDelete` | `DELETE` | `/v1/sys/menus/:id` | Permission `system:menu:delete` |
| `systemParamsCreate` | `POST` | `/v1/sys/params` | Permission `system:params:create` |
| `systemParamsUpdate` | `PUT` | `/v1/sys/params/:id` | Permission `system:params:update` |
| `systemParamsFilter` | `GET` | `/v1/sys/params/filter` | Permission `system:params:read` |
| `systemParamsDelete` | `DELETE` | `/v1/sys/params/:id` | Permission `system:params:delete` |

## 路由挂载备注

`SystemModule` 当前通过 `RouterModule` 挂载到 `/sys`。同时 `AppModule` 直接导入了 `RoleModule`，可能导致角色接口还存在 `/v1/roles` 历史路径；文档统一以 `/v1/sys/roles` 作为推荐契约，后续代码重构应收敛重复挂载。

## 通用错误响应

| HTTP Status | code | 场景 | msg 来源 |
| --- | ---: | --- | --- |
| 400 | 400 | DTO 校验失败、验证码错误、用户名重复、菜单仍被角色引用、系统菜单结构被锁定、系统参数结构被锁定、系统参数禁止删除 | DTO validation / service |
| 401 | 401 | 未登录、token 无效、登录凭证错误 | Auth guard / `AuthService` |
| 403 | 403 | 权限不足 | Permission guard |
| 429 | 429 | 图形验证码请求过于频繁 | `@Throttle` |
| 500 | 500 | 服务异常 | service |

```json
{
  "code": 400,
  "data": {},
  "msg": "用户名格式错误",
  "timestamp": "2026-05-20T00:00:00.000Z",
  "path": "/v1/auth/login"
}
```

## Auth Operations

### Operation: systemAuthLogin

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/auth/login` |
| Function | 管理端用户使用账号密码、验证码和可选 OTP 登录。 |
| Controller | `AuthController.login` |
| Auth | Public, `@Public()` |
| Request DTO | `LoginDto` |
| Success data | `AuthService.login()` 返回值 |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `username` | string | yes | username regex | 用户名 |
| `password` | string | yes | password regex | 密码 |
| `code` | string | no | 4 位验证码 regex | 图形验证码 |
| `otpCode` | string | no | 6 位验证码 regex | OTP 验证码 |
| `uuid` | string | yes | string | 图形验证码唯一码 |

```json
{
  "username": "admin",
  "password": "Password123!",
  "code": "1234",
  "uuid": "captcha-uuid"
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {}
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthLogout

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/auth/logout` |
| Function | 退出管理端登录会话。 |
| Controller | `AuthController.logout` |
| Auth | Public, token optional |
| Request DTO | None |
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

### Operation: systemAuthRegister

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/auth/register` |
| Function | 注册管理端用户账号。 |
| Controller | `AuthController.register` |
| Auth | Public, `@Public()` |
| Request DTO | `RegisterDto` extends `LoginDto` |
| Success data | `AuthService.register()` 返回值 |

#### Request

同 `LoginDto`。

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "username": "admin"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthCaptcha

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/auth/captcha` |
| Function | 生成管理端登录图形验证码。 |
| Controller | `AuthController.getCaptcha` |
| Auth | Public, `@Public()` |
| Rate limit | `10 / 60s` |
| Success data | captcha result |

#### Request

Query:

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `width` | number | no | implicit number conversion | 图片宽度 |
| `height` | number | no | implicit number conversion | 图片高度 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "uuid": "captcha-uuid",
    "img": "<svg>...</svg>"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthMenus

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/auth/menus` |
| Function | 获取当前管理端用户可访问的前端菜单。 |
| Controller | `AuthController.findFrontendMenus` |
| Auth | Bearer token |
| Success data | current user frontend menus |

#### Success Response

```json
{
  "code": 200,
  "data": [],
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthPermissions

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/auth/permissions` |
| Function | 获取当前管理端用户权限标识列表。 |
| Controller | `AuthController.getPermissions` |
| Auth | Bearer token |
| Success data | permission string list |

#### Success Response

```json
{
  "code": 200,
  "data": ["system:user:read"],
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthOtpUrl

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/auth/optUrl` |
| Function | 生成当前管理端用户绑定 OTP 所需的 otpauth URL。 |
| Controller | `AuthController.getOTPUrl` |
| Auth | Bearer token |
| Success data | OTP URL result |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "url": "otpauth://totp/..."
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthEnableOtp

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/auth/enabledOtp` |
| Function | 校验 OTP 并启用当前用户的双因素认证。 |
| Controller | `AuthController.bindOTPUrl` |
| Auth | Permission `sys:auth:enabled_otp` |
| Request DTO | `EnabledOtpDto` |
| Success data | service result |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `code` | string | no in DTO, business required | 6 位验证码 regex | OTP 验证码 |
| `uuid` | string | yes | string | 唯一码 |

```json
{
  "code": "123456",
  "uuid": "otp-uuid"
}
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

### Operation: systemAuthDisableOtp

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/auth/disabledOtp/:code` |
| Function | 校验 OTP 并关闭当前用户的双因素认证。 |
| Controller | `AuthController.unBindOtp` |
| Auth | Permission `sys:auth:disabled_otp` |
| Path parameter | `code`: OTP code |
| Success data | service result |

#### Success Response

```json
{
  "code": 200,
  "data": true,
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAuthModifyPassword

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/auth/modifyPwd` |
| Function | 当前管理端用户修改登录密码。 |
| Controller | `AuthController.modifyPwd` |
| Auth | Permission `sys:auth:modify_pwd` |
| Request DTO | `ModifyPwdDto` |
| Success data | service result |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `code` | string | no | string | OTP 验证码 |
| `oldPwd` | string | no in DTO, business required | password regex | 旧密码 |
| `newPwd` | string | no in DTO, business required | password regex | 新密码 |

```json
{
  "oldPwd": "Password123!",
  "newPwd": "NewPassword123!",
  "code": "123456"
}
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

## Account Operations

### Operation: systemAccountUploadAvatar

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/auth/account/avatar` |
| Function | 上传并更新当前管理端用户头像。 |
| Controller | `AccountController.upload` |
| Auth | Permission `sys:account:avatar` |
| Request | `multipart/form-data`, file field `file` |
| File validation | max `3MB`, image regex |
| Success data | upload result |

#### Request

FormData:

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `file` | file | yes | image, max 3MB | 用户头像 |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "url": "https://example.com/avatar.webp"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemAccountUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/auth/account` |
| Function | 更新当前管理端用户基础资料。 |
| Controller | `AccountController.updateInfo` |
| Auth | Permission `sys:account:update` |
| Request DTO | `AccountUpdateDto` |
| Success data | service result |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `nickname` | string | no | max length `20` | 用户昵称 |

```json
{
  "nickname": "admin"
}
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

## User Operations

### Operation: systemUserCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/users` |
| Function | 创建系统用户并分配角色。 |
| Controller | `UserController.create` |
| Auth | Permission `system:user:create` |
| Request DTO | `UserCreateDto` |
| Success data | created user |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `username` | string | yes | username regex, max `20` | 用户名 |
| `password` | string | yes | password regex, max `40` | 密码 |
| `status` | number | no | `StatusEnum` | `1` 启用，`0` 禁用 |
| `nickname` | string | no | nickname regex | 昵称 |
| `avatar` | string | no | string | 头像 |
| `roleIds` | number[] | no | array | 角色 ID 集合 |
| `description` | string | no | max `100` | 备注 |

```json
{
  "username": "operator",
  "password": "Password123!",
  "status": 1,
  "nickname": "Operator",
  "roleIds": [1]
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 2,
    "username": "operator"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemUserFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/users/filter` |
| Function | 分页筛选系统用户。 |
| Controller | `UserController.filter` |
| Auth | Permission `system:user:read` |
| Request DTO | `UserFilterDto` |
| Success data | paginated users |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `pageIndex` | number | yes | integer, min `1` | 分页索引 |
| `pageSize` | number | yes | integer, min `1` | 分页大小 |
| `username` | string | no | max `20` | 用户名 |
| `nickname` | string | no | string | 昵称 |
| `status` | number | no | `StatusEnum` | 状态 |
| `description` | string | no | string | 备注 |

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

### Operation: systemUserInfo

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/users/info` |
| Function | 获取当前 token 对应的系统用户信息。 |
| Controller | `UserController.info` |
| Auth | Bearer token |
| Success data | current user info |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "username": "admin",
    "nickname": "admin"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemUserUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/users/:id` |
| Function | 更新指定系统用户资料、状态和角色。 |
| Controller | `UserController.update` |
| Auth | Permission `system:user:update` |
| Path parameter | `id`: user id, integer |
| Request DTO | `UserUpdateDto` |
| Success data | updated user |

#### Request

```json
{
  "nickname": "Operator",
  "status": 1,
  "roleIds": [1],
  "description": "system operator"
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 2,
    "nickname": "Operator"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemUserDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/users/:id` |
| Function | 删除指定系统用户。 |
| Controller | `UserController.remove` |
| Auth | Permission `system:user:delete` |
| Path parameter | `id`: user id, integer |
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

## Role Operations

### Operation: systemRoleCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/roles` |
| Function | 创建系统角色并关联菜单权限。 |
| Controller | `RoleController.create` |
| Auth | Permission `system:role:create` |
| Request DTO | `RoleCreateDto` |
| Success data | created role |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `value` | string | yes | string | 角色标识 |
| `name` | string | yes | string | 角色名称 |
| `status` | number | no | `StatusEnum` | 状态 |
| `description` | string | no | string | 描述 |
| `menuIds` | string[] | no | array | 关联菜单 ID |

```json
{
  "value": "operator",
  "name": "Operator",
  "status": 1,
  "menuIds": ["1"]
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "value": "operator",
    "name": "Operator"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemRoleFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/roles/filter` |
| Function | 分页筛选系统角色。 |
| Controller | `RoleController.filter` |
| Auth | Permission `system:role:read` |
| Request DTO | `RoleFilterDto` |
| Success data | paginated roles |

#### Request

包含 `pageIndex`、`pageSize`，以及 `value`、`name`、`status`、`description` 等筛选字段。

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

### Operation: systemRoleList

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/roles` |
| Function | 按条件查询系统角色列表。 |
| Controller | `RoleController.findAll` |
| Auth | Permission `system:role:read` |
| Request DTO | `RoleListDto` |
| Success data | role list |

#### Success Response

```json
{
  "code": 200,
  "data": [],
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemRoleDetail

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/roles/:id` |
| Function | 查看指定角色详情及关联菜单。 |
| Controller | `RoleController.findOne` |
| Auth | Permission `system:role:read` |
| Path parameter | `id`: role id, integer |
| Success data | role detail |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "value": "operator",
    "name": "Operator",
    "menus": []
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemRoleUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/roles/:id` |
| Function | 更新指定角色信息和菜单权限。 |
| Controller | `RoleController.update` |
| Auth | Permission `system:role:update` |
| Path parameter | `id`: role id, integer |
| Request DTO | `RoleUpdateDto` |
| Success data | updated role |

#### Request

```json
{
  "name": "Operator",
  "status": 1,
  "menuIds": ["1"]
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "Operator"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemRoleDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/roles/:id` |
| Function | 删除一个或多个系统角色。 |
| Controller | `RoleController.delete` |
| Auth | Permission `system:role:delete` |
| Path parameter | `id`: one or more role IDs, comma-separated |
| Success data | delete result |

#### Request

```http
DELETE /v1/sys/roles/1,2
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

## Menu Operations

菜单数据分为系统内置和用户自定义两类。系统内置菜单由后端代码注册表启动同步，字段 `key/source/locked/managedHash` 用于标识和保护结构；后台接口只允许调整系统菜单的展示字段，不允许手动修改 `parentId/path/component/permission/type` 等结构字段，也不允许删除系统菜单。开发库需要清空旧菜单时直接执行维护脚本 `pnpm --dir server/backend exec cross-env NODE_ENV=development ts-node --transpile-only -r tsconfig-paths/register scripts/reset-admin-menus.ts`。数据维护脚本不注册到 `package.json`。

### Operation: systemMenuCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/menus` |
| Function | 创建系统菜单、目录或权限节点。 |
| Controller | `MenuController.create` |
| Auth | Permission `system:menu:create` |
| Request DTO | `MenuCreateDto` |
| Success data | created menu |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `parentId` | number | no | number transform | 上级菜单 ID |
| `key` | string | no | max `120` | 菜单稳定标识，系统内置菜单由代码注册表维护 |
| `source` | enum | no | `SysMenuSource` | `system`、`custom` |
| `locked` | number | no | `StatusEnum` | 是否锁定结构 |
| `name` | string | yes | string | 菜单名称 |
| `path` | string | no | max `100` | 路由地址 |
| `component` | string | no | max `100` | 组件路径 |
| `permission` | string | no | max `100` | 权限标识 |
| `type` | enum | yes | `SysMenuType` | `MENU`、`FOLDER`、`PERMISSION`、`EMBED` |
| `icon` | string | no | string | 菜单图标 |
| `iframeSrc` | string | no | string | 内嵌外链地址 |
| `status` | number | yes | `StatusEnum` | 状态 |
| `keepAlive` | number | no | `StatusEnum` | 是否缓存 |
| `show` | number | yes | `StatusEnum` | 是否显示 |
| `orderNo` | number | no | integer | 排序编号 |

```json
{
  "name": "System",
  "type": "FOLDER",
  "status": 1,
  "show": 1,
  "orderNo": 1
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "System"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemMenuList

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/menus` |
| Function | 按条件查询菜单节点列表。 |
| Controller | `MenuController.findAll` |
| Auth | Permission `system:menu:read` |
| Request DTO | `MenuListDto` |
| Success data | menu list |

#### Request

Query fields: `name`、`status`、`type`、`source`。

#### Success Response

```json
{
  "code": 200,
  "data": [],
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemMenuFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/menus/filter` |
| Function | 分页筛选菜单节点。 |
| Controller | `MenuController.filter` |
| Auth | Permission `system:menu:read` |
| Request DTO | `MenuFilterDto` |
| Success data | paginated menus |

#### Request

包含 `pageIndex`、`pageSize`，以及 `name`、`status`、`type`、`source`。

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

### Operation: systemMenuWeb

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/menus/web` |
| Function | 获取当前用户可见的前端菜单树。 |
| Controller | `MenuController.findFrontendMenus` |
| Auth | Bearer token |
| Success data | current user frontend menu tree |

#### Success Response

```json
{
  "code": 200,
  "data": [],
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemMenuDetail

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/menus/:id` |
| Function | 查看指定菜单节点详情。 |
| Controller | `MenuController.findOne` |
| Auth | Permission `system:menu:read` |
| Path parameter | `id`: menu id, integer |
| Success data | menu detail |

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "System",
    "type": "FOLDER"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemMenuUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/menus/:id` |
| Function | 更新指定菜单节点信息。 |
| Controller | `MenuController.update` |
| Auth | Permission `system:menu:update` |
| Path parameter | `id`: menu id, integer |
| Request DTO | `MenuUpdateDto` |
| Success data | updated menu |

#### Request

```json
{
  "name": "System",
  "status": 1,
  "show": 1
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "System"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemMenuDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/menus/:id` |
| Function | 删除指定菜单节点。 |
| Controller | `MenuController.remove` |
| Auth | Permission `system:menu:delete` |
| Path parameter | `id`: menu id, integer |
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

## Params Operations

系统参数分为内置参数和自定义参数。内置参数由代码注册表启动同步，当前仅包含 `staticServerUrl`，用于本地静态资源服务 `/public` 的公开访问域名，和 OSS 配置无关。内置参数允许修改 `value`，不允许修改 `key/type/source/locked`。

### Operation: systemParamsCreate

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/sys/params` |
| Function | 创建系统参数配置项。 |
| Controller | `ParamsController.create` |
| Auth | Permission `system:params:create` |
| Request DTO | `ParamsCreateDto` |
| Success data | created params |

#### Request

| Field | Type | Required | Validation | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | string | 参数名称 |
| `key` | string | yes | string | 参数键 |
| `value` | string | yes | string | 参数值 |
| `type` | number | yes | `SysParamsTypeEnum` | `1` System, `2` Normal |
| `description` | string | no | max `200` | 描述 |

```json
{
  "name": "Site Name",
  "key": "site.name",
  "value": "Admin",
  "type": 2
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "key": "site.name"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemParamsUpdate

| 项 | 值 |
| --- | --- |
| Method | `PUT` |
| Path | `/v1/sys/params/:id` |
| Function | 更新系统参数配置项。 |
| Controller | `ParamsController.update` |
| Auth | Permission `system:params:update` |
| Path parameter | `id`: params id, integer |
| Request DTO | `ParamsUpdateDto` |
| Success data | updated params |

#### Request

```json
{
  "value": "Admin Console",
  "description": "site display name"
}
```

#### Success Response

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "value": "Admin Console"
  },
  "msg": "success",
  "timestamp": "2026-05-20T00:00:00.000Z"
}
```

### Operation: systemParamsFilter

| 项 | 值 |
| --- | --- |
| Method | `GET` |
| Path | `/v1/sys/params/filter` |
| Function | 分页筛选系统参数配置项。 |
| Controller | `ParamsController.filter` |
| Auth | Permission `system:params:read` |
| Request DTO | `ParamsFilterDto` |
| Success data | paginated params |

#### Request

包含 `pageIndex`、`pageSize`，以及 `name`、`key`、`value`、`type`、`description`。

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

### Operation: systemParamsDelete

| 项 | 值 |
| --- | --- |
| Method | `DELETE` |
| Path | `/v1/sys/params/:id` |
| Function | 删除指定系统参数配置项。 |
| Controller | `ParamsController.delete` |
| Auth | Permission `system:params:delete` |
| Path parameter | `id`: params id, integer |
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
