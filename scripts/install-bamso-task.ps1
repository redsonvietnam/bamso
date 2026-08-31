<#
.SYNOPSIS
    Install BAMSO production process as a Windows Scheduled Task.

.DESCRIPTION
    Creates a Windows Scheduled Task that:
    - Starts BAMSO on system boot (with delay)
    - Restarts on failure (up to 3 retries)
    - Runs without requiring an interactive terminal
    - Logs startup/runtime to files

    This task uses the startup wrapper (start-production.ps1) which
    validates environment, certificates, and database before starting.

.PARAMETER TaskName
    Name of the scheduled task. Default: "BAMSO Production Server"

.PARAMETER ProjectRoot
    Path to the BAMSO project root. Default: script's parent directory.

.PARAMETER DryRun
    Show what would be done without making changes.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/install-bamso-task.ps1
    powershell -ExecutionPolicy Bypass -File scripts/install-bamso-task.ps1 -DryRun
#>

param(
    [string]$TaskName = "BAMSO Production Server",
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO Process Manager Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Verify prerequisites ---
Write-Host "Verifying prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Gray
} catch {
    Write-Error "Node.js not found. Install Node.js and add to PATH."
    exit 1
}

# Check startup script
$startScript = Join-Path $ProjectRoot "scripts\start-production.ps1"
if (-not (Test-Path $startScript)) {
    Write-Error "Startup script not found: $startScript"
    exit 1
}
Write-Host "  Startup script: $startScript" -ForegroundColor Gray

# Check server.js
$serverJs = Join-Path $ProjectRoot "server.js"
if (-not (Test-Path $serverJs)) {
    Write-Error "server.js not found: $serverJs"
    exit 1
}
Write-Host "  Server: $serverJs" -ForegroundColor Gray

# --- Configuration ---
$LogDir = Join-Path $ProjectRoot "logs"
$StartupLog = Join-Path $LogDir "startup.log"

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Task Name:     $TaskName" -ForegroundColor Gray
Write-Host "  Project Root:  $ProjectRoot" -ForegroundColor Gray
Write-Host "  Startup Script: $startScript" -ForegroundColor Gray
Write-Host "  Log Directory: $LogDir" -ForegroundColor Gray
Write-Host "  Dry Run:       $DryRun" -ForegroundColor Gray
Write-Host ""

# --- Create log directory ---
if (-not $DryRun) {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        Write-Host "Created log directory: $LogDir" -ForegroundColor Green
    }
}

# --- Build action ---
# The task runs PowerShell which executes the startup wrapper
# Output is logged to startup.log
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $Arguments `
    -WorkingDirectory $ProjectRoot

# --- Build triggers ---
# Trigger 1: At system startup (with 30-second delay)
$TriggerStartup = New-ScheduledTaskTrigger -AtStartup
$TriggerStartup.Delay = "PT30S"  # 30 second delay after boot

# Trigger 2: Daily at 06:00 (safety net �" ensures server is running at start of business)
$TriggerDaily = New-ScheduledTaskTrigger -Daily -At "06:00"

# --- Build settings ---
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

# --- Create task ---
if ($DryRun) {
    Write-Host "[DRY RUN] Would create scheduled task:" -ForegroundColor Yellow
    Write-Host "  Name:     $TaskName" -ForegroundColor Gray
    Write-Host "  Action:   powershell.exe $Arguments" -ForegroundColor Gray
    Write-Host "  Trigger:  At startup (30s delay) + Daily 06:00" -ForegroundColor Gray
    Write-Host "  Working:  $ProjectRoot" -ForegroundColor Gray
    Write-Host "  Restart:  3 attempts, 1 minute interval" -ForegroundColor Gray
    Write-Host "  Timeout:  No limit (runs until stopped)" -ForegroundColor Gray
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
            -Trigger $TriggerStartup, $TriggerDaily `
            -Settings $Settings `
            -Description "BAMSO production HTTPS server - auto-starts on boot, restarts on failure" | Out-Null

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
Write-Host "  Task:      $TaskName" -ForegroundColor White
Write-Host "  Starts:    At system boot (30s delay)" -ForegroundColor White
Write-Host "  Safety:    Daily at 06:00" -ForegroundColor White
Write-Host "  Restart:   3 attempts, 1 minute apart" -ForegroundColor White
Write-Host "  Timeout:   No limit (runs until stopped)" -ForegroundColor White
Write-Host "  Script:    $startScript" -ForegroundColor White
Write-Host "  Logs:      $LogDir" -ForegroundColor White
Write-Host ""
Write-Host "To verify:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "To start manually:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  or: powershell -ExecutionPolicy Bypass -File `"$startScript`"" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop:" -ForegroundColor Yellow
Write-Host "  Stop-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "To remove:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANT: For auto-start on boot, run this script as Administrator." -ForegroundColor Yellow
Write-Host ""
