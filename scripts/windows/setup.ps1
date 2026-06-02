$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "== weixin-claude-bot Windows setup =="
npm install

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
} else {
  Write-Host ".env already exists; keeping it unchanged"
}

Write-Host ""
Write-Host "Next step: edit .env and set VAULT_PATH to your Obsidian Vault or project folder."
Write-Host 'Example: VAULT_PATH="C:\Users\YourName\Documents\ObsidianVault"'
