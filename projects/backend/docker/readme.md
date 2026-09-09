# Docker 部署

生产镜像只由 `app` 分支的 GitHub Actions 发布：

- `ghcr.io/sunlightcold/tpl-backend:app-latest`
- `ghcr.io/sunlightcold/tpl-backend:app-<commit SHA>`

## 首次部署

1. 将 `docker/compose.yaml` 和 `.env.docker.example` 放入服务器部署目录。
2. 将 `.env.docker.example` 复制为 `.env`，填写 PostgreSQL、Redis 密码和端口。
3. 将生产配置保存为 `volumes/config/production.js`。其中数据库、Redis 凭据必须与 `.env` 一致。
4. 使用具备 `read:packages` 权限的 GitHub PAT 登录 GHCR。

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u sunlightcold --password-stdin
docker compose pull
docker compose up -d
docker compose ps
```

`migrate` 会在 PostgreSQL 健康后执行。只有迁移成功退出，`app` 才会启动。

## 更新

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 migrate app
```

## 回滚

将 `.env` 中的 `TPL_BACKEND_IMAGE` 改为目标提交对应的不可变标签后重新部署：

```text
TPL_BACKEND_IMAGE=ghcr.io/sunlightcold/tpl-backend:app-<commit SHA>
```

镜像内的应用代码和 `initJson` 不通过宿主机目录覆盖；运行配置、日志、PostgreSQL 和 Redis 数据保留在服务器卷目录中。
