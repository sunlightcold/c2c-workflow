param(
  [string]$Root = "$PSScriptRoot\.."
)

$ErrorActionPreference = "Stop"
$workspaceRoot = (Resolve-Path -LiteralPath $Root).Path

if (-not (Get-Command rg -ErrorAction SilentlyContinue)) {
  throw "Secret scan requires ripgrep (rg)."
}

$scanArgs = @(
  "-n",
  "--hidden",
  "--pcre2",
  "--no-heading",
  "-g", "!**/node_modules/**",
  "-g", "!**/dist/**",
  "-g", "!**/output/**",
  "-g", "!**/.turbo/**",
  "-g", "!**/*.spec.ts",
  "-g", "!**/*.test.ts",
  "-g", "!**/test/**",
  "-e", "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
  "-e", "\b(?:sk-|re_)[A-Za-z0-9_-]{16,}",
  "-e", '(?i)\b(?:secretAccessKey|credentialMasterKey|apiKey|privateKey)\s*:\s*[''"`][^''"`\r\n]{12,}[''"`]',
  "-e", '(?i)\bpassword\s*:\s*[''"`](?!change-me-before-use[''"`])[^''"`\r\n]{8,}[''"`]',
  "projects"
)

Push-Location $workspaceRoot
try {
  $matches = @(& rg @scanArgs 2>&1)
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

if ($exitCode -gt 1) {
  throw "Secret scan failed to execute (rg exit code $exitCode)."
}
if ($matches.Count -gt 0) {
  $matches | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  throw "Potential committed secret detected. Replace it with an environment variable or Secret reference."
}

Write-Host "Secret scan passed." -ForegroundColor Green
