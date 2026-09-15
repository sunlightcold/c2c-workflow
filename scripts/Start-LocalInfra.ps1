$ErrorActionPreference = "Stop"

$isWindowsHost = if (Get-Variable IsWindows -ErrorAction SilentlyContinue) {
  $IsWindows
}
else {
  $env:OS -eq "Windows_NT"
}
if (-not $isWindowsHost) {
  throw "Start-LocalInfra.ps1 is the Windows/WSL2 entry point."
}

$requiredVariables = @(
  "C2C_POSTGRES_USER",
  "C2C_POSTGRES_PASSWORD",
  "C2C_POSTGRES_DB",
  "C2C_REDIS_URL"
)

foreach ($name in $requiredVariables) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "Required environment variable is missing: $name"
  }
}

try {
  $redisUri = [Uri]$env:C2C_REDIS_URL
  if ($redisUri.Host -notin @("localhost", "127.0.0.1") -or $redisUri.Port -ne 16380) {
    throw "Redis URL does not target the WSL2 container port"
  }
  $redisUserInfo = $redisUri.UserInfo -split ":", 2
  if ($redisUserInfo.Count -ne 2 -or [string]::IsNullOrWhiteSpace($redisUserInfo[1])) {
    throw "Redis URL has no password"
  }
  $env:C2C_REDIS_PASSWORD = [Uri]::UnescapeDataString($redisUserInfo[1])
}
catch {
  throw "C2C_REDIS_URL must target localhost:16380 and contain an encoded Redis password."
}

if (-not [string]::IsNullOrWhiteSpace($env:C2C_POSTGRES_HOST) -and $env:C2C_POSTGRES_HOST -notin @("localhost", "127.0.0.1")) {
  throw "C2C_POSTGRES_HOST must target the local WSL2 container."
}
if (-not [string]::IsNullOrWhiteSpace($env:C2C_POSTGRES_PORT) -and $env:C2C_POSTGRES_PORT -ne "15433") {
  throw "C2C_POSTGRES_PORT must be 15433 for Windows/WSL2 development."
}

$forwardedVariables = @(
  "C2C_POSTGRES_USER",
  "C2C_POSTGRES_PASSWORD",
  "C2C_POSTGRES_DB",
  "C2C_REDIS_PASSWORD"
)
$existingWslenv = $env:WSLENV
$wslenvItems = @()
if (-not [string]::IsNullOrWhiteSpace($existingWslenv)) {
  $wslenvItems += $existingWslenv -split ":"
}
$wslenvItems += $forwardedVariables
$env:WSLENV = ($wslenvItems | Select-Object -Unique) -join ":"

function Test-LocalTcpPort {
  param([int]$Port)

  $client = [Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    return $connection.AsyncWaitHandle.WaitOne(500) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

$wslKeepAlive = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
  Where-Object { $_.CommandLine -match 'sleep\s+2147483647' } |
  Select-Object -First 1
if (-not $wslKeepAlive) {
  $wslExecutable = (Get-Command "wsl.exe" -ErrorAction Stop).Source
  Start-Process `
    -FilePath $wslExecutable `
    -ArgumentList @("-e", "sleep", "2147483647") `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 1
}

wsl.exe -e sh -lc 'command -v docker >/dev/null && docker info >/dev/null'
if ($LASTEXITCODE -ne 0) {
  throw "WSL2 Docker Engine is unavailable."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPath = Join-Path $root "projects\backend"
$backendWslPath = (wsl.exe -e wslpath -a $backendPath).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($backendWslPath)) {
  throw "Unable to resolve the backend path inside WSL2."
}

$dataRootWsl = "/mnt/e/software/develop/docker-volumes/c2c-workflow"
wsl.exe -e mkdir -p "$dataRootWsl/postgres" "$dataRootWsl/redis"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to prepare the E: drive container data directories."
}

$containerNames = @("c2c-postgres-dev", "c2c-redis-dev")
$existingContainers = @(
  wsl.exe -e docker ps -a --format '{{.Names}}'
)
$knownContainers = @($containerNames | Where-Object { $existingContainers -contains $_ })

if ($knownContainers.Count -eq 0) {
  wsl.exe -e sh -lc 'cd "$1" && docker compose -f docker/compose.dev.yaml up -d --wait' sh $backendWslPath
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to create the WSL2 development containers."
  }
}
elseif ($knownContainers.Count -ne $containerNames.Count) {
  throw "Local infrastructure is incomplete. Expected both c2c-postgres-dev and c2c-redis-dev."
}
else {
  foreach ($containerName in $containerNames) {
    wsl.exe -e docker start $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to start WSL2 container: $containerName"
    }
  }
}

$postgresReady = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  wsl.exe -e sh -lc 'docker exec c2c-postgres-dev pg_isready -U "$C2C_POSTGRES_USER" -d "$C2C_POSTGRES_DB" >/dev/null 2>&1'
  if ($LASTEXITCODE -eq 0) {
    $postgresReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $postgresReady) {
  throw "PostgreSQL container is not ready."
}

$redisWithoutAuth = ""
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  $redisWithoutAuth = @(
    wsl.exe -e sh -lc 'docker exec c2c-redis-dev redis-cli --raw ping 2>&1'
  ) -join "`n"
  if ($redisWithoutAuth.Trim() -eq "PONG" -or $redisWithoutAuth -match "NOAUTH") {
    break
  }
  Start-Sleep -Seconds 1
}
if ($redisWithoutAuth.Trim() -eq "PONG") {
  Write-Warning "The existing Redis development container has no password; recreate it later to match compose.dev.yaml."
}
elseif ($redisWithoutAuth -match "NOAUTH") {
  $redisWithAuth = @(
    wsl.exe -e sh -lc 'docker exec c2c-redis-dev redis-cli --no-auth-warning --raw -a "$C2C_REDIS_PASSWORD" ping 2>&1'
  ) -join "`n"
  if ($redisWithAuth.Trim() -ne "PONG") {
    throw "Redis container rejected the configured credentials."
  }
}
else {
  throw "Redis container is not ready."
}

$hostPortsReady = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  if ((Test-LocalTcpPort -Port 15433) -and (Test-LocalTcpPort -Port 16380)) {
    $hostPortsReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $hostPortsReady) {
  throw "WSL2 container ports are not reachable from Windows."
}

Write-Host "WSL2 local infrastructure is ready: PostgreSQL 15433, Redis 16380." -ForegroundColor Green
