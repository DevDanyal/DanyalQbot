# Installs the Quotex bot as a Windows scheduled task that:
#   - starts at boot (auto-start, no login needed)
#   - restarts on crash
#   - re-runs every day (covers daily reset + overnight gaps)
#
# Usage: right-click "Run with PowerShell", or:
#   powershell -ExecutionPolicy Bypass -File install_service.ps1

$ErrorActionPreference = "Stop"
$taskName = "QuotexBot"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $scriptDir "run_bot.bat"

if (-not (Test-Path -LiteralPath $bat)) {
    Write-Error "run_bot.bat not found next to this script: $bat"
    exit 1
}

$action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $scriptDir
$startup = New-ScheduledTaskTrigger -AtStartup
$daily = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $startup, $daily `
    -Settings $settings -RunLevel Limited -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started scheduled task '$taskName'."
Write-Output "Launcher: $bat"
Write-Output "Check status with: Get-ScheduledTask -TaskName $taskName"
Write-Output "Logs: $scriptDir\data\bot.log and $scriptDir\data\bot_console.log"
