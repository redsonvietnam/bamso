# BAMSO Audit Retention Purge Task Installer
#
# Registers a daily Windows Scheduled Task that runs the existing
# scripts/purge-audit-logs.py retention job.
#
# Production deployment still requires running this installer on the
# target Windows server with an account that can create the scheduled task.

[CmdletBinding()]
param(
    [string]$TaskName = "BAMSO Audit Retention Purge",
    [string]$ScheduleTime = "03:30",
    [string]$ProjectRoot,
    [string]$PythonPath = "python",
    [int]$RetentionDays = 365,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

if ($RetentionDays -lt 1) {
    throw "RetentionDays must be at least 1."
}

$purgeScript = Join-Path $ProjectRoot "scripts\purge-audit-logs.py"
$dbPath = Join-Path $ProjectRoot "prisma\dev.db"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO Audit Retention Task Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Verifying prerequisites..." -ForegroundColor Yellow

try {
    $pythonVersion = & $PythonPath --version 2>&1
    Write-Host "  Python: $pythonVersion" -ForegroundColor Gray
} catch {
    throw "Python not found at '$PythonPath'. Install Python 3.x or specify -PythonPath."
}

if (-not (Test-Path $purgeScript)) {
    throw "Audit purge script not found: $purgeScript"
}
Write-Host "  Purge script: $purgeScript" -ForegroundColor Gray

if (-not (Test-Path $dbPath)) {
    Write-Warning "Database not found at: $dbPath"
}
Write-Host "  Database: $dbPath" -ForegroundColor Gray

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Task Name:     $TaskName" -ForegroundColor Gray
Write-Host "  Schedule:      Daily at $ScheduleTime" -ForegroundColor Gray
Write-Host "  Retention:     $RetentionDays days" -ForegroundColor Gray
Write-Host "  Project Root:  $ProjectRoot" -ForegroundColor Gray
Write-Host "  Python:        $PythonPath" -ForegroundColor Gray
Write-Host "  Dry Run:       $DryRun" -ForegroundColor Gray
Write-Host ""

$Arguments = "`"$purgeScript`" --db `"$dbPath`" --days $RetentionDays"
$Action = New-ScheduledTaskAction `
    -Execute $PythonPath `
    -Argument $Arguments `
    -WorkingDirectory $ProjectRoot

$Trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

if ($DryRun) {
    Write-Host "[DRY RUN] Would create scheduled task:" -ForegroundColor Yellow
    Write-Host "  Name:      $TaskName" -ForegroundColor Gray
    Write-Host "  Action:    $PythonPath $Arguments" -ForegroundColor Gray
    Write-Host "  Trigger:   Daily at $ScheduleTime" -ForegroundColor Gray
    Write-Host "  Working:   $ProjectRoot" -ForegroundColor Gray
    Write-Host "  Retention: $RetentionDays days" -ForegroundColor Gray
    Write-Host "  Restart:   3 attempts, 1 minute interval" -ForegroundColor Gray
    exit 0
}

try {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed existing task: $TaskName" -ForegroundColor Yellow
    }

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Description "Daily BAMSO AuditLog retention purge using scripts/purge-audit-logs.py" | Out-Null

    Write-Host "Task created successfully: $TaskName" -ForegroundColor Green
} catch {
    throw "Failed to create task: $_"
}

Write-Host ""
Write-Host "To verify:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "To run manually:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
