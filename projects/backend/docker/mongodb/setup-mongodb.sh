#!/bin/bash

# 定义MongoDB数据目录
MONGO_DIRS=("mongo1" "mongo2" "mongo3")

# Bitnami MongoDB容器使用的用户ID和组ID
# 通常Bitnami MongoDB镜像使用UID=1001, GID=1001
USER_ID=1001
GROUP_ID=1001

echo "开始创建MongoDB数据目录并设置权限..."

# 创建目录并设置权限
for dir in "${MONGO_DIRS[@]}"; do
    echo "处理目录: $dir"

    # 创建目录(如果不存在)
    mkdir -p "./$dir"

    # 设置所有权
    echo "设置 $dir 目录的所有权为 $USER_ID:$GROUP_ID"
    chown -R $USER_ID:$GROUP_ID "./$dir"

    # 设置权限
    echo "设置 $dir 目录的权限为 755"
    chmod -R 755 "./$dir"
done

echo "MongoDB数据目录已准备完成!"

# 检查是否安装了docker-compose
if command -v docker-compose &> /dev/null; then
    echo "正在启动MongoDB集群..."
    docker-compose up -d
    echo "MongoDB集群已启动!"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo "正在启动MongoDB集群..."
    docker compose up -d
    echo "MongoDB集群已启动!"
else
    echo "未检测到docker-compose命令，请手动执行 'docker-compose up -d' 或 'docker compose up -d' 启动MongoDB集群"
fi
