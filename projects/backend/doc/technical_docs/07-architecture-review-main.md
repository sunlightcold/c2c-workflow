# main 架构审查记录

本文记录 `main` 分支公共平台能力的架构审查结果，依据 NestJS 规范和本仓库分支职责边界整理。

## 1. 本轮处理范围

- 公共启动初始化：`InitService`
- 公共请求上下文：`CreatorPipe`、`UpdaterPipe`、`RawBody`
- 公共事件封装：`EventEmitterService`
- 公共 S3-compatible 对象存储适配：`StorageService`
- 公共失败限制：`FailLimitInterceptor`
- 公共静态文件模块：`StaticController`、`StaticService`
- 公共限流与 Socket 鉴权：`RateLimitGuard`、`SocketAuthGuard`
- 通用工具：`format.ts`、`query-builder.ts`

## 2. 已修正的问题

- 将多处属性注入改为构造函数注入，让 Module 的依赖在 Interface 上显式可见。
- 删除错误命名的 `logger.service.ts`，避免 LoggerModule 导出一个与事件模块重复命名的浅 Module。
- 用 `Logger` 替换启动初始化中的 `console.log`。
- 减少 `any` 的公共层扩散，改为 `unknown`、`FindOptionsWhere` 或受限的 `QueryValue`。
- 统一 OSS 未初始化错误为 `InternalServerErrorException`，避免在 HTTP 应用中抛裸 `Error`。
- 移除 `ListObjectsV2Command` 响应上的 `as any`，直接使用 SDK 类型字段。
- 将失败限制错误消息提取为显式类型收窄函数，避免调用方依赖隐式错误形状。

## 3. 仍需继续拆解的候选

- `system/auth`、`system/role`、`system/menu` 仍有大量属性注入，建议后续按模块逐步转为构造函数注入。
- `payment.service.ts`、`trade-order.service.ts`、`wallet.service.ts` 是大 Service，Interface 仍偏宽，后续应按支付状态流转、退款、补偿、钱包账本等概念拆深 Module。
- 多个 DTO / entity 仍使用 `Record<string, any>` 表示元数据，后续需要为支付、权益、订单快照分别定义稳定 Contract。
- 测试中仍有针对私有方法的 `as any` 调用，说明补偿调度逻辑缺少更合适的公共测试 Interface。

## 4. 分支约束

以上修正属于公共平台能力，应先进入 `main`，再由 `app` 合并继承。`app` 分支内的项目专属模块能力不应反向放入 `main`。
