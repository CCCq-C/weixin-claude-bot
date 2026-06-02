$ErrorActionPreference = "Stop"

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. $InstallHint"
  }
}

Write-Host "== weixin-claude-bot Windows preflight =="

Assert-Command "node" "Install Node.js 20+ first."
Assert-Command "npm" "Install Node.js 20+ first."
Assert-Command "git" "Install Git for Windows first."
Assert-Command "claude" "Install and authenticate Claude Code CLI first."

$nodeVersion = (& node -p "Number(process.versions.node.split('.')[0])")
if ([int]$nodeVersion -lt 20) {
  throw "Node.js 20+ is required. Current major version: $nodeVersion"
}

Write-Host "Node:   $(node -v)"
Write-Host "npm:    $(npm -v)"
Write-Host "Git:    $(git --version)"
Write-Host "Claude: $(claude --version)"

Write-Host "Checking Claude authentication..."
& claude -p "ping" --output-format json | Out-Null

Write-Host "Checking ilinkai network..."
$response = Invoke-WebRequest -Uri "https://ilinkai.weixin.qq.com" -Method Head -UseBasicParsing -TimeoutSec 15
Write-Host "ilinkai: HTTP $($response.StatusCode)"

Write-Host "Preflight passed."
