# AI Gateway 架构

AI Gateway 是 `main` 分支的通用平台 Module。业务 Module 只提交标准化请求，不拼装供应商请求体，
也不读取渠道密钥。

## 公共 Interface

```ts
AiGatewayService.execute(request: AiGatewayRequest): Promise<AiResult>
AiGatewayService.listTargets(featureCode, capability): Promise<AiRouteTargetView[]>
AiGatewayService.resolveTarget(featureCode, capability, modelCode?): Promise<AiRouteTargetView>
AiGatewayService.resolveExecutionRoute(featureCode, capability, routeTarget): Promise<ResolvedAiRoute>
```

请求通过 `featureCode + capability` 选择功能路由。Prompt、结构化结果解析、业务计费、队列和任务状态
仍归调用方业务 Module。异步任务创建时使用 `resolveTarget` 冻结 `channelCode + modelCode`，执行时把
该目标作为 `routeTarget` 传给 `execute`，避免路由调整后旧任务静默换模型。目标查询只返回协议、
模型和容量，不返回凭据、基础地址或上游模型名。只有需要生成远程执行计划的服务端可信 Adapter
可调用 `resolveExecutionRoute`；该接口返回解密凭据，不得暴露给 Controller 或业务响应。

## 数据模型

- `sys_ai_channel`：供应商、协议 Adapter、基础地址、加密凭据、并发和排队容量。
- `sys_ai_model`：上游模型、协议 Adapter 和能力集合。
- `sys_ai_feature_route`：业务功能到渠道/模型的有序路由。

供应商和协议是两个独立概念。同一供应商可以创建多个不同协议渠道，模型与渠道只有在
`adapterCode` 完全一致时才能组成路由。

## 协议 Adapter

支持的协议编码固定为：

- `openai-chat-completions`：`POST /chat/completions`，解析 `choices[].message.content`。
- `openai-responses`：`POST /responses`，解析 `output_text` 或 `output[].content[].output_text`。
- `openai-images`：纯文生图调用 `POST /images/generations`，带源图调用
  `POST /images/edits`，解析 `data[].url` 或 `data[].b64_json`。
- `gemini-generate-content`：`POST .../models/:model:generateContent`，解析文本或图片 parts。

不存在模糊的 `openai` Adapter。Chat Completions 与 Responses 的输入、输出和错误处理分别维护。

## 路由与失败切换

`DatabaseAiRouteResolver` 只返回满足以下条件的路由：

- 功能路由启用且 capability 一致；
- 渠道为 `active`；
- 模型启用并声明该 capability；
- 渠道与模型使用相同协议 Adapter。

路由按功能路由 `priority` 升序执行。只有网络错误、HTTP 429 和 HTTP 5xx 会切换到下一条路由；
鉴权失败、参数错误、协议响应错误和业务解析错误直接返回，不掩盖配置或调用方缺陷。

## 凭据

渠道 API Key 使用通用 `CredentialCipherService` 加密，主密钥配置为
`admin.credentialMasterKey`（由 `C2C_CREDENTIAL_MASTER_KEY` 提供）。管理接口只返回 `hasApiKey`，功能路由列表只返回渠道摘要。
