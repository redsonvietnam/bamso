<#
.SYNOPSIS
    Start the BAMSO LOCAL/UAT HTTPS runtime and perform local health checks.

.DESCRIPTION
    Uses process-scoped environment variables only. The PFX password is read
    as a SecureString and is never written to a file or printed.
#>

[CmdletBinding()]
param(
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [IO.Path]::GetFullPath((Join-Path $scriptDir '..'))
$healthScript = Join-Path $scriptDir 'check-health.ps1'
$pfxBstr = $null
$jwtBstr = $null
$startProcess = $null

function Get-UatListeners {
    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort @(3443, 3001) -ErrorAction Stop)
    } catch {
        $message = $_.Exception.Message
        if ($message -match '(?i)No matching .*MSFT_NetTCPConnection|No matching.*objects found by CIM query') {
            return @()
        }
        throw
    }
}

function Get-UatBuildId {
    param([string]$Root)

    $buildPath = Join-Path $Root '.next\BUILD_ID'
    if (-not (Test-Path -LiteralPath $buildPath)) {
        throw "UAT build identity not found: $buildPath"
    }

    $buildId = (Get-Content -LiteralPath $buildPath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($buildId) -or $buildId -match '[\r\n]') {
        throw "UAT build identity is invalid: $buildPath"
    }
    return $buildId
}

function Get-UatRuntimeEvidence {
    $nodeProbe = @'
const https = require('https');
function get(path) {
  return new Promise((resolve, reject) => {
    const request = https.get({ hostname: 'localhost', port: 3443, path, rejectUnauthorized: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode || 0, body }));
    });
    request.on('error', reject);
  });
}
(async () => {
  const page = await get('/get-ticket');
  const cssMatch = page.body.match(/\/_next\/static\/[^"'\s]+\.css(?:\?[^"'\s]*)?/);
  let cssStatus = 0;
  if (cssMatch) cssStatus = (await get(cssMatch[0])).status;
  process.stdout.write(`CSS_STATUS=${cssStatus}\n`);
})().catch(() => process.exit(1));
'@

    $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeCommand) { return $null }
    $output = @(& $nodeCommand -e $nodeProbe 2>$null)
    if ($LASTEXITCODE -ne 0) { return $null }

    $logPath = Join-Path $projectRoot 'logs\app.log'
    if (-not (Test-Path -LiteralPath $logPath)) { return $null }
    $runtimeBuildLine = Get-Content -LiteralPath $logPath -Tail 200 | Where-Object { $_ -match 'BAMSO Next build identity: ' } | Select-Object -Last 1
    $runtimeBuildId = if ($runtimeBuildLine -match 'BAMSO Next build identity: ([^ ]+)') { $Matches[1] } else { '' }
    $cssStatusText = ($output | Where-Object { $_ -like 'CSS_STATUS=*' } | Select-Object -First 1) -replace '^CSS_STATUS=', ''
    if ([string]::IsNullOrWhiteSpace($runtimeBuildId)) { return $null }
    return [pscustomobject]@{
        BuildId = $runtimeBuildId.Trim()
        CssStatus = [int]$cssStatusText
    }
}

function Import-UatDotEnv {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return }

    $allowedKeys = @(
        'DATABASE_URL',
        'JWT_SECRET',
        'HTTPS_PFX_PATH',
        'HTTPS_KEY_PATH',
        'HTTPS_CERT_PATH',
        'LOG_LEVEL'
    )

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
        $name = $Matches[1]
        if ($allowedKeys -notcontains $name -or $name -eq 'HTTPS_PFX_PASSWORD') { continue }
        if (-not [string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)) { continue }

        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

function Test-UatPrerequisites {
    param([string]$Root)

    if (-not (Test-Path -LiteralPath (Join-Path $Root 'server.js'))) {
        throw "BAMSO entrypoint not found under $Root."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd was not found on PATH.'
    }
    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        throw 'DATABASE_URL is missing. Set it in .env or the current process environment before restarting UAT.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Root '.next\BUILD_ID'))) {
        throw 'No current Next build found. Run npm run build before starting UAT.'
    }
}

function Read-UatJwtIfMissing {
    if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
        $secureJwt = Read-Host 'JWT_SECRET' -AsSecureString
        $script:jwtBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureJwt)
        $env:JWT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($script:jwtBstr)
    }
    if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) {
        throw 'JWT_SECRET is required; the secure prompt received an empty value.'
    }
    if ($env:JWT_SECRET.Length -lt 32) {
        throw 'JWT_SECRET is present but shorter than the required 32 characters.'
    }
}

