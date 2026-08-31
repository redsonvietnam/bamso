<#
.SYNOPSIS
    Check BAMSO health endpoint.

.DESCRIPTION
    Queries the BAMSO health endpoint and reports status.
    Handles self-signed certificates for internal HTTPS.

.PARAMETER Url
    Health endpoint URL. Default: https://localhost:3443/api/health

.PARAMETER IgnoreCert
    Skip certificate validation (for self-signed certs).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/check-health.ps1
    powershell -ExecutionPolicy Bypass -File scripts/check-health.ps1 -Url https://192.168.1.100:3443/api/health
#>

param(
    [string]$Url = "https://localhost:3443/api/health",
    [switch]$IgnoreCert
)

$ErrorActionPreference = "Stop"

# Ignore self-signed certificate errors if requested
if ($IgnoreCert) {
    Add-Type @"
    using System.Net;
    using System.Net.Security;
    using System.Security.Cryptography.X509Certificates;
    public class TrustAllCertsPolicy : ICertificatePolicy {
        public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) {
            return true;
        }
    }
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
}

try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
    $body = $response.Content | ConvertFrom-Json

    if ($body.ok -eq $true) {
        Write-Host "HEALTH: PASS" -ForegroundColor Green
        Write-Host "  Database: $($body.db)" -ForegroundColor Gray
        exit 0
    } else {
        Write-Host "HEALTH: FAIL" -ForegroundColor Red
        Write-Host "  Database: $($body.db)" -ForegroundColor Gray
        if ($body.error) {
            Write-Host "  Error: $($body.error)" -ForegroundColor Red
        }
        exit 1
    }
} catch {
    Write-Host "HEALTH: FAIL" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
