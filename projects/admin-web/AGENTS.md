# C2C Admin Web Agent Rules

## 项目定位

- 本目录是单一 C2C Git 仓库中的管理后台项目。
- 根目录 `projects.json` 中的稳定项目 ID 是 `admin-web`。
- 项目使用 Vue 3、Vben Admin、TypeScript、pnpm workspace 和 Turbo。

## 开发规则

- 只实现平台和代理商后台，不恢复用户 App、商品、积分、价格方案或 App 订单页面。
- 后端是权限最终裁决者；前端动态菜单和 `v-access:code` 只负责体验与入口控制。
- API 变更同步检查请求/响应类型、错误码、权限码、分页、金额字符串和时区格式。
- 运营后台优先保证表格扫描、筛选效率、批量操作、加载/空/错误状态和键盘可访问性。
- Secret 输入只允许创建或覆盖更新，不回填、不展示原值。
- 不在本项目中加入后端业务逻辑或数据库访问。

## 验证

按根 `projects.json` 执行 `lint`、`typecheck`、`test`、`build`；核心流程追加 `testE2e` 和桌面/移动视口检查。
