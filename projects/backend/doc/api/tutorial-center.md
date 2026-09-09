# 教程中心 API

教程按语言独立维护。后台保存 `draft`，发布时将当前草稿复制到 `published`；公开接口只返回发布快照。

## 后台接口

统一前缀：`/sys/tutorials`

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/` | `system:tutorial:read` | 分页查询教程 |
| `POST` | `/` | `system:tutorial:create` | 创建教程草稿 |
| `GET` | `/:id` | `system:tutorial:read` | 查询教程详情 |
| `PUT` | `/:id` | `system:tutorial:update` | 保存教程草稿 |
| `DELETE` | `/:id` | `system:tutorial:delete` | 删除教程 |
| `POST` | `/:id/publish` | `system:tutorial:publish` | 发布当前草稿快照 |
| `POST` | `/:id/unpublish` | `system:tutorial:publish` | 下线公开快照 |
| `POST` | `/images` | `system:tutorial:upload` | 上传教程图片 |

创建和更新请求：

```json
{
  "locale": "zh",
  "slug": "getting-started",
  "content": {
    "title": "快速开始",
    "summary": "创建第一个拼豆项目",
    "section": "入门",
    "markdown": "# 快速开始",
    "seoTitle": "C2C 后台快速开始",
    "seoDescription": "C2C 后台入门教程",
    "coverUrl": "https://example.com/cover.png"
  }
}
```

支持语言：`zh`、`en`、`ja`、`zh-Hant`。

## 公开接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/tutorials?locale=zh` | 查询已发布教程 |
| `GET` | `/tutorials/:slug?locale=zh` | 查询已发布教程详情 |

公开接口不返回 `draft`，未发布或已下线教程按不存在处理。列表接口不返回
`content.markdown`，正文仅由详情接口提供。
