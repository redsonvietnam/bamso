<#
.SYNOPSIS
    Stop only the BAMSO UAT processes listening on ports 3443 and 3001.

.DESCRIPTION
    This is a LOCAL/UAT utility. It never terminates every Node process by image name and
    refuses to stop a process unless its command line or working directory
    identifies the BAMSO repository.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [IO.Path]::GetFullPath((Join-Path $scriptDir '..'))
$ports = @(3443, 3001)

function Get-UatListeners {
    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction Stop)
    } catch {
        $message = $_.Exception.Message
        if ($message -match '(?i)No matching .*MSFT_NetTCPConnection|No matching.*objects found by CIM query') {
            return @()
        }
        throw
    }
}

try {
    $connections = @(Get-UatListeners)
} catch {
    Write-Error "Unable to inspect UAT listeners: $($_.Exception.Message)"
    exit 1
}

if ($connections.Count -eq 0) {
    Write-Host 'No existing BAMSO UAT runtime found.'
    exit 0
}

$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
$failed = $false

foreach ($ownerPid in $pids) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
    $commandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { '' }
    $workingDirectory = if ($processInfo) { [string]$processInfo.WorkingDirectory } else { '' }
    $isBamso = ($commandLine -match '(?i)(^|[\\/ ])server\.js([ ]|$)') -or
        ($workingDirectory -and ([IO.Path]::GetFullPath($workingDirectory).TrimEnd('\') -ieq $projectRoot.TrimEnd('\')))

    if (-not $isBamso) {
        Write-Error "Refusing to stop PID ${ownerPid}: it owns a UAT port but was not verified as BAMSO (command/workdir unavailable or unrelated)."
        $failed = $true
        continue
    }

    try {
        Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        Write-Host "Stopped BAMSO UAT PID $ownerPid (ports: $((($connections | Where-Object OwningProcess -eq $ownerPid | Select-Object -ExpandProperty LocalPort -Unique) -join ', ')))."
    } catch {
        Write-Error "Failed to stop verified BAMSO UAT PID ${ownerPid}: $($_.Exception.Message)"
        $failed = $true
    }
}

Start-Sleep -Milliseconds 500
try {
    $remaining = @(Get-UatListeners)
} catch {
    Write-Error "Unable to verify UAT listeners after stop: $($_.Exception.Message)"
    exit 1
}
if ($remaining.Count -gt 0) {
    Write-Error "UAT listener(s) remain: $((($remaining | ForEach-Object { \"$($_.LocalAddress):$($_.LocalPort) PID $($_.OwningProcess)\" }) -join '; '))"
    $failed = $true
}

if ($failed) { exit 1 }
exit 0
