# IP 代理实施契约

参考源码固定为 `Wei-Shaw/sub2api@455d317d6a87d8519a52c8769a0727824c403171`。
本次仅实施代理管理、商家绑定及请求出口，不实施聊天聚合。

2026-10-16 页面重构：管理后台使用项目统一的 `useResourceGrid`、Vben Form 与 `BaseModal`，筛选、表格工具栏和分页与既有资源页一致；表单桌面双列、移动端单列。按用户最新要求，仅删除数据导入、数据导出的页面入口、弹窗及前端调用。标准添加、批量 URL 添加、连接测试、质量检测、有效期、提醒天数、到期策略和商家绑定保留。提醒天数用于列表的临近到期标记，不发送主动通知。服务端 JSON 兼容接口保留，本次不调整后端和数据库。

商家账号列表新增独立的代理列，直接选择代理或直连并保存，失败保留原绑定；同一经营单位的代理选项共享一次查询。保存成功仅更新当前行与代理账号数，不刷新整表。操作列沿用商家订单的“配置 + 更多”布局，固定宽度 150px；测试、同步、编辑、删除移入按权限显示的菜单。选择框文字、箭头和选中图标保持单行，弹层挂载到 body，避免被表格固定列遮挡。

- 菜单：商家管理 / 代理管理，`/business/proxies`，权限 `system:proxy:{read,create,update,delete,test,quality,import,export,bind}`。
- 标准添加 / 批量添加位于同一弹窗。协议为 http、https、socks5、socks5h；批量 URL 的正则、空白处理、IPv6 去括号、按 host/port/username/password 去重与源页面一致。部分无效行不阻止有效行创建。
- 服务端 JSON 兼容接口接受 POST `{data:文件内容}`。兼容 `type=sub2api-data/sub2api-bundle`、version=1 或缺省，必须有 proxies/accounts 数组；accounts 忽略。管理后台不再提供文件导入和导出。
- 兼容接口字段保持 `exported_at`、`proxy_key`、`expires_at`（Unix 秒）、`expiry_warn_days`。逐条返回 `proxy_created/proxy_reused/proxy_failed/account_created/account_failed/errors`。
- API 根 `/v1/sys/proxies`：GET 列表（page/page_size/search/protocol/status/sort_by/sort_order），GET all，POST 创建，POST batch，POST data，GET data，PUT :id，DELETE :id，POST batch-delete，POST :id/test，POST :id/quality-check，GET :id/accounts，PUT bindings/:merchantId。
- 所有请求携带 tenantId（代理商账号由服务端强制约束）；ID 为 UUID 字符串。列表时间为 ISO，迁移文件时间沿用秒。
- C2C 必要差异：密码加密且查询、导出、错误和日志不回显。导出保留 JSON 字段结构但省略密码，proxy_key 不含密码；含认证代理跨实例恢复需重新提供密码。导入允许密码输入。到期策略沿用 none/proxy/direct，备用引用使用 backup_proxy_name；名称未找到按源码降级 none 并报告警告。每分钟按到期策略持久化切换绑定；连接失败不触发切换。
- 商家绑定必须同单位、代理启用且未到期；删除已绑定代理返回409。停用或到期且未完成有效策略切换时请求失败；显式 direct 到期策略或手动解绑后才恢复直连。所有平台 HTTP 和币安已有 WebSocket 发送路径都采用相同出口。
- 商家代理覆盖该商家调用币安/欧易的全部接口：测试连接、订单同步/查单/报表、广告查询/调价/行情、付款前平台查单/标记付款、聊天、申诉，以及平台返回的文件上传地址和币安 WebSocket。币安申诉预签名地址的实际 PUT 上传也必须携带同一商家的代理上下文，但不得附加币安 API 凭据或改写预签名地址。代理失效或连接失败时阻止发送，不尝试直连；未绑定代理时保持直连。支付宝支付、支付回单下载、Telegram 调用不属于商家平台代理范围。
- 连接测试经真实代理访问源实现的 ip-api/ipify；质量检测沿用源实现的固定目标、状态判定与评分，不接受客户端自定义探测 URL。失败结果不暴露凭据。

验收覆盖：四协议与 IPv6 批量解析、源 JSON 导入兼容、部分成功与复用、Secret 脱敏、跨单位禁止、绑定删除保护、出口故障不直连、迁移首次执行及重复部署跳过。

## 本轮审查修正

