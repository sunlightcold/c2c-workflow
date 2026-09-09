param(
  [string]$Project,
  [string]$Command,
  [switch]$List,
  [string]$Manifest = "$PSScriptRoot\..\projects.json"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json

if ($List) {
  foreach ($item in $config.projects) {
    $commandNames = ($item.commands.PSObject.Properties.Name | Sort-Object) -join ", "
    Write-Host "$($item.id) [$($item.role), $($item.writePolicy)] -> $($item.path)"
    Write-Host "  commands: $commandNames"
  }
  exit 0
}

if (-not $Project -or -not $Command) {
  throw "Usage: .\scripts\Invoke-Project.ps1 -Project <id> -Command <commandName>"
}

$target = $config.projects | Where-Object { $_.id -eq $Project } | Select-Object -First 1
if (-not $target) {
  throw "Unknown project: $Project"
}

$commandProperty = $target.commands.PSObject.Properties[$Command]
if (-not $commandProperty) {
  $available = ($target.commands.PSObject.Properties.Name | Sort-Object) -join ", "
  throw "Unknown command '$Command' for project '$Project'. Available: $available"
}

$repoPath = [IO.Path]::GetFullPath((Join-Path $root $target.path))
if (-not $repoPath.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Project path escapes workspace: $repoPath"
}
if (-not (Test-Path -LiteralPath $repoPath -PathType Container)) {
  throw "Project path does not exist: $repoPath"
}

$argv = @($commandProperty.Value)
if ($argv.Count -eq 0 -or [string]::IsNullOrWhiteSpace([string]$argv[0])) {
  throw "Command '$Command' for project '$Project' is empty"
}

$executable = [string]$argv[0]
$arguments = if ($argv.Count -gt 1) { @($argv[1..($argv.Count - 1)]) } else { @() }

Write-Host "Project: $($target.id)" -ForegroundColor Cyan
Write-Host "Policy: $($target.writePolicy)"
Write-Host "Path: $repoPath"
Write-Host "Command: $executable $($arguments -join ' ')"

Push-Location $repoPath
try {
  & $executable @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Project command failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
