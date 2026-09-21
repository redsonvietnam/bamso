#requires -Version 5.1
<#
.SYNOPSIS
    Install BAMSO daily audit-log purge task in Windows Task Scheduler.

.DESCRIPTION
    Creates a scheduled task with an explicit project working directory and
    database path so the task does not depend on the scheduler's current
    working directory.

.PARAMETER TaskName
    Scheduled task name. Default: BAMSO Audit Purge.

.PARAMETER ScheduleTime
    Daily execution time in HH:mm. Default: 02:00.

.PARAMETER ProjectRoot
    BAMSO project root. Default: this script's parent directory.

.PARAMETER PythonPath
    Python executable. Default: python.

.PARAMETER DryRun
    Print the configuration without creating the task.
#>

param(
    [string]$TaskName = "BAMSO Audit Purge",
    [string]$ScheduleTime = "02:00",
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PythonPath = "python",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$PurgeScript = Join-Path $ProjectRoot "scripts\purge-audit-logs.py"
$DbPath = Join-Path $ProjectRoot "prisma\dev.db"

if (-not (Test-Path $PurgeScript)) {
    throw "Audit purge script not found: $PurgeScript"
}

try {
    $null = & $PythonPath --version 2>&1
} catch {
    throw "Python executable not found at '$PythonPath'."
}

Write-Host "Task: $TaskName"
Write-Host "Schedule: daily at $ScheduleTime"
Write-Host "Project root: $ProjectRoot"
Write-Host "Python: $PythonPath"
Write-Host "Purge script: $PurgeScript"
Write-Host "Database: $DbPath"
Write-Host "Dry run: $DryRun"

$Arguments = '"{0}" --db "{1}"' -f $PurgeScript, $DbPath
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument $Arguments -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false -ExecutionTimeLimit (New-TimeSpan -Hours 1)

if ($DryRun) {
    Write-Host "[DRY RUN] No scheduled task changes made."
    exit 0
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Daily purge of BAMSO AuditLog records using an explicit project/database path." | Out-Null

Write-Host "Scheduled task created successfully: $TaskName"
