<#
.SYNOPSIS
    Install BAMSO daily backup task in Windows Task Scheduler.

.DESCRIPTION
    Creates a Windows Scheduled Task that runs the BAMSO backup script daily.

    The task:
    - Runs daily at 2:00 AM (configurable)
    - Uses Python to execute the backup script
    - Logs output to a file
    - Does not require Internet
    - Does not require Administrator privileges for basic setup

.PARAMETER TaskName
    Name of the scheduled task. Default: "BAMSO Daily Backup"

.PARAMETER ScheduleTime
    Time to run the task. Default: "02:00"

.PARAMETER ProjectRoot
    Path to the BAMSO project root. Default: script's parent directory.

.PARAMETER PythonPath
    Path to Python executable. Default: "python"

.PARAMETER DryRun
    Show what would be done without making changes.

.EXAMPLE
    # Interactive — uses defaults
    powershell -ExecutionPolicy Bypass -File scripts/install-backup-task.ps1

    # With custom time
    powershell -ExecutionPolicy Bypass -File scripts/install-backup-task.ps1 -ScheduleTime "03:00"

    # Preview only
    powershell -ExecutionPolicy Bypass -File scripts/install-backup-task.ps1 -DryRun
#>

param(
    [string]$TaskName = "BAMSO Daily Backup",
    [string]$ScheduleTime = "02:00",
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PythonPath = "python",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO Backup Task Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Verify prerequisites ---
Write-Host "Verifying prerequisites..." -ForegroundColor Yellow

# Check Python
try {
    $pythonVersion = & $PythonPath --version 2>&1
    Write-Host "  Python: $pythonVersion" -ForegroundColor Gray
} catch {
    Write-Error "Python not found at '$PythonPath'. Install Python 3.x or specify -PythonPath."
    exit 1
}

# Check backup script
$backupScript = Join-Path $ProjectRoot "scripts\backup-db.py"
if (-not (Test-Path $backupScript)) {
    Write-Error "Backup script not found: $backupScript"
    exit 1
}
Write-Host "  Backup script: $backupScript" -ForegroundColor Gray

# Check database
$dbPath = Join-Path $ProjectRoot "prisma\dev.db"
if (-not (Test-Path $dbPath)) {
    Write-Warning "Database not found at: $dbPath"
    Write-Host "  The task will still be created, but will fail until the database exists." -ForegroundColor Yellow
}
Write-Host "  Database: $dbPath" -ForegroundColor Gray

# --- Configuration ---
$BackupDir = Join-Path $ProjectRoot "backups"
$LogDir = Join-Path $ProjectRoot "logs"
$LogFile = Join-Path $LogDir "backup-task.log"

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Task Name:     $TaskName" -ForegroundColor Gray
Write-Host "  Schedule:      Daily at $ScheduleTime" -ForegroundColor Gray
Write-Host "  Project Root:  $ProjectRoot" -ForegroundColor Gray
Write-Host "  Python:        $PythonPath" -ForegroundColor Gray
Write-Host "  Backup Script: $backupScript" -ForegroundColor Gray
Write-Host "  Backup Dir:    $BackupDir" -ForegroundColor Gray
Write-Host "  Log File:      $LogFile" -ForegroundColor Gray
Write-Host "  Dry Run:       $DryRun" -ForegroundColor Gray
Write-Host ""

# --- Create log directory ---
if (-not $DryRun) {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        Write-Host "Created log directory: $LogDir" -ForegroundColor Green
    }
}

# --- Build command ---
$Arguments = "`"$backupScript`" --dir `"$BackupDir`" --retention 30"
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument $Arguments -WorkingDirectory $ProjectRoot

# --- Build trigger ---
$Trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime

# --- Build settings ---
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# --- Create task ---
if ($DryRun) {
    Write-Host "[DRY RUN] Would create scheduled task:" -ForegroundColor Yellow
    Write-Host "  Name:     $TaskName" -ForegroundColor Gray
    Write-Host "  Action:   $PythonPath $Arguments" -ForegroundColor Gray
    Write-Host "  Trigger:  Daily at $ScheduleTime" -ForegroundColor Gray
    Write-Host "  Working:  $ProjectRoot" -ForegroundColor Gray
} else {
    try {
        # Remove existing task if present
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "Removed existing task: $TaskName" -ForegroundColor Yellow
        }

        # Register new task
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $Action `
            -Trigger $Trigger `
            -Settings $Settings `
            -Description "Daily backup of BAMSO SQLite database using SQLite online backup API" | Out-Null

        Write-Host "Task created successfully: $TaskName" -ForegroundColor Green
    } catch {
        Write-Error "Failed to create task: $_"
        exit 1
    }
}

# --- Summary ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Scheduled task configured:" -ForegroundColor Green
Write-Host ""
Write-Host "  Task:    $TaskName" -ForegroundColor White
Write-Host "  Runs:    Daily at $ScheduleTime" -ForegroundColor White
Write-Host "  Script:  $backupScript" -ForegroundColor White
Write-Host "  Output:  $BackupDir\bamso_YYYYMMDD_HHmmss.db" -ForegroundColor White
Write-Host "  Logs:    $LogFile" -ForegroundColor White
Write-Host ""
Write-Host "To verify:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "To run manually:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  or: python `"$backupScript`"" -ForegroundColor Gray
Write-Host ""
Write-Host "To remove:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
