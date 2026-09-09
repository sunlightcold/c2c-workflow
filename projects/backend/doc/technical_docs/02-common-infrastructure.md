# 公共基础设施详细说明 (Common Infrastructure)

本文档专注于剖析 `tpl-backend/server/backend/common` 目录下的核心模块设计。这部分代码构成了服务层最底部的基础框架，通过基于 AOP（面向切面编程）理念的各类拦截器、守卫与过滤器，为上层业务提供了极大的便利与复用能力。

## 1. 异常处理与统一响应 (Filters & Interceptors)

为了前后端协同标准，项目对 HTTP 响应及错误抛出进行了强统一：

### 1.1 `ResponseInterceptor` (响应封装拦截器)
- **作用**: 统一包裹系统 Controller 层返回的数据，结构统一为 `{ code, data, message }` (依赖 `ResponseModel`)。
- **特性**: 配合自定义的 `@SkipResponseInterceptor()` 装饰器，能够在某些特殊接口（例如导出 Excel 或验证码渲染等原生流操作接口）上跳过数据包装。

### 1.2 `HttpExceptionFilter` (全局异常过滤器)
- **作用**: 捕获抛出到系统最外层的 `HttpException`，阻止 NestJS 的默认 HTML 报错，转换为标准 JSON 给前端。
- **扩展**:
  - 特别拦截了 `ThrottlerException`（速率限制异常），将其抛出的提示转化为友好的中文：“请求过于频繁，请稍后再试”。
  - 将异常对象堆栈记录进系统的 `Winston` Logger 中，并记录了异常请求时的客户端 IP。

### 1.3 `CheckExistsInterceptor` (存在性检查拦截器)
- **作用**: 高度复用的业务拦截器。很多接口的第一步是“查询数据库数据存不存在并报错”，该拦截器把这个动作抽象化。
- **用法**: 配合自定义装饰器 `@CheckExists(EntityClass, 'db_field', { source: 'body' | 'query' })`，在进入 Controller 控制器之前，提前读取参数并在对应 DB Repository 中进行 `exists` 检查。数据一旦冲突即抛出 `BadRequestException` 阻断。

## 2. 中间件与请求解析 (Middlewares)

在请求触达路由前，项目使用了两层全局中间件增强原生 Express `Request` 对象：

### 2.1 `RequestIpMiddleware` (客户端提取中间件)
- **提取 IP**: 利用 `request-ip` 剥离代理层得出真实 IP，并通过 `geoip-lite` 逆向解析地理位置 (City/Country)。
- **User-Agent 解析**: 利用 `ua-parser-js` 解析请求头获取具体的 Browser (浏览器) 与 OS (操作系统) 版本。
- **注入**: 最终将这些信息以结构化类型写入全局 `req.clientInfo`，供日志审核及授权行为分析使用。

### 2.2 `TokenMiddleware` (Token 提取中间件)
简单直接地将请求头中的 `Authorization: Bearer <token>` 切割并独立挂载到 `req.accessToken` 字段。

## 3. 装饰器抽象 (Decorators)

基于上述基础设施，`common/decorators` 收敛并提供了一批好用的注解，减轻了 Controller 层的冗余度：

- **`@ClientInfo()`**: 快速从 request 中提取上面中间件准备好的 IP/设备信息。
- **`@User()`**: 大部分接口基于 JWT 认证后，快速取出当前操作员的信息。
- **`@Permission()` / `@Roles()`**: 与守卫联动，细粒度的权限点与角色校验注解。
- **`@ApiResult()`**: (如果存在) 与 Swagger 联动的返回模型注解封装。

## 4. 全局安全相关防护 (Guards)

### `UUIDGuard`
- **作用**: 用来抵御**重放攻击**或重复提交流程。
- **原理**: 接口必须要求 `body` 携带一个标准 `isUUID` 格式的唯一值。到达这里时先去 `CacheService` (通常是 Redis) 中检查 UUID，如果已存在，报“无效请求”，如果不存则在 Redis 里塞入该 UUID 作为防重凭证。

## 5. 通用工具 (Utils)

最后，整个方案依赖 `common/utils` 作为底层纯函数库：
如数据脱敏、IP 校验、密码 Crypto 加解密 (`crypto.ts`)，基于 `exceljs` 的灵活导出封装 (`excel.ts`) 等。

---
