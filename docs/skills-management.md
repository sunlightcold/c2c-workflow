# 工作区 Skills 管理

## 原则

本项目只使用有明确来源、项目绑定和 commit 锁定的本地 Skills。实际内容位于 `.codex/skills/`，声明在 `skills.json`，解析后的来源提交记录在 `skills.lock.json`。

Codex 自带的 `playwright` 等运行时 Skill 不重复复制；需要跨环境稳定使用的第三方 Skill 才进入本地清单。

## 已选 Skills

| Skill | 用途 |
| --- | --- |
| `nestjs-best-practices` | NestJS、TypeORM、队列、安全和测试 |
| `domain-modeling` | 订单、支付、租户和外部平台状态建模 |
| `code-review` | 风险优先的实现审查与测试缺口检查 |
| `diagnose` | 缺陷复现与证据驱动诊断 |
| `tdd` | 功能和修复的 red-green-refactor |
| `improve-codebase-architecture` | 领域边界与耦合治理 |
| `grill-with-docs` | 需求、方案和 ADR 审查 |
| `handoff` | 跨任务交接 |
| `ui-ux-pro-max` | 管理后台 UI/UX 质量 |

## 查看、安装和更新

```powershell
.\scripts\List-Skills.ps1
.\scripts\Sync-Skills.ps1 -All
.\scripts\Sync-Skills.ps1 -SkillId nestjs-best-practices -Force
.\scripts\Test-Workflow.ps1
```

同步流程先解析远端 ref 的 commit，在 `.codex/.skill-sync/` 暂存并校验 `SKILL.md`，再替换现有版本。下载失败不会先删除可用版本。安装完成后会更新 `skills.lock.json` 及 Skill 目录中的 `.codex-skill-source.json`。

## 新增 Skill

1. 确认任务无法被现有 Skill 覆盖，并审查来源仓库及 `SKILL.md`。
2. 在 `skills.json` 登记 ID、来源、用途和适用项目。
3. 在 `skills.lock.json` 创建对应条目。
4. 在 `projects.json` 绑定项目。
5. 运行同步与工作流验证。

不能把未知来源 Skill 直接安装到全局目录，也不能让 Skill 覆盖项目或根级安全规则。
