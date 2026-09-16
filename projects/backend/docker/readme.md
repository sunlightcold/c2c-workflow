# Docker 服务器部署

后端由 `.github/workflows/backend-image.yml` 在 `main` 更新后验证、构建并发布到 GHCR：

- `ghcr.io/sunlightcold/c2c-workflow-backend:latest`
- `ghcr.io/sunlightcold/c2c-workflow-backend:sha-<40 位提交 SHA>`

Actions 运行产物中还会生成 `c2c-backend-deploy-<SHA>` 部署文件包。镜像同时支持
`linux/amd64` 和 `linux/arm64`。

## 服务器前提

- Linux 服务器已安装 Docker Engine 与 Docker Compose v2。
- API 只绑定服务器 `127.0.0.1`，由 Nginx/OpenResty/Caddy 提供 HTTPS 反向代理。
- GHCR 包若为 private，服务器需要一个仅有 `read:packages` 权限的 GitHub token。
- PostgreSQL、Redis、上传文件和日志目录必须纳入服务器备份。

## 首次部署（GHCR 镜像）

将 Actions 部署文件包解压到一个独立目录，确保该目录直接包含 `compose.yaml`、`backup.sh`、
`.env.example` 和本说明，然后执行：

```bash
cp .env.example .env
chmod 600 .env
mkdir -p volumes/logs volumes/static volumes/postgres_data volumes/redis_data
sudo chown -R 1000:1000 volumes/logs volumes/static
```

编辑 `.env`，至少替换以下值：

- `C2C_BACKEND_IMAGE`：建议直接填写本次 Actions 产出的 `sha-<SHA>` 镜像。
- `C2C_POSTGRES_PASSWORD`、`C2C_REDIS_PASSWORD`：使用独立随机强密码；Redis 建议使用
  `openssl rand -hex 32` 生成 URL-safe 值。
- `C2C_SUPER_ADMIN_PASSWORD`：首次超级管理员强密码。
- `C2C_CREDENTIAL_MASTER_KEY`：至少 32 字节随机值，投入使用后不得直接更换。
- `C2C_STATIC_SERVER_URL`：API 对外 HTTPS 地址。
- 所有数据库 `env://NAME` Secret 引用对应的环境变量。

登录 GHCR 并检查最终配置。不要把 token 写进命令历史或 `.env`：

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
docker compose --env-file .env config --quiet
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=200 migrate app
curl --fail --silent --show-error http://127.0.0.1:3000/v1/auth/captcha >/dev/null
```

`migrate` 在 PostgreSQL 健康后持有 advisory lock 并执行待运行的 TypeORM migrations。只有迁移
成功退出且 Redis 健康，`app` 才会启动。`app` 的 Docker 健康检查同样请求真实 captcha 接口。

## 首次部署（服务器本地构建镜像）

部署包同时包含预编译的 `admin`、`migrate`、生产配置和完整的后端 Docker 构建上下文，不需要
登录 GHCR。服务器构建只安装生产依赖并组装镜像，不再重复执行 Nest/Webpack 编译。解压部署包后执行：

```bash
bash ./deploy.sh
```

首次执行会生成 `.env` 并提示填写必要配置；填写后再次执行同一命令即可。后续每次更新覆盖部署包
文件后仍只执行 `bash ./deploy.sh`。脚本会自动备份运行中的 PostgreSQL、固定本地镜像配置、构建
镜像、执行迁移、启动服务并等待健康检查。仅在明确不需要备份时可使用
`C2C_SKIP_BACKUP=1 bash ./deploy.sh`。

本地构建会从 Docker Hub 下载 `node:22-bookworm-slim` 和 `postgres`/`redis` 基础镜像，
但不需要 GitHub Token。服务器需要 Docker Engine、Compose v2 和能访问 Docker Hub 的网络。

## 更新

本地构建部署更新时，覆盖新部署包文件后执行：

```bash
bash ./deploy.sh
```

GHCR 镜像部署仍先执行 `bash ./backup.sh`，再把 `.env` 的镜像改为新 `sha-<SHA>` 标签：

```bash
bash ./backup.sh
docker compose --env-file .env config --quiet
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
docker compose --env-file .env ps
docker compose --env-file .env logs --tail=200 migrate app
```

确认健康后再清理旧镜像。不要在部署命令中使用 `docker compose down -v`，它会删除持久化数据。

## 回滚

将 `C2C_BACKEND_IMAGE` 改回兼容当前数据库结构的旧 `sha-<SHA>` 标签，再重复更新命令。数据库
migration 为 forward-only；若新版本包含不兼容迁移，不能只回滚镜像，必须按发布方案恢复数据库
备份或执行专门的兼容迁移。

`backup.sh` 默认把 PostgreSQL custom-format 备份写入 `./backups` 并保留 7 天。可通过
`C2C_BACKUP_DIR` 和 `C2C_BACKUP_KEEP_DAYS` 覆盖，恢复演练应在独立数据库中定期执行。
