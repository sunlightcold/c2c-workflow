#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
compose_file=${C2C_COMPOSE_FILE:-"${script_dir}/compose.yaml"}
env_file=${C2C_ENV_FILE:-"${script_dir}/.env"}
backup_dir=${C2C_BACKUP_DIR:-"${script_dir}/backups"}
keep_days=${C2C_BACKUP_KEEP_DAYS:-7}

if [[ ! -f "$compose_file" ]]; then
  echo "Compose file not found: $compose_file" >&2
  exit 1
fi
if [[ ! -f "$env_file" ]]; then
  echo "Environment file not found: $env_file" >&2
  exit 1
fi
if [[ ! "$keep_days" =~ ^[0-9]+$ ]]; then
  echo "C2C_BACKUP_KEEP_DAYS must be a non-negative integer" >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
backup_file="${backup_dir}/c2c_backend_${timestamp}.dump"
temporary_file="${backup_file}.partial"

cleanup() {
  rm -f -- "$temporary_file"
}
trap cleanup EXIT

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$temporary_file"

test -s "$temporary_file"
mv -- "$temporary_file" "$backup_file"

if (( keep_days > 0 )); then
  find "$backup_dir" -maxdepth 1 -type f -name 'c2c_backend_*.dump' -mtime "+$keep_days" -delete
fi

echo "Backup created: $backup_file"
