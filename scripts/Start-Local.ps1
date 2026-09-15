[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateRange(10, 600)]
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "Start-Local.ps1 is the Windows/WSL2 entry point."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $root "projects.json"
$infraScript = Join-Path $PSScriptRoot "Start-LocalInfra.ps1"
$runtimeDirectory = Join-Path $root ".runtime"
$logDirectory = Join-Path $runtimeDirectory "logs"
$processFile = Join-Path $runtimeDirectory "local-processes.json"

function Test-TcpPort {
  param([int]$Port)

  $client = [Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    return $connection.AsyncWaitHandle.WaitOne(300) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Test-HttpEndpoint {
  param(
    [string]$Uri,
    [scriptblock]$Validate
  )

  try {
    $response = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 2
    return & $Validate $response
  }
  catch {
    return $false
  }
}

function Get-ProjectCommand {
  param(
    [pscustomobject]$Manifest,
    [string]$ProjectId,
    [string]$CommandName
  )

  $project = $Manifest.projects | Where-Object { $_.id -eq $ProjectId } | Select-Object -First 1
  if (-not $project) {
    throw "Unknown project in projects.json: $ProjectId"
  }

  $commandProperty = $project.commands.PSObject.Properties[$CommandName]
  if (-not $commandProperty) {
    throw "Project '$ProjectId' has no '$CommandName' command."
  }

  return [pscustomobject]@{
    WorkingDirectory = [IO.Path]::GetFullPath((Join-Path $root $project.path))
    Command = @($commandProperty.Value)
  }
}

function Start-LocalService {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string[]]$Command
  )

  if ($Command.Count -eq 0) {
    throw "No command configured for local service '$Name'."
  }

  $commandInfo = Get-Command ([string]$Command[0]) -ErrorAction Stop
  $arguments = if ($Command.Count -gt 1) { @($Command[1..($Command.Count - 1)]) } else { @() }
  if ($commandInfo.CommandType -eq [Management.Automation.CommandTypes]::Application) {
    $executable = $commandInfo.Source
  }
  elseif ($commandInfo.CommandType -eq [Management.Automation.CommandTypes]::ExternalScript) {
    $commandShim = [IO.Path]::ChangeExtension($commandInfo.Source, ".cmd")
    if (Test-Path -LiteralPath $commandShim -PathType Leaf) {
      $executable = $commandShim
    }
    else {
      $executable = Join-Path $PSHOME "pwsh.exe"
      $quotedScript = '"' + $commandInfo.Source + '"'
      $arguments = @("-NoLogo", "-NoProfile", "-File", $quotedScript) + $arguments
    }
  }
  else {
    throw "Local service '$Name' command must resolve to an application or script: $($Command[0])"
  }
  $stdoutPath = Join-Path $logDirectory "$Name.stdout.log"
  $stderrPath = Join-Path $logDirectory "$Name.stderr.log"

  if (-not $PSCmdlet.ShouldProcess($Name, "Start local development service")) {
    return $null
  }

  $process = Start-Process `
    -FilePath $executable `
    -ArgumentList $arguments `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  return [pscustomobject]@{
    name = $Name
    pid = $process.Id
    process = $process
    stdout = $stdoutPath
    stderr = $stderrPath
  }
}

function Wait-LocalService {
  param(
    [pscustomobject]$Service,
    [pscustomobject]$StartedProcess
  )

  $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
  while ([DateTimeOffset]::Now -lt $deadline) {
    if (Test-HttpEndpoint -Uri $Service.HealthUri -Validate $Service.Validate) {
      Write-Host "$($Service.Name) is ready: $($Service.PublicUri)" -ForegroundColor Green
      return
    }

    if ($StartedProcess -and $StartedProcess.process.HasExited) {
      $errorTail = if (Test-Path -LiteralPath $StartedProcess.stderr) {
        (Get-Content -LiteralPath $StartedProcess.stderr -Tail 20) -join [Environment]::NewLine
      }
      throw "$($Service.Name) exited before becoming ready.`n$errorTail"
    }

    Start-Sleep -Milliseconds 500
  }

  throw "$($Service.Name) did not become ready within $TimeoutSeconds seconds. Logs: $($StartedProcess.stdout), $($StartedProcess.stderr)"
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "projects.json is missing: $manifestPath"
}
if (-not (Test-Path -LiteralPath $infraScript -PathType Leaf)) {
  throw "Local infrastructure script is missing: $infraScript"
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$backend = Get-ProjectCommand -Manifest $manifest -ProjectId "backend" -CommandName "dev"
$frontend = Get-ProjectCommand -Manifest $manifest -ProjectId "admin-web" -CommandName "dev"
$mockWorkingDirectory = $backend.WorkingDirectory

if ($PSCmdlet.ShouldProcess("WSL2 PostgreSQL and Redis", "Start local infrastructure")) {
  & $infraScript
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$services = @(
  [pscustomobject]@{
    Name = "backend"
    Port = 13001
    PublicUri = "http://127.0.0.1:13001"
    HealthUri = "http://127.0.0.1:13001/v1/auth/captcha"
    Validate = { param($response) $null -ne $response }
    WorkingDirectory = $backend.WorkingDirectory
    Command = $backend.Command
  },
  [pscustomobject]@{
    Name = "mock"
    Port = 13002
    PublicUri = "http://127.0.0.1:13002"
    HealthUri = "http://127.0.0.1:13002/api/mock/health"
    Validate = { param($response) $response.status -eq "ok" }
    WorkingDirectory = $mockWorkingDirectory
    Command = @("pnpm", "run", "dev:mock")
  },
  [pscustomobject]@{
    Name = "admin-web"
    Port = 15666
    PublicUri = "http://127.0.0.1:15666"
    HealthUri = "http://127.0.0.1:15666"
    Validate = { param($response) $null -ne $response }
    WorkingDirectory = $frontend.WorkingDirectory
    Command = $frontend.Command
  }
)

$startedProcesses = @{}
foreach ($service in $services) {
  if (Test-HttpEndpoint -Uri $service.HealthUri -Validate $service.Validate) {
    Write-Host "$($service.Name) is already ready: $($service.PublicUri)" -ForegroundColor Green
    continue
  }
  if (Test-TcpPort -Port $service.Port) {
    throw "Port $($service.Port) is occupied, but $($service.Name) health check failed: $($service.HealthUri)"
  }

  $started = Start-LocalService `
    -Name $service.Name `
    -WorkingDirectory $service.WorkingDirectory `
    -Command $service.Command
  if ($started) {
    $startedProcesses[$service.Name] = $started
  }
}

if (-not $WhatIfPreference) {
  try {
    foreach ($service in $services) {
      Wait-LocalService -Service $service -StartedProcess $startedProcesses[$service.Name]
    }
  }
  catch {
    foreach ($startedProcess in $startedProcesses.Values) {
      if (Get-Process -Id $startedProcess.pid -ErrorAction SilentlyContinue) {
        taskkill.exe /PID $startedProcess.pid /T /F 2>$null | Out-Null
      }
    }
    throw
  }

  $processState = @($startedProcesses.Values | ForEach-Object {
      [pscustomobject]@{
        name = $_.name
        pid = $_.pid
        stdout = $_.stdout
        stderr = $_.stderr
      }
    })
  [pscustomobject]@{
    startedAt = [DateTimeOffset]::Now.ToString("o")
    processes = $processState
  } | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 -LiteralPath $processFile

  Write-Host "All C2C local projects are ready." -ForegroundColor Cyan
  Write-Host "Process file: $processFile"
  Write-Host "Logs: $logDirectory"
}
