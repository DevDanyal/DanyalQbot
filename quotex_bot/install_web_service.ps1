# Installs the Quotex web dashboard as a Windows scheduled task that:
#   - starts at boot
#   - restarts on crash
#   - runs 24/7 so the dashboard is always accessible at http://127.0.0.1:8000

$ErrorActionPreference = "Stop"
$taskName = "QuotexWebDashboard"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $scriptDir "run_web.bat"

if (-not (Test-Path -LiteralPath $bat)) {
    Write-Error "run_web.bat not found next to this script: $bat"
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
Write-Output "Installed and started '$taskName'."
Write-Output "Dashboard: http://127.0.0.1:8000"
Write-Output "Check status: Get-ScheduledTask -TaskName $taskName"
