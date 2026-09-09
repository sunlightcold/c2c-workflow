# 领域词汇表

本文件只记录后端仓库的领域词汇，不记录实现细节。

## Platform API

通用后端平台能力，面向多个 app 或分支复用，包括认证、权限、支付、订单、限流、缓存、事件、日志和基础设施契约。

## App API

面向 C 端或移动端 app 的接口能力。它可以复用 Platform API，但不应把单个 app 的业务概念伪装成通用能力。

## App Branch

`app` 分支承载 app 个性化交付能力、业务扩展和项目专属接口。只有形成跨 app 复用价值的能力才应进入 `main` 的通用命名空间。

## Project-Specific App Domain

项目专属 app 业务域可以拥有自己的路由、权限、实体和文档，但不应被当成分支名、项目交付载体或通用后端能力名称。只有形成跨 app 复用价值的能力才应进入 `main`。

## Contract

后端对消费方承诺的接口、DTO、错误、鉴权、环境变量和行为兼容约束。Contract 必须沉淀到 `doc/api/` 或相关技术文档中。

## Admin Token Session

后台管理端登录 token 的服务端会话记录。记录存在表示 token 仍可管理；`online` / `offline` 表示该 token 当前是否有活跃 WebSocket 连接。撤销 token 会删除会话记录，并强制断开该 token 当前连接。

## Custom Scheduled Task

由后台用户维护的定时或间隔任务。它允许创建、编辑、启停和删除，适合业务侧可配置的周期作业。

## System Scheduled Task

由代码定义并注册到任务中心的定时任务。它不接受后台用户创建或编辑，只保留可观察、可审计的运行信息和日志。

## Task Log

定时任务的执行记录，包含开始时间、结束时间、耗时、结果和任务快照。

## Client Error Event

由 Web、PWA、Desktop 或 Mobile 客户端直接上报的技术异常记录。它包含客户端生成的事件 ID、版本、平台、发生位置、错误堆栈和有限操作轨迹，用于定位终端运行问题；它不是后台操作日志，也不保存请求体、Token、Cookie、Base64 或签名 URL。

## Business Time

面向统计、筛选、日报、限流桶、签到日期和趋势聚合的业务日期语义。数据库时间统一按 `common.dbTimeZone` 存储，业务日期统一按 `common.timeZone` 解释，日期范围使用半开区间 `[start, endExclusive)`。

`common/time` 是唯一允许直接使用 `dayjs` 的业务时间 seam。`apps/**` 和其它 `common/**` 代码必须通过 `common/time` 获取业务日期、SQL 日期表达式、TypeORM 时间范围或纯时长 helper，避免各模块自行拼接 `dayjs`、`BETWEEN`、`DATE_TRUNC` 或 `TO_CHAR` 导致边界偏差。

## Requirement

尚未完全稳定为 Contract 的需求、方案、迁移计划或联调说明。Requirement 存放在 `doc/requirements/`。

**C2C Merchant**:
代理商名下的一个 C2C 经营单元，创建时必须且只能选择一个交易平台（币安或欧易）。同一经营主体跨平台经营时分别创建 C2C Merchant，订单、凭据和同步状态不能跨商家混用。
_Avoid_: Platform Account, Merchant Platform Account

## Object Storage Center

平台维护的对象存储基础设施能力。它管理多个 S3-compatible 存储渠道，并为系统和 app 的具体存储用途提供渠道绑定；它不是文件浏览器，也不负责跨渠道迁移或自动故障切换。

## Storage Channel

一个可连接的 S3-compatible bucket 及其访问凭据和公开访问地址。渠道是基础设施连接，不等同于业务模块或存储用途。

## Storage Purpose

代码注册的具体文件使用场景，例如教程图片、头像、AI 结果或项目备份。用途拥有公开性、key 前缀和文件限制等安全策略，一个业务模块可以拥有多个用途。

## Storage Binding

存储用途与对象存储渠道之间的当前绑定关系。绑定只决定新对象写入哪个渠道，不改变已经保存对象的归属。

## Storage Object Reference

业务记录保存的对象位置，由 `storageChannelId` 和 `objectKey` 组成。读取和删除历史对象必须使用该引用，不能根据当前用途绑定重新推断渠道。

## Tutorial

平台维护的公开使用教程能力，可供不同客户端站点消费。Tutorial 按语言独立维护，包含标题、摘要、分区、Markdown 正文和 SEO 信息。

## Tutorial Draft

教程的可编辑版本。Tutorial Draft 的保存不会改变公开内容，只有发布动作才会生成新的公开版本。

## Tutorial Published Snapshot

教程发布时从当前草稿生成的公开快照。再次发布会用新草稿替换当前快照；公开 API、搜索引擎元数据和站点地图只读取该快照。
