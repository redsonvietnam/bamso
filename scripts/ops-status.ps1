<#
.SYNOPSIS
    BAMSO operational status check.

.DESCRIPTION
    Quick status check for IT operators. Reports:
    - Process status (Task Scheduler)
    - HTTPS endpoint
    - API health
    - Database connectivity
    - Backup freshness
    - Log directory

.PARAMETER IgnoreCert
    Skip certificate validation (for self-signed certs).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/ops-status.ps1
#>

param(
    [switch]$IgnoreCert
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "BAMSO STATUS" -ForegroundColor Cyan
Write-Host "============" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# 1. Process status
Write-Host "Process:" -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "BAMSO Production Server" -ErrorAction SilentlyContinue
if ($task) {
    if ($task.State -eq "Running") {
        Write-Host "  RUNNING" -ForegroundColor Green
    } else {
        Write-Host "  $($task.State)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  NOT REGISTERED" -ForegroundColor Red
}

# 2. HTTPS endpoint
Write-Host ""
Write-Host "HTTPS:" -ForegroundColor Yellow
try {
    $url = "https://localhost:3443/api/health"
    if ($IgnoreCert) {
        Add-Type @"
        using System.Net;
        using System.Net.Security;
        using System.Security.Cryptography.X509Certificates;
        public class TrustAll : ICertificatePolicy {
            public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) {
                return true;
            }
        }
"@ -ErrorAction SilentlyContinue
        [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll
    }
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    $body = $response.Content | ConvertFrom-Json
    if ($body.ok -eq $true) {
        Write-Host "  PASS" -ForegroundColor Green
    } else {
        Write-Host "  FAIL (db: $($body.db))" -ForegroundColor Red
    }
} catch {
    Write-Host "  FAIL ($($_.Exception.Message))" -ForegroundColor Red
}

# 3. Database
Write-Host ""
Write-Host "Database:" -ForegroundColor Yellow
$dbPath = Join-Path $ProjectRoot "prisma\dev.db"
if (Test-Path $dbPath) {
    $dbSize = (Get-Item $dbPath).Length
    Write-Host "  EXISTS ($dbSize bytes)" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# 4. Backup
Write-Host ""
Write-Host "Backup:" -ForegroundColor Yellow
$backupDir = Join-Path $ProjectRoot "backups"
if (Test-Path $backupDir) {
    $backups = Get-ChildItem -Path $backupDir -Filter "bamso_*.db" -File | Sort-Object LastWriteTime -Descending
    if ($backups.Count -gt 0) {
        $latest = $backups[0]
        $age = [math]::Round(((Get-Date) - $latest.LastWriteTime).TotalHours, 1)
        Write-Host "  LATEST: $($latest.Name) ($age hours ago)" -ForegroundColor Green
    } else {
        Write-Host "  NO BACKUPS" -ForegroundColor Yellow
    }
} else {
    Write-Host "  BACKUP DIR NOT FOUND" -ForegroundColor Yellow
}

# 5. Logs
Write-Host ""
Write-Host "Logs:" -ForegroundColor Yellow
$logDir = Join-Path $ProjectRoot "logs"
if (Test-Path $logDir) {
    $logFiles = Get-ChildItem -Path $logDir -File
    Write-Host "  DIR: $logDir ($($logFiles.Count) files)" -ForegroundColor Green
} else {
    Write-Host "  DIR NOT FOUND" -ForegroundColor Yellow
}

Write-Host ""
