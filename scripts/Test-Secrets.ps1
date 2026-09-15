param(
  [string]$Root = "$PSScriptRoot\.."
)

$ErrorActionPreference = "Stop"
$workspaceRoot = (Resolve-Path -LiteralPath $Root).Path

if (-not (Get-Command rg -ErrorAction SilentlyContinue)) {
  throw "Secret scan requires ripgrep (rg)."
}

$fileArgs = @(
  "--files",
  "--hidden",
  "-g", "!**/node_modules/**",
  "-g", "!**/dist/**",
  "-g", "!**/output/**",
  "-g", "!**/.turbo/**",
  "-g", "!**/*.spec.ts",
  "-g", "!**/*.test.ts",
  "-g", "!**/test/**",
  "projects"
)
$patterns = @(
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  '\b(sk-|re_)[A-Za-z0-9_-]{16,}',
  '(?i)\b(secretAccessKey|credentialMasterKey|apiKey|privateKey)\s*:\s*[''"`][^''"`\r\n]{12,}[''"`]',
  '(?i)\bpassword\s*:\s*[''"`][^''"`\r\n]{8,}[''"`]'
)

Push-Location $workspaceRoot
try {
  $files = @(& rg @fileArgs 2>&1)
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

if ($exitCode -gt 1) {
  throw "Secret scan failed to execute (rg exit code $exitCode)."
}
$matches = @(
  foreach ($file in $files) {
    foreach ($line in (Get-Content -LiteralPath $file)) {
      if ($line -match ($patterns -join '|') -and $line -notmatch 'change-me-before-use') {
        "${file}:$line"
      }
    }
  }
)
if ($matches.Count -gt 0) {
  $matches | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  throw "Potential committed secret detected. Replace it with an environment variable or Secret reference."
}

Write-Host "Secret scan passed." -ForegroundColor Green
