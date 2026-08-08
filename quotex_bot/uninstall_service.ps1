# Removes the Quotex bot scheduled task.
# Usage: powershell -ExecutionPolicy Bypass -File uninstall_service.ps1

$taskName = "QuotexBot"
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Output "Removed scheduled task '$taskName'."