- 查看绑定商家同时要求 `system:proxy:read` 和 `merchant:account:read`；绑定入口与后端保持 `system:proxy:bind`、`merchant:account:update` 的权限要求。
- 批量 URL 保持原正则和导入格式，解析阶段额外排除后端不接受的地址字符，避免一条非法地址阻断有效项。
- 修正源页面继承的续期问题：过期是派生状态，编辑时未显式选择启停状态就省略 status，续期保留原持久化状态。
- 出口探测严格要求 HTTP 200，ip-api 还必须返回 status=success；失败仍通过同一代理尝试 ipify。
- 统一使用 ws 发送币安 WebSocket 消息，以发送回调结束发送，移除原生 WebSocket 兼容分支和缓冲轮询。发送成功仅表示本地发送完成，不代表平台业务回执。

## 源码对应关系

| 行为 | sub2api 源文件 |
| --- | --- |
| 标准/批量添加、URL 正则、去重、有效期日期提交 | `frontend/src/views/admin/ProxiesView.vue` |
| JSON 服务端兼容格式（管理后台入口已移除） | `frontend/src/components/admin/proxy/ImportDataModal.vue`、`backend/internal/handler/admin/proxy_data.go` |
| 搜索、无代理、单项/批量测试 | `frontend/src/components/common/ProxySelector.vue` |
| 导入导出字段、复用及备用名称解析 | `backend/internal/handler/admin/proxy_data.go`、`account_data.go` |
| 固定探测目标、状态判定与质量评分 | `backend/internal/service/admin_proxy.go` |
| 到期备用链、失效节点与环路处理 | `backend/internal/service/proxy_fallback.go` |

## 验证记录（2026-10-16）

- 后端 lint、类型检查、构建、workspace/catalog 检查通过；116 套/743 项单元测试、34 套/113 项集成测试、8 套/78 项 HTTP 契约测试通过。
- 初版前端 lint、类型检查、构建及 56 套/364 项单元测试通过；当时的代理导入及完整菜单桌面/移动回归通过。标准表单测试同时确认日期按原实现的 UTC 日期字符串转换为 Unix 秒。
- 页面重构后，前端类型检查、构建及 56 套/364 项单元测试通过；最新代理专项桌面/移动端共 6 项浏览器回归通过，覆盖标准与批量添加、移除导入导出入口、分页与跨页勾选、排序、连接测试、质量报告、到期备用策略编辑及商家绑定。本轮仅调整管理后台及契约文档，无后端或数据库变更。
- 商家账号列调整后，桌面/移动端 10 项相关浏览器回归通过；代理单元格追加验证保存前、中、后的行高一致、成功不重查列表、切换直连及失败保留原绑定。前端 56 套/364 项单元测试通过，无需数据库迁移。
- 商家平台出口补齐：币安申诉实际文件上传携带商家代理上下文，统一平台代理入口检查完成。后端 lint、类型检查、构建、workspace/catalog 及 116 套/746 项单元测试通过；本地认证代理测试覆盖 HTTP 上传、HTTPS CONNECT、代理拒绝请求、停用/过期拒绝发送，以及预签名上传不附加币安 API 密钥。本地验证码接口 code=200，近期日志无数据库/Redis 连接错误。本次仅修改后端内部调用与文档，无前端 API 或数据库结构变化；未调用真实商家平台接口。
- 完整前端 E2E 的既有 Telegram 管理用例在两个视口均失败：断言预期 13 个能力，当前界面只有 11 个，并沿用旧的 MANUAL_PAYMENT 夹具。未修改机器人实现以迎合旧断言。
- 正式 migration runner 已在本地 WSL PostgreSQL 执行；登录后代理列表及 `/sys/menus/web` 的菜单注册检查通过；验证码接口返回成功，启动未发现数据库/Redis 连接错误。
- 外部商用代理环境下的真实 OKX/币安业务请求未执行；出口测试使用本地认证 HTTP 代理，探测及备用逻辑通过隔离测试验证。
- 最终规范与需求复审完成：删除必需依赖的可选注入分支、代理选项重复加载和重复字段映射，补齐读取/绑定权限，修正过期续期与探测结果判定。后端 116 套/751 项、前端 56 套/364 项单元测试通过；HTTP 契约 8 套/78 项、受影响的桌面/移动浏览器回归共 10 项通过。前后端 lint、类型检查、构建及根工作流、Secret 扫描通过。
- 数据库集成覆盖 34 套/117 项：全量运行时自动支付套件遇到模拟服务连接重置；复跑定位到原夹具仅提前 1 秒设置回查时间，受 WSL 数据库与 Windows 应用时钟偏差影响。夹具改为固定历史时间，支付业务逻辑不变，失败套件复跑通过。前端构建首次遇到生成类型文件的本地写入错误，重试通过。

发布顺序：生产通过打包输出的 migrate 服务执行 `C2cIpProxies1789030000000`，再启动后端，最后部署管理后台。根凭据主密钥沿用现有配置。
