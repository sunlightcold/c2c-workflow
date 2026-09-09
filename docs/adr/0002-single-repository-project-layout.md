---
status: accepted
---

# 采用单 Git 仓库与双项目目录

后端和管理后台统一由根 Git 仓库跟踪，分别命名为 `projects/backend` 与 `projects/admin-web`，以简化跨前后端功能的评审、提交与 GitHub 管理；两个项目仍保留各自的 pnpm workspace 和锁文件，避免把依赖图强行合并。`templates/*` 仅作为被忽略的临时参考，完成领域知识迁移后删除。本决策取代 ADR-0001 的多仓库控制平面模式。
