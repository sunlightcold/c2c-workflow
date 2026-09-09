param(
  [string]$Manifest = "$PSScriptRoot\..\skills.json",
  [string]$LockFile = "$PSScriptRoot\..\skills.lock.json"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json
$lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $LockFile | ConvertFrom-Json

foreach ($skill in $config.skills) {
  $locked = $lock.skills | Where-Object { $_.id -eq $skill.id } | Select-Object -First 1
  $entryPath = Join-Path ([IO.Path]::GetFullPath((Join-Path $root $skill.path))) $skill.entry
  $status = if (Test-Path -LiteralPath $entryPath -PathType Leaf) { "installed" } else { "missing" }
  $resolved = if ($locked) { $locked.resolved } else { "unlocked" }

  Write-Host "$($skill.id)"
  Write-Host "  status: $status"
  Write-Host "  source: $($skill.source.repo) :: $($skill.source.path) @ $($skill.source.ref)"
  Write-Host "  resolved: $resolved"
  Write-Host "  appliesTo: $($skill.appliesTo -join ', ')"
}
