#!/bin/bash
#
# 脚本名称: backup_postgres_docker_static.sh
# 功能描述: 备份 Docker 容器中的 PostgreSQL 数据库到宿主机指定目录
#           所有配置信息直接写在此脚本中，无需命令行参数
#

set -e

# ========== 用户配置区域 ==========
# 请根据实际情况修改以下变量

# PostgreSQL 容器名称
CONTAINER="tpl-postgres"

# 要备份的数据库名称
DATABASE="tpl_backend"

# 数据库用户名
DB_USER="tpl_backend"

# 数据库密码 (建议限制脚本权限为 600 或 700)
DB_PASSWORD="Z6Rh1aQ7Khkb"

# 宿主机备份目录
BACKUP_DIR="/www/backup/tpl_backend"

# 保留最近几天的备份文件（超过此天数的自动删除，设为 0 表示不清理）
KEEP_DAYS=7

# =================================

# 导出密码为环境变量，以便 pg_dump 使用
export PGPASSWORD="$DB_PASSWORD"

# 检查容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "错误: 容器 '$CONTAINER' 未运行或不存在"
    exit 1
fi

# 创建备份目录（如果不存在）
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DATABASE}_${TIMESTAMP}.sql"

echo "开始备份数据库 '$DATABASE' 从容器 '$CONTAINER'..."

# 执行备份
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DATABASE" > "$BACKUP_FILE"; then
    echo "备份成功完成！"
    echo "备份文件: $BACKUP_FILE"
else
    echo "备份失败！"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# 清理旧备份
if [ "$KEEP_DAYS" -gt 0 ]; then
    echo "清理超过 $KEEP_DAYS 天的旧备份文件..."
    find "$BACKUP_DIR" -name "${DATABASE}_*.sql" -type f -mtime +$KEEP_DAYS -exec rm -v {} \;
fi

echo "操作完成。"