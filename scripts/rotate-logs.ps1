<#
.SYNOPSIS
    Rotate BAMSO log files.

.DESCRIPTION
    Deletes log files older than the retention period.
    Only deletes files in the logs/ directory.

.PARAMETER LogDir
    Log directory. Default: logs/ relative to project root.

.PARAMETER RetentionDays
    Days to keep logs. Default: 30.

.PARAMETER DryRun
    Show what would be done without making changes.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/rotate-logs.ps1
    powershell -ExecutionPolicy Bypass -File scripts/rotate-logs.ps1 -RetentionDays 7 -DryRun
#>

param(
    [string]$LogDir = "",
    [int]$RetentionDays = 30,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Resolve log directory
if (-not $LogDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectRoot = Split-Path -Parent $ScriptDir
    $LogDir = Join-Path $ProjectRoot "logs"
}

Write-Host "BAMSO Log Rotation" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log directory: $LogDir" -ForegroundColor Gray
Write-Host "Retention:     $RetentionDays days" -ForegroundColor Gray
Write-Host "Dry run:       $DryRun" -ForegroundColor Gray
Write-Host ""

# Check log directory
if (-not (Test-Path $LogDir)) {
    Write-Host "Log directory not found: $LogDir" -ForegroundColor Yellow
    Write-Host "Nothing to rotate." -ForegroundColor Gray
    exit 0
}

# Find old log files
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$logFiles = Get-ChildItem -Path $LogDir -File | Where-Object { $_.LastWriteTime -lt $cutoff }

if ($logFiles.Count -eq 0) {
    Write-Host "No log files older than $RetentionDays days." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($logFiles.Count) log file(s) older than $RetentionDays days:" -ForegroundColor Yellow
foreach ($file in $logFiles) {
    $age = [math]::Round(((Get-Date) - $file.LastWriteTime).TotalDays, 0)
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would delete: $($file.Name) ($age days old)" -ForegroundColor Gray
    } else {
        Remove-Item $file.FullName -Force
        Write-Host "  Deleted: $($file.Name) ($age days old)" -ForegroundColor Gray
    }
}

Write-Host ""
if ($DryRun) {
    Write-Host "DRY RUN COMPLETE - no files deleted." -ForegroundColor Cyan
} else {
    Write-Host "Rotation complete. Deleted $($logFiles.Count) file(s)." -ForegroundColor Green
}
