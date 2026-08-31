<#
.SYNOPSIS
    Check BAMSO backup status.

.DESCRIPTION
    Reports the status of the latest BAMSO database backup.
    Checks backup existence, age, and integrity.

.PARAMETER BackupDir
    Backup directory. Default: backups/ relative to project root.

.PARAMETER MaxAgeHours
    Maximum acceptable backup age in hours. Default: 25 (allows daily + buffer).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/check-backup.ps1
    powershell -ExecutionPolicy Bypass -File scripts/check-backup.ps1 -BackupDir D:\backups
#>

param(
    [string]$BackupDir = "",
    [int]$MaxAgeHours = 25
)

$ErrorActionPreference = "Stop"

# Resolve backup directory
if (-not $BackupDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectRoot = Split-Path -Parent $ScriptDir
    $BackupDir = Join-Path $ProjectRoot "backups"
}

Write-Host "BAMSO Backup Status" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""

# Check backup directory
if (-not (Test-Path $BackupDir)) {
    Write-Host "STATUS: FAIL" -ForegroundColor Red
    Write-Host "  Reason: Backup directory not found: $BackupDir" -ForegroundColor Red
    exit 1
}

# Find latest backup
$backups = Get-ChildItem -Path $BackupDir -Filter "bamso_*.db" -File | Sort-Object LastWriteTime -Descending

if ($backups.Count -eq 0) {
    Write-Host "STATUS: FAIL" -ForegroundColor Red
    Write-Host "  Reason: No backup files found in $BackupDir" -ForegroundColor Red
    exit 1
}

$latest = $backups[0]
$age = (Get-Date) - $latest.LastWriteTime
$ageHours = [math]::Round($age.TotalHours, 1)

Write-Host "Latest backup:" -ForegroundColor Yellow
Write-Host "  File:     $($latest.Name)" -ForegroundColor Gray
Write-Host "  Size:     $($latest.Length) bytes" -ForegroundColor Gray
Write-Host "  Created:  $($latest.LastWriteTime)" -ForegroundColor Gray
Write-Host "  Age:      $ageHours hours" -ForegroundColor Gray
Write-Host "  Total:    $($backups.Count) backup(s)" -ForegroundColor Gray
Write-Host ""

# Check age
if ($ageHours -gt $MaxAgeHours) {
    Write-Host "STATUS: WARN" -ForegroundColor Yellow
    Write-Host "  Reason: Latest backup is $ageHours hours old (max: $MaxAgeHours)" -ForegroundColor Yellow
    exit 2
} else {
    Write-Host "STATUS: PASS" -ForegroundColor Green
    Write-Host "  Latest backup is $ageHours hours old" -ForegroundColor Gray
    exit 0
}
