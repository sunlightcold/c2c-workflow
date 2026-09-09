param(
  [string]$Manifest = "$PSScriptRoot\..\projects.json",
  [string]$SkillsManifest = "$PSScriptRoot\..\skills.json",
  [string]$SkillsLock = "$PSScriptRoot\..\skills.lock.json",
  [string]$WorkspaceFile = "$PSScriptRoot\..\C2C-Workflow.code-workspace"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest | ConvertFrom-Json
$skillsConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath $SkillsManifest | ConvertFrom-Json
$lockConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath $SkillsLock | ConvertFrom-Json
$workspace = Get-Content -Raw -Encoding UTF8 -LiteralPath $WorkspaceFile | ConvertFrom-Json
$hasError = $false

function Report-Error([string]$Message) {
  $script:hasError = $true
  Write-Host "  ERROR: $Message" -ForegroundColor Red
}

function Resolve-WorkspaceChild([string]$RelativePath) {
  $fullPath = [IO.Path]::GetFullPath((Join-Path $root $RelativePath))
  if (-not $fullPath.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes workspace: $RelativePath"
  }
  return $fullPath
}

$projectIds = @($config.projects | ForEach-Object { $_.id })
$skillIds = @($skillsConfig.skills | ForEach-Object { $_.id })
$lockIds = @($lockConfig.skills | ForEach-Object { $_.id })
$workspacePaths = @($workspace.folders | ForEach-Object { $_.path.Replace('\', '/').TrimEnd('/') })

Write-Host "Workflow: $($config.workspace.name)" -ForegroundColor Cyan
Write-Host "Root: $root"

if (-not (Test-Path -LiteralPath (Join-Path $root ".git") -PathType Container)) {
  Report-Error "root Git repository is missing"
}
if ($config.workspace.rootType -ne "single-repository-workspace" -or $config.workspace.gitStrategy -ne "single-repository") {
  Report-Error "workspace must use single-repository semantics"
}
if (($projectIds | Sort-Object -Unique).Count -ne $projectIds.Count) {
  Report-Error "duplicate project id"
}
if (($skillIds | Sort-Object -Unique).Count -ne $skillIds.Count) {
  Report-Error "duplicate skill id"
}
if (($lockIds | Sort-Object -Unique).Count -ne $lockIds.Count) {
  Report-Error "duplicate skill lock id"
}

foreach ($project in $config.projects) {
  Write-Host ""
  Write-Host "## $($project.id) [$($project.role)]"

  try {
    $projectPath = Resolve-WorkspaceChild $project.path
  }
  catch {
    Report-Error $_.Exception.Message
    continue
  }

  if (-not (Test-Path -LiteralPath $projectPath -PathType Container)) {
    Report-Error "project path does not exist: $projectPath"
    continue
  }
  if (Test-Path -LiteralPath (Join-Path $projectPath ".git")) {
    Report-Error "nested Git repository is forbidden: $projectPath"
  }
  else {
    Write-Host "  nested git: none"
  }
  if ($project.repoType -ne "workspace-directory" -or $project.writePolicy -ne "development") {
    Report-Error "project must be a tracked development workspace directory"
  }

  git -C $root check-ignore -q -- $project.path
  if ($LASTEXITCODE -eq 0) {
    Report-Error "project is ignored by root Git: $($project.path)"
  }
  else {
    Write-Host "  root tracking: enabled"
  }

  $normalizedPath = $project.path.Replace('\', '/').TrimEnd('/')
  if ($workspacePaths -notcontains $normalizedPath) {
    Report-Error "workspace file missing project path: $normalizedPath"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectPath "package.json") -PathType Leaf)) {
    Report-Error "package.json is missing: $($project.path)"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectPath "AGENTS.md") -PathType Leaf)) {
    Report-Error "project AGENTS.md is missing: $($project.path)"
  }

  $commandProperties = @($project.commands.PSObject.Properties)
  if ($commandProperties.Count -eq 0) {
    Report-Error "commands are empty"
  }
  foreach ($commandProperty in $commandProperties) {
    $argv = @($commandProperty.Value)
    if ($argv.Count -eq 0 -or [string]::IsNullOrWhiteSpace([string]$argv[0])) {
      Report-Error "command '$($commandProperty.Name)' must be a non-empty argv array"
    }
  }
  Write-Host "  commands: $(($commandProperties.Name | Sort-Object) -join ', ')"

  foreach ($dependency in @($project.dependsOn)) {
    if ($dependency -eq $project.id -or $projectIds -notcontains $dependency) {
      Report-Error "invalid dependency '$dependency'"
    }
  }
  foreach ($skillId in @($project.skills)) {
    if ($skillIds -notcontains $skillId) {
      Report-Error "unregistered skill '$skillId'"
    }
  }
}

foreach ($templatePath in @("templates/tpl-backend", "templates/tpl-frontend", "templates/pfa-pay")) {
  if (Test-Path -LiteralPath (Join-Path $root $templatePath)) {
    git -C $root check-ignore -q -- $templatePath
    if ($LASTEXITCODE -ne 0) {
      Report-Error "reference template must remain ignored: $templatePath"
    }
  }
}

Write-Host ""
Write-Host "## local skills"
foreach ($skill in $skillsConfig.skills) {
  try {
    $skillPath = Resolve-WorkspaceChild $skill.path
  }
  catch {
    Report-Error $_.Exception.Message
    continue
  }

  $entryPath = Join-Path $skillPath $skill.entry
  if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
    Report-Error "skill entry missing: $entryPath"
  }

  $lockEntry = $lockConfig.skills | Where-Object { $_.id -eq $skill.id } | Select-Object -First 1
  if (-not $lockEntry) {
    Report-Error "lock entry missing: $($skill.id)"
    continue
  }
  if ($lockEntry.repo -ne $skill.source.repo -or $lockEntry.path -ne $skill.source.path -or $lockEntry.ref -ne $skill.source.ref) {
    Report-Error "lock source mismatch: $($skill.id)"
  }
  if ([string]$lockEntry.resolved -notmatch '^[0-9a-f]{40}$') {
    Report-Error "lock commit is invalid: $($skill.id)"
  }
  if ($lockEntry.installedPath -ne $skill.path) {
    Report-Error "lock install path mismatch: $($skill.id)"
  }

  $sourceMetadataPath = Join-Path $skillPath ".codex-skill-source.json"
  if (-not (Test-Path -LiteralPath $sourceMetadataPath -PathType Leaf)) {
    Report-Error "skill source metadata missing: $($skill.id)"
  }
  else {
    $sourceMetadata = Get-Content -Raw -Encoding UTF8 -LiteralPath $sourceMetadataPath | ConvertFrom-Json
    if ($sourceMetadata.repo -ne $lockEntry.repo -or $sourceMetadata.path -ne $lockEntry.path -or $sourceMetadata.resolved -ne $lockEntry.resolved) {
      Report-Error "installed skill source does not match lock: $($skill.id)"
    }
  }

  foreach ($target in @($skill.appliesTo)) {
    if ($target -ne "workflow" -and $projectIds -notcontains $target) {
      Report-Error "skill '$($skill.id)' applies to unknown project '$target'"
    }
  }
  Write-Host "  $($skill.id): checked"
}

foreach ($lockId in $lockIds) {
  if ($skillIds -notcontains $lockId) {
    Report-Error "orphan lock entry: $lockId"
  }
}

foreach ($requiredFile in @("AGENTS.md", "README.md", "docs/OPERATING.md", "projects.json", "skills.json", "skills.lock.json")) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $requiredFile) -PathType Leaf)) {
    Report-Error "required repository file missing: $requiredFile"
  }
}

& (Join-Path $PSScriptRoot "Test-Secrets.ps1") -Root $root

Write-Host ""
if ($hasError) {
  throw "Workflow validation failed."
}
Write-Host "Workflow validation passed." -ForegroundColor Green
