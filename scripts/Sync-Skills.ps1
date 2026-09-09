param(
  [string]$SkillId,
  [switch]$All,
  [switch]$Force,
  [string]$Manifest = "$PSScriptRoot\..\skills.json",
  [string]$LockFile = "$PSScriptRoot\..\skills.lock.json",
  [string]$Installer = "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json
$lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $LockFile | ConvertFrom-Json
$skillsRoot = [IO.Path]::GetFullPath((Join-Path $root $config.skillsRoot))

if (-not $skillsRoot.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Skills root escapes workspace: $skillsRoot"
}
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw "Skill installer not found: $Installer"
}
if (-not $All -and -not $SkillId) {
  throw "Usage: .\scripts\Sync-Skills.ps1 -All [-Force] OR .\scripts\Sync-Skills.ps1 -SkillId <id> [-Force]"
}

$targets = if ($All) {
  @($config.skills)
}
else {
  @($config.skills | Where-Object { $_.id -eq $SkillId })
}
if ($targets.Count -eq 0) {
  throw "Unknown skill id: $SkillId"
}

New-Item -ItemType Directory -Force -Path $skillsRoot | Out-Null
$syncRoot = Join-Path $root ".codex\.skill-sync\$([guid]::NewGuid().ToString('N'))"
$backupRoot = Join-Path $root ".codex\.skill-backup\$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $syncRoot | Out-Null
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

function Resolve-SourceCommit([object]$source) {
  if ([string]$source.ref -match '^[0-9a-f]{40}$') {
    return [string]$source.ref
  }

  $remote = "https://github.com/$($source.repo).git"
  $result = @(git ls-remote $remote "refs/heads/$($source.ref)")
  if ($LASTEXITCODE -ne 0 -or $result.Count -ne 1) {
    throw "Unable to resolve $($source.repo)@$($source.ref)"
  }
  $commit = ($result[0] -split '\s+')[0]
  if ($commit -notmatch '^[0-9a-f]{40}$') {
    throw "Invalid resolved commit for $($source.repo)@$($source.ref): $commit"
  }
  return $commit
}

try {
  foreach ($skill in $targets) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path $root $skill.path))
    if (-not $targetPath.StartsWith($skillsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Skill path must stay under skillsRoot: $targetPath"
    }

    if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
      Write-Host "skip $($skill.id): already installed. Use -Force to update."
      continue
    }

    $resolved = Resolve-SourceCommit $skill.source
    Write-Host "stage $($skill.id) from $($skill.source.repo)::$($skill.source.path)@$resolved"
    & python $Installer `
      --repo $skill.source.repo `
      --path $skill.source.path `
      --ref $resolved `
      --name $skill.id `
      --dest $syncRoot
    if ($LASTEXITCODE -ne 0) {
      throw "Installer failed for $($skill.id)"
    }

    $stagedPath = Join-Path $syncRoot $skill.id
    $stagedEntry = Join-Path $stagedPath $skill.entry
    if (-not (Test-Path -LiteralPath $stagedEntry -PathType Leaf)) {
      throw "Staged skill entry missing: $stagedEntry"
    }

    $sourceMetadata = [ordered]@{
      repo = $skill.source.repo
      path = $skill.source.path
      ref = $skill.source.ref
      resolved = $resolved
      synchronizedAt = [DateTime]::UtcNow.ToString("o")
    }
    $sourceMetadata | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $stagedPath ".codex-skill-source.json")

    $backupPath = Join-Path $backupRoot $skill.id
    $hadPrevious = Test-Path -LiteralPath $targetPath
    if ($hadPrevious) {
      Move-Item -LiteralPath $targetPath -Destination $backupPath
    }

    try {
      Move-Item -LiteralPath $stagedPath -Destination $targetPath
    }
    catch {
      if ($hadPrevious -and (Test-Path -LiteralPath $backupPath) -and -not (Test-Path -LiteralPath $targetPath)) {
        Move-Item -LiteralPath $backupPath -Destination $targetPath
      }
      throw
    }

    $lockEntry = $lock.skills | Where-Object { $_.id -eq $skill.id } | Select-Object -First 1
    if (-not $lockEntry) {
      throw "Lock entry missing for $($skill.id)"
    }
    $lockEntry.repo = $skill.source.repo
    $lockEntry.path = $skill.source.path
    $lockEntry.ref = $skill.source.ref
    $lockEntry.resolved = $resolved
    $lockEntry.installedPath = $skill.path
    $lockEntry.managedBy = "scripts/Sync-Skills.ps1"

    if (Test-Path -LiteralPath $backupPath) {
      Remove-Item -LiteralPath $backupPath -Recurse -Force
    }
    Write-Host "installed $($skill.id)@$resolved" -ForegroundColor Green
  }

  $lock.generatedAt = [DateTime]::UtcNow.ToString("o")
  $lock | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -LiteralPath $LockFile
}
finally {
  if (Test-Path -LiteralPath $syncRoot) {
    Remove-Item -LiteralPath $syncRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $backupRoot) {
    Remove-Item -LiteralPath $backupRoot -Recurse -Force
  }
}
