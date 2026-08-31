<#
.SYNOPSIS
    BAMSO production startup wrapper.

.DESCRIPTION
    Validates environment, checks prerequisites, and starts the BAMSO HTTPS server.
    Designed for use with Windows Task Scheduler or manual startup.

    Checks performed:
    - Node.js availability
    - Required environment variables
    - Certificate existence
    - Database existence
    - Port availability

.PARAMETER DryRun
    Show what would be done without starting the server.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/start-production.ps1
    powershell -ExecutionPolicy Bypass -File scripts/start-production.ps1 -DryRun
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# --- Resolve project root ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO Production Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project root: $ProjectRoot" -ForegroundColor Gray

# --- Step 1: Check Node.js ---
Write-Host ""
Write-Host "Step 1: Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  FATAL: Node.js not found. Install Node.js and add to PATH." -ForegroundColor Red
    exit 1
}

# --- Step 2: Check environment ---
Write-Host ""
Write-Host "Step 2: Checking environment..." -ForegroundColor Yellow

$nodeEnv = $env:NODE_ENV
if (-not $nodeEnv) { $nodeEnv = "development" }
Write-Host "  NODE_ENV: $nodeEnv" -ForegroundColor Gray

$jwtSecret = $env:JWT_SECRET
if ($nodeEnv -eq "production") {
    if (-not $jwtSecret) {
        Write-Host "  FATAL: JWT_SECRET is required in production." -ForegroundColor Red
        exit 1
    }
    if ($jwtSecret.Length -lt 32) {
        Write-Host "  FATAL: JWT_SECRET must be at least 32 characters." -ForegroundColor Red
        exit 1
    }
    Write-Host "  JWT_SECRET: set ($($jwtSecret.Length) chars)" -ForegroundColor Green
} else {
    Write-Host "  JWT_SECRET: $(if ($jwtSecret) { 'set' } else { 'not set (ok for dev)' })" -ForegroundColor Gray
}

# --- Step 3: Check certificate ---
Write-Host ""
Write-Host "Step 3: Checking certificate..." -ForegroundColor Yellow

$certPath = if ($env:HTTPS_PFX_PATH) { $env:HTTPS_PFX_PATH } else { Join-Path $ProjectRoot "certs\bamso.pfx" }
$keyPath = if ($env:HTTPS_KEY_PATH) { $env:HTTPS_KEY_PATH } else { Join-Path $ProjectRoot "certs\localhost-key.pem" }
$certFile = if ($env:HTTPS_CERT_PATH) { $env:HTTPS_CERT_PATH } else { Join-Path $ProjectRoot "certs\localhost.pem" }

$hasPfx = Test-Path $certPath
$hasPem = (Test-Path $keyPath) -and (Test-Path $certFile)

if ($hasPfx) {
    Write-Host "  Certificate (PFX): $certPath" -ForegroundColor Green
} elseif ($hasPem) {
    Write-Host "  Certificate (PEM): $keyPath, $certFile" -ForegroundColor Green
} else {
    Write-Host "  WARNING: No SSL certificates found. Server will start in HTTP-only mode." -ForegroundColor Yellow
    Write-Host "  Expected PFX: $certPath" -ForegroundColor Gray
    Write-Host "  Run: powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1" -ForegroundColor Gray
}

# --- Step 4: Check database ---
Write-Host ""
Write-Host "Step 4: Checking database..." -ForegroundColor Yellow

$dbPath = Join-Path $ProjectRoot "prisma\dev.db"
if (Test-Path $dbPath) {
    $dbSize = (Get-Item $dbPath).Length
    Write-Host "  Database: $dbPath ($dbSize bytes)" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Database not found at $dbPath" -ForegroundColor Yellow
    Write-Host "  The server will start but may fail on first request." -ForegroundColor Yellow
}

# --- Step 5: Check port availability ---
Write-Host ""
Write-Host "Step 5: Checking ports..." -ForegroundColor Yellow

$httpsPort = if ($env:HTTPS_PORT) { [int]$env:HTTPS_PORT } else { 3443 }
$httpPort = if ($env:HTTP_PORT) { [int]$env:HTTP_PORT } else { 3000 }

$httpsOccupied = Get-NetTCPConnection -LocalPort $httpsPort -ErrorAction SilentlyContinue
$httpOccupied = Get-NetTCPConnection -LocalPort $httpPort -ErrorAction SilentlyContinue

if ($httpsOccupied) {
    Write-Host "  WARNING: Port $httpsPort (HTTPS) may be in use" -ForegroundColor Yellow
} else {
    Write-Host "  Port $httpsPort (HTTPS): available" -ForegroundColor Green
}

if ($httpOccupied) {
    Write-Host "  WARNING: Port $httpPort (HTTP) may be in use" -ForegroundColor Yellow
} else {
    Write-Host "  Port $httpPort (HTTP): available" -ForegroundColor Green
}

# --- Step 6: Start server ---
Write-Host ""
Write-Host "Step 6: Starting BAMSO server..." -ForegroundColor Yellow

if ($DryRun) {
    Write-Host "[DRY RUN] Would start: node server.js" -ForegroundColor Yellow
    Write-Host "  Working directory: $ProjectRoot" -ForegroundColor Gray
    Write-Host "  HTTPS port: $httpsPort" -ForegroundColor Gray
    Write-Host "  HTTP port: $httpPort" -ForegroundColor Gray
    Write-Host ""
    Write-Host "DRY RUN COMPLETE - no changes made." -ForegroundColor Cyan
    exit 0
}

Write-Host "  Starting: node server.js" -ForegroundColor Gray
Write-Host "  Working directory: $ProjectRoot" -ForegroundColor Gray
Write-Host "  HTTPS: https://0.0.0.0:${httpsPort}" -ForegroundColor Gray
Write-Host ("  HTTP redirect: http://0.0.0.0:" + $httpPort + " -> https://" + $httpsPort) -ForegroundColor Gray
Write-Host ""

# Change to project root and start server
Set-Location $ProjectRoot
& node server.js
exit $LASTEXITCODE
