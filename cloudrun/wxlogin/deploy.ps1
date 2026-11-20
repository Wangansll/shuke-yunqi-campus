# Deploy cloudrun/wxlogin to the express-tmya service via wxcloud CLI.
#
# Prerequisite: create a CLI key at
#   https://cloud.weixin.qq.com/cloudrun/settings/other  (Setings -> Global -> CLI key)
# It requires the account admin to scan a QR code, and the key is a long RSA
# private key (PEM / downloaded file), NOT a 32-char secret.
#
# Usage:
#   .\deploy.ps1 -KeyFile C:\path\to\cli.key
#   .\deploy.ps1 -Key "-----BEGIN RSA PRIVATE KEY-----..."
#
# ASCII only on purpose: Windows PowerShell 5.1 reads UTF-8-without-BOM .ps1 as ANSI,
# and non-ASCII text breaks the parser.

param(
  [string]$Key,
  [string]$KeyFile,
  [string]$EnvId = "prod-d2gc3nmna23946d86",
  [string]$ServiceName = "express-tmya",
  [int]$Port = 80,
  [string]$AppId = "wx5cbc370db8d288e9"
)

$ErrorActionPreference = "Stop"

if (-not $Key -and $KeyFile) { $Key = (Get-Content -LiteralPath $KeyFile -Raw).Trim() }
if (-not $Key) { throw "Missing key: pass -Key or -KeyFile (console -> Settings -> CLI key)" }

$candidates = @(
  "C:\Users\001\Documents\deepseek-harness\default-workspace\_wb\wxcloud\node_modules\.bin\wxcloud.cmd",
  (Get-Command wxcloud -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) }
if (-not $candidates) { throw "wxcloud CLI not found: npm i -g @wxcloud/cli" }
$cli = $candidates[0]

Write-Host "[1/3] login (appid=$AppId)" -ForegroundColor Cyan
& $cli login -a $AppId -k $Key
if ($LASTEXITCODE -ne 0) { throw "login failed: wrong key or appid" }

Write-Host "[2/3] deploy $ServiceName (env=$EnvId port=$Port)" -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
  & $cli deploy -e $EnvId -s $ServiceName -p $Port
  if ($LASTEXITCODE -ne 0) { throw "deploy failed, see output above" }
} finally {
  Pop-Location
}

Write-Host "[3/3] done. Check mini program: Me -> Self check -> /api/wxlogin should return openid." -ForegroundColor Green
