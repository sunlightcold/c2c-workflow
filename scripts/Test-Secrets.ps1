param(
  [string]$Root = "$PSScriptRoot\.."
)

$ErrorActionPreference = "Stop"
$workspaceRoot = (Resolve-Path -LiteralPath $Root).Path

$patterns = @(
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  '\b(sk-|re_)[A-Za-z0-9_-]{16,}',
  '(?i)\b(secretAccessKey|credentialMasterKey|apiKey|privateKey)\s*:\s*[''"`][^''"`\r\n]{12,}[''"`]',
  '(?i)\bpassword\s*:\s*[''"`][^''"`\r\n]{8,}[''"`]'
)
$trackedFiles = @(& git -C $workspaceRoot ls-files --cached --others --exclude-standard -- projects 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "Secret scan failed to enumerate repository files."
}
$files = @(
  foreach ($relativePath in $trackedFiles) {
    if ($relativePath -notmatch '(^|[/\\])(node_modules|dist|output|\.turbo|test)([/\\]|$)' -and
        $relativePath -notmatch '\.(spec|test)\.[^.]+$') {
      Get-Item -LiteralPath (Join-Path $workspaceRoot $relativePath)
    }
  }
)

$findings = @(
  foreach ($file in $files) {
    $lineNumber = 0
    foreach ($line in (Get-Content -LiteralPath $file.FullName)) {
      $lineNumber++
      if ($line -match ($patterns -join '|') -and $line -notmatch 'change-me-before-use') {
        "{0}:{1}:{2}" -f $file.FullName, $lineNumber, $line
      }
    }
  }
)
if ($findings.Count -gt 0) {
  $findings | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  throw "Potential committed secret detected. Replace it with an environment variable or Secret reference."
}

Write-Host "Secret scan passed." -ForegroundColor Green
