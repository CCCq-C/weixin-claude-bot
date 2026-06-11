$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$StartScript = Join-Path $RepoRoot "scripts\windows\start-pm2.ps1"
$TaskName = "weixin-claude-bot"
$PowerShell = (Get-Command powershell.exe).Source
$Argument = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

Write-Host "Creating scheduled task: $TaskName"

$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Argument
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

Write-Host "Scheduled task installed. It will start after the current user logs in."
Write-Host "To remove it later:"
Write-Host "  schtasks /Delete /TN weixin-claude-bot /F"
