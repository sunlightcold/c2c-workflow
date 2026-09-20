#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
compose_file=${C2C_COMPOSE_FILE:-"${script_dir}/compose.yaml"}
env_file=${C2C_ENV_FILE:-"${script_dir}/.env"}
env_example=${C2C_ENV_EXAMPLE:-"${script_dir}/.env.example"}
health_attempts=${C2C_HEALTH_ATTEMPTS:-60}
health_interval_seconds=${C2C_HEALTH_INTERVAL_SECONDS:-2}
deployment_started=0

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

env_value() {
  local key=$1
  local line
  line=$(grep -m1 -E "^${key}=" "$env_file" || true)
  printf '%s' "${line#*=}"
}

set_env_value() {
  local key=$1
  local value=$2
  if grep -q -E "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

show_failure_logs() {
  local exit_code=$?
  if (( exit_code != 0 && deployment_started == 1 )); then
    echo "Deployment failed. Recent container logs:" >&2
    compose logs --tail=200 migrate app postgres redis >&2 || true
  fi
  exit "$exit_code"
}
trap show_failure_logs EXIT

require_command docker
require_command curl
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
[[ -f "$compose_file" ]] || die "Compose file not found: $compose_file"

if [[ ! -f "$env_file" ]]; then
  [[ -f "$env_example" ]] || die "Environment template not found: $env_example"
  cp -- "$env_example" "$env_file"
  chmod 600 "$env_file"
  cat >&2 <<EOF
Created ${env_file}.
Fill C2C_POSTGRES_PASSWORD, C2C_REDIS_PASSWORD, C2C_SUPER_ADMIN_PASSWORD,
C2C_CREDENTIAL_MASTER_KEY and C2C_STATIC_SERVER_URL, then run the same command again:

  bash ./deploy.sh
EOF
  exit 2
fi

chmod 600 "$env_file"
required_variables=(
  C2C_POSTGRES_PASSWORD
  C2C_REDIS_PASSWORD
  C2C_SUPER_ADMIN_PASSWORD
  C2C_CREDENTIAL_MASTER_KEY
  C2C_STATIC_SERVER_URL
)
missing_variables=()
for variable in "${required_variables[@]}"; do
  value=$(env_value "$variable")
  if [[ -z "$value" || "$value" == *"example.com"* ]]; then
    missing_variables+=("$variable")
  fi
done
if (( ${#missing_variables[@]} > 0 )); then
  die "Configure these values in ${env_file}: ${missing_variables[*]}"
fi

set_env_value C2C_BACKEND_IMAGE c2c-workflow-backend:local
set_env_value C2C_PULL_POLICY never

mkdir -p -- \
  "${script_dir}/backups" \
  "${script_dir}/volumes/logs" \
  "${script_dir}/volumes/static" \
  "${script_dir}/volumes/postgres_data" \
  "${script_dir}/volumes/redis_data"

if [[ $(id -u) -eq 0 ]]; then
  chown -R 1000:1000 "${script_dir}/volumes/logs" "${script_dir}/volumes/static"
elif [[ $(stat -c '%u' "${script_dir}/volumes/logs") -ne 1000 ]] ||
  [[ $(stat -c '%u' "${script_dir}/volumes/static") -ne 1000 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo chown -R 1000:1000 "${script_dir}/volumes/logs" "${script_dir}/volumes/static"
  else
    die "volumes/logs and volumes/static must be writable by uid 1000"
  fi
fi

deployment_started=1
if [[ ${C2C_SKIP_BACKUP:-0} != 1 ]] && [[ -n $(compose ps --status running -q postgres) ]]; then
  echo "[1/6] Backing up PostgreSQL..."
  C2C_COMPOSE_FILE="$compose_file" C2C_ENV_FILE="$env_file" bash "${script_dir}/backup.sh"
else
  echo "[1/6] Backup skipped: PostgreSQL is not running or C2C_SKIP_BACKUP=1."
fi

echo "[2/6] Validating deployment configuration..."
compose config --quiet

echo "[3/6] Building local backend image..."
compose build app

echo "[4/6] Starting PostgreSQL, Redis and database migration..."
compose up -d postgres redis migrate
migrate_container=$(compose ps -a -q migrate)
[[ -n "$migrate_container" ]] || die "Migration container was not created"
migrate_exit_code=$(docker wait "$migrate_container")
if [[ "$migrate_exit_code" != 0 ]]; then
  compose logs --tail=200 migrate >&2
  die "Database migration failed with exit code ${migrate_exit_code}"
fi

echo "[5/6] Starting backend application..."
compose up -d --remove-orphans app

backend_port=$(env_value C2C_BACKEND_PORT)
backend_port=${backend_port:-3000}
health_url="http://127.0.0.1:${backend_port}/v1/auth/captcha"
echo "[6/6] Waiting for backend health check: ${health_url}"
for (( attempt = 1; attempt <= health_attempts; attempt += 1 )); do
  if curl --fail --silent --show-error "$health_url" >/dev/null 2>&1; then
    compose ps
    trap - EXIT
    echo "C2C backend deployment completed successfully."
    exit 0
  fi
  sleep "$health_interval_seconds"
done

die "Backend health check failed after ${health_attempts} attempts"
