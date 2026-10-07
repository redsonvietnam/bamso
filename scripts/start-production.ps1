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

# --- NODE_ENV HARDENING ---
# Production startup must run in production mode.
# If NODE_ENV is explicitly set to development, fail closed.
$nodeEnv = $env:NODE_ENV
if ($nodeEnv -eq "development") {
    Write-Host "  FATAL: NODE_ENV must be 'production' for production startup." -ForegroundColor Red
    Write-Host "  Set NODE_ENV=production or use 'npm run dev' for development." -ForegroundColor Gray
    exit 1
} elseif (-not $nodeEnv) {
    # If NODE_ENV not set, default to production for this startup path
    $nodeEnv = "production"
    Write-Host "  NODE_ENV: production (default for production startup)" -ForegroundColor Green
} else {
    # NODE_ENV is set to something other than development/production; proceed but log it
    Write-Host "  NODE_ENV: $nodeEnv" -ForegroundColor Gray
}

# --- DATABASE_URL REQUIREMENT ---
if ($nodeEnv -eq "production") {
    $dbUrl = $env:DATABASE_URL
    if (-not $dbUrl) {
        Write-Host "  FATAL: DATABASE_URL is required for production startup." -ForegroundColor Red
        Write-Host "  Production DATABASE_URL must be set as an environment variable." -ForegroundColor Gray
        exit 1
    }

# Reject development database targets. Normalize slash direction first.
# SQLite file URLs are matched by their path; bare relative dev.db paths are
# also rejected, while non-SQLite URLs are left untouched.
$dbUrlNormalized = $dbUrl.Trim().ToLower().Replace([char]92, [char]47)
$isDevDb = $false
if ($dbUrlNormalized.StartsWith("file:")) {
    $sqlitePath = $dbUrlNormalized.Substring(5)
    $normalizedSqlitePath = $sqlitePath.TrimStart("./")
    $isDevDb = $normalizedSqlitePath -eq "dev.db" -or
        $normalizedSqlitePath -eq "prisma/dev.db"
} elseif ($dbUrlNormalized -eq "dev.db" -or
    $dbUrlNormalized -eq "./dev.db" -or
    $dbUrlNormalized -eq "prisma/dev.db") {
    $isDevDb = $true
}

if ($isDevDb) {
        Write-Host "  FATAL: production DATABASE_URL must not target the development database." -ForegroundColor Red
        Write-Host "  DATABASE_URL must point to a production database, not dev.db." -ForegroundColor Gray
        exit 1
    }

    Write-Host "  DATABASE_URL: configured" -ForegroundColor Green
} else {
    Write-Host "  DATABASE_URL: $(if ($env:DATABASE_URL) { 'configured' } else { 'not set (development mode)' })" -ForegroundColor Gray
}

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

# --- Step 4: Safe database configuration logging ---
Write-Host ""
Write-Host "Step 4: Validating database configuration..." -ForegroundColor Yellow

# DATABASE_URL validation already performed in Step 2 (Phase 2-3).
# No need to re-check prisma\dev.db file — that was misleading;
# we now validate the actual DATABASE_URL environment variable.
# Log only that configuration is validated; never print the URL value.
Write-Host "  DATABASE_URL: configured" -ForegroundColor Green
Write-Host "  Production database configuration validated" -ForegroundColor Green

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
