# 后台基础模块

`server/backend/apps/admin/modules` 当前只保留 C2C 后台需要的通用基座。

## RBAC 与认证

- `system/auth` 负责后台账号登录、JWT 会话与 OTP。
- `system/user`、`system/role` 和 `system/menu` 负责账号、角色、菜单与操作权限。
- 后端 Guard 是权限最终裁决者，前端菜单和按钮控制只改善使用体验。
- 默认菜单由 `system/menu/registry/default-admin-menus.ts` 幂等注册。

## 任务与可观测性

- `system/task` 基于 BullMQ 管理计划任务和任务日志。
- 服务端系统任务通过 `taskCode` 注册表声明；客户端不得提交 `Service.method` 作为执行目标。
- `system/log`、`system/online` 和 `client-error` 提供后台审计、会话与客户端错误记录。

## 平台能力

- `system/params` 管理受控系统参数。
- `system/storage` 管理对象存储渠道及用途绑定。
- `system/credential` 统一加密可复用的外部凭据。
- `system/ai` 与 `system/tutorial` 是模板保留的可选平台能力，后续可按产品范围独立裁剪。

商家、支付、Telegram、代理商及交易平台接入应作为独立业务模块新增，并遵守根级 `tenantId`、`merchantId`、Secret、金额和状态机约束。
