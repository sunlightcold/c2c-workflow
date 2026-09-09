# 运维文档

这里放数据库、脚本、部署和排障说明。

## 当前条目

- [database-migrations.md](database-migrations.md)
- [mongodb-docker-notes.md](mongodb-docker-notes.md)
- [cf-r2-reverse-proxy-config.md](cf-r2-reverse-proxy-config.md)

## 规则

- 只写可执行的操作说明
- 不放业务叙述
- 不放明文密钥
- 数据库结构变更必须遵守 [数据库迁移规范](database-migrations.md)，不得新增只靠人工执行的生产迁移流程
