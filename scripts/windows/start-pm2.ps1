$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

Assert-Command "node" "Install Node.js 20+ first."
Assert-Command "npm" "Install Node.js 20+ first."
Assert-Command "pm2" "Run: npm install -g pm2"

Write-Host "== weixin-claude-bot PM2 launcher =="
Write-Host "Repo: $RepoRoot"

npm run typecheck

$existing = & pm2 jlist | ConvertFrom-Json | Where-Object { $_.name -eq "weixin-claude-bot" }
if ($existing) {
  Write-Host "Removing existing PM2 process so the latest ecosystem config is applied..."
  pm2 delete weixin-claude-bot
}

Write-Host "Starting PM2 process from ecosystem.config.cjs..."
pm2 start ecosystem.config.cjs --update-env

pm2 save
pm2 status weixin-claude-bot

Write-Host ""
Write-Host "PM2 is now managing weixin-claude-bot in the background."
Write-Host "You can close this terminal after confirming the process is online."
Write-Host "Useful commands:"
Write-Host "  pm2 status"
Write-Host "  pm2 logs weixin-claude-bot --lines 80 --nostream"
Write-Host "  .\scripts\windows\start-pm2.ps1"
