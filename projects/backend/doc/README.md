# 文档索引

本目录只放后端仓库的协作文档。

## 分类

- `technical_docs/`：架构、模块边界、配置、发布与约束
- `api/`：按消费方和业务域拆分的接口文档
- `requirements/`：需求、方案、迁移计划和前端联调说明
- `ops/`：数据库、脚本、部署、排障
- `oauth/`：只放说明，不放明文密钥

## 输出规则

- 文件名统一用英文 `kebab-case`
- 一个文件只讲一个主题
- 新增文档先放到对应分类，再更新这个索引
- 与后端/前端职责有关的约束，优先写进 `technical_docs/`
- 接口文档必须落在 `api/`，不再新增 `api文档/`、`接口文档/` 等同义目录
- 需求和方案必须落在 `requirements/`，不再新增 `需求文档/` 等同义目录

## 当前约定

- `projects/backend`：后台 API、领域服务、任务和外部平台适配器
- `projects/admin-web`：平台与代理商管理界面
- `common/`：只放跨分支可复用的基础设施，不放业务私货
- [分支边界](technical_docs/00-branch-boundaries.md)
- [技术文档入口](technical_docs/README.md)
- [API 文档入口](api/README.md)
- [需求文档入口](requirements/README.md)
- [后端测试策略](technical_docs/08-testing-strategy.md)
- [运维文档入口](ops/README.md)
- [数据库迁移规范](ops/database-migrations.md)
