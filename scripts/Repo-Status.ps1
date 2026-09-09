param(
  [string]$Manifest = "$PSScriptRoot\..\projects.json"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json

Write-Host "## repository [single-git]" -ForegroundColor Cyan
git -C $root status --short --branch
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read root Git status"
}

foreach ($project in $config.projects) {
  Write-Host ""
  Write-Host "## $($project.id) [$($project.role)]" -ForegroundColor Cyan
  Write-Host ([IO.Path]::GetFullPath((Join-Path $root $project.path)))
  git -C $root status --short -- $project.path
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read project status: $($project.id)"
  }
}