function Read-And-ValidatePfx {
    param([string]$Root)

    $pfxPath = if ($env:HTTPS_PFX_PATH) { $env:HTTPS_PFX_PATH } else { Join-Path $Root 'certs\bamso.pfx' }
    if (-not (Test-Path -LiteralPath $pfxPath)) {
        $keyPath = if ($env:HTTPS_KEY_PATH) { $env:HTTPS_KEY_PATH } else { Join-Path $Root 'certs\localhost-key.pem' }
        $certPath = if ($env:HTTPS_CERT_PATH) { $env:HTTPS_CERT_PATH } else { Join-Path $Root 'certs\localhost.pem' }
        if ((Test-Path -LiteralPath $keyPath) -and (Test-Path -LiteralPath $certPath)) {
            Write-Host 'Using existing PEM certificate fallback; no PFX password is required.' -ForegroundColor Yellow
            return
        }
        throw "No UAT certificate found. Expected PFX at $pfxPath or a complete PEM key/certificate pair."
    }

    $securePassword = Read-Host 'HTTPS_PFX_PASSWORD' -AsSecureString
    $script:pfxBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $env:HTTPS_PFX_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($script:pfxBstr)
        $nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
        $nodeProbe = "const fs=require('fs');const tls=require('tls');tls.createSecureContext({pfx:fs.readFileSync(process.argv[1]),passphrase:process.env.HTTPS_PFX_PASSWORD});"
        & $nodeCommand -e $nodeProbe $pfxPath 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'Node rejected the PFX credential or container.'
        }
    } catch {
        throw "UAT PFX preflight failed; existing runtime was not stopped. $($_.Exception.Message)"
    }
}

try {
    Set-Location -LiteralPath $projectRoot

    # Next.js convention is .env at the project root. server.js validates
    # production secrets before app.prepare(), so load only the required
    # runtime keys here. Never load or persist HTTPS_PFX_PASSWORD from a file.
    Import-UatDotEnv -Path (Join-Path $projectRoot '.env')

    $env:NODE_ENV = 'production'
    $env:HOST = '0.0.0.0'
    $env:HTTP_PORT = '3001'
    $env:HTTPS_PORT = '3443'

    Test-UatPrerequisites -Root $projectRoot
    Read-UatJwtIfMissing
    Read-And-ValidatePfx -Root $projectRoot

    $expectedBuildId = Get-UatBuildId -Root $projectRoot
    Write-Host "UAT BUILD_ID to start: $expectedBuildId" -ForegroundColor Cyan

    try {
        $existingListeners = @(Get-UatListeners)
    } catch {
        throw "Unable to inspect existing UAT listeners before restart: $($_.Exception.Message)"
    }

    if ($existingListeners.Count -gt 0) {
        $currentEvidence = Get-UatRuntimeEvidence
        if ($currentEvidence -and $currentEvidence.BuildId -ne $expectedBuildId) {
            Write-Warning "STALE_RUNTIME: runtime BUILD_ID $($currentEvidence.BuildId) != current .next BUILD_ID $expectedBuildId. Restart required."
        } elseif (-not $currentEvidence) {
            Write-Warning 'STALE_RUNTIME: existing UAT listener build identity could not be verified. Restart required.'
        }
        if (-not $Restart) {
            throw 'Existing UAT runtime is still listening. Run scripts\restart-uat.bat to perform the required stop/start.'
        }
    }

    if ($Restart) {
        Write-Host 'Preflight passed; stopping the existing BAMSO UAT runtime...' -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir 'stop-uat.ps1')
        if ($LASTEXITCODE -ne 0) {
            throw "UAT stop failed with exit code $LASTEXITCODE."
        }
    }

    $npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
    Write-Host 'Starting BAMSO UAT with npm run start:https...' -ForegroundColor Cyan
    $startProcess = Start-Process -FilePath $npmCommand `
        -ArgumentList @('run', 'start:https') `
        -WorkingDirectory $projectRoot `
        -NoNewWindow `
        -PassThru

    $ready = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        Start-Sleep -Seconds 1
        if ($startProcess.HasExited) {
            throw "UAT startup failed with exit code $($startProcess.ExitCode)."
        }

        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3443 -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw 'UAT did not start listening on 0.0.0.0:3443 within 30 seconds.'
    }

    $runtimeEvidence = Get-UatRuntimeEvidence
    if (-not $runtimeEvidence) {
        throw 'Unable to verify the build identity served by the fresh UAT runtime.'
    }
    Write-Host "UAT runtime BUILD_ID: $($runtimeEvidence.BuildId)" -ForegroundColor Green
    if ($runtimeEvidence.BuildId -ne $expectedBuildId) {
        throw "STALE_RUNTIME: runtime BUILD_ID $($runtimeEvidence.BuildId) != current .next BUILD_ID $expectedBuildId."
    }
    if ($runtimeEvidence.CssStatus -ne 200) {
        throw "UAT CSS asset verification failed with HTTP status $($runtimeEvidence.CssStatus)."
    }
    Write-Host 'UAT CSS asset verification: HTTP 200' -ForegroundColor Green

    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3443, 3001 -ErrorAction SilentlyContinue)
    Write-Host 'UAT listeners:' -ForegroundColor Green
    $listeners | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize

    if (-not (Test-Path -LiteralPath $healthScript)) {
        Write-Warning 'Health helper not found; listener verification passed, HTTP health check skipped.'
    } else {
        Write-Host 'Checking https://localhost:3443/api/health...' -ForegroundColor Cyan
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $healthScript -Url 'https://localhost:3443/api/health' -IgnoreCert
        if ($LASTEXITCODE -ne 0) {
            throw "UAT health check failed with exit code $LASTEXITCODE."
        }
    }

    Write-Host 'UAT runtime is running. Keep this window open for server logs.' -ForegroundColor Green
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if ($pfxBstr) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pfxBstr)
    }
    if ($jwtBstr) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($jwtBstr)
    }
    Remove-Item Env:HTTPS_PFX_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
