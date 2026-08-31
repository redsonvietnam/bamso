<#
.SYNOPSIS
    Configure Windows Firewall for BAMSO internal LAN deployment.

.DESCRIPTION
    Creates Windows Firewall rules to allow BAMSO HTTPS/HTTP access
    from the internal LAN while blocking external access.

    This script:
    - Allows inbound TCP 3443 (HTTPS) from LAN subnet
    - Allows inbound TCP 3000 (HTTP redirect) from LAN subnet
    - Blocks inbound TCP 3443/3000 from external/WAN
    - Does NOT disable Windows Firewall

.PARAMETER LanSubnet
    The LAN subnet to allow access from (e.g., 192.168.1.0/24).
    If not specified, allows from all local subnets.

.PARAMETER DryRun
    Show what would be done without making changes.

.EXAMPLE
    # Interactive — prompts for subnet
    powershell -ExecutionPolicy Bypass -File scripts/setup-firewall.ps1

    # With subnet
    powershell -ExecutionPolicy Bypass -File scripts/setup-firewall.ps1 -LanSubnet 192.168.1.0/24

    # Preview only
    powershell -ExecutionPolicy Bypass -File scripts/setup-firewall.ps1 -DryRun
#>

param(
    [string]$LanSubnet,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO Windows Firewall Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Get LAN subnet ---
if (-not $LanSubnet) {
    $LanSubnet = Read-Host "Enter the LAN subnet (e.g., 192.168.1.0/24)"
}

if (-not $LanSubnet) {
    Write-Error "LAN subnet is required."
    exit 1
}

Write-Host "LAN Subnet:  $LanSubnet" -ForegroundColor Yellow
Write-Host "HTTPS Port:  3443" -ForegroundColor Yellow
Write-Host "HTTP Port:   3000" -ForegroundColor Yellow
Write-Host "Dry Run:     $DryRun" -ForegroundColor Yellow
Write-Host ""

# --- Verify firewall is enabled ---
$firewallProfiles = Get-NetFirewallProfile
foreach ($profile in $firewallProfiles) {
    Write-Host "Firewall profile '$($profile.Name)': Enabled=$($profile.Enabled)" -ForegroundColor Gray
}

# --- Define rules ---
$rules = @(
    @{
        Name = "BAMSO HTTPS (LAN Inbound)"
        DisplayName = "BAMSO HTTPS (LAN Inbound)"
        Description = "Allow inbound TCP 3443 (HTTPS) from LAN for BAMSO"
        Direction = "Inbound"
        Protocol = "TCP"
        LocalPort = 3443
        Action = "Allow"
        RemoteAddress = $LanSubnet
        Profile = "Domain,Private"
        Enabled = $true
    },
    @{
        Name = "BAMSO HTTP Redirect (LAN Inbound)"
        DisplayName = "BAMSO HTTP Redirect (LAN Inbound)"
        Description = "Allow inbound TCP 3000 (HTTP redirect) from LAN for BAMSO"
        Direction = "Inbound"
        Protocol = "TCP"
        LocalPort = 3000
        Action = "Allow"
        RemoteAddress = $LanSubnet
        Profile = "Domain,Private"
        Enabled = $true
    },
    @{
        Name = "BAMSO HTTPS (Block External)"
        DisplayName = "BAMSO HTTPS (Block External)"
        Description = "Block inbound TCP 3443 from external/WAN"
        Direction = "Inbound"
        Protocol = "TCP"
        LocalPort = 3443
        Action = "Block"
        RemoteAddress = "Any"
        Profile = "Domain,Private,Public"
        Enabled = $true
    },
    @{
        Name = "BAMSO HTTP (Block External)"
        DisplayName = "BAMSO HTTP (Block External)"
        Description = "Block inbound TCP 3000 from external/WAN"
        Direction = "Inbound"
        Protocol = "TCP"
        LocalPort = 3000
        Action = "Block"
        RemoteAddress = "Any"
        Profile = "Domain,Private,Public"
        Enabled = $true
    }
)

# --- Apply rules ---
foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.DisplayName -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "Rule already exists: $($rule.DisplayName)" -ForegroundColor Gray
    } else {
        if ($DryRun) {
            Write-Host "[DRY RUN] Would create: $($rule.DisplayName)" -ForegroundColor Yellow
        } else {
            try {
                New-NetFirewallRule @rule | Out-Null
                Write-Host "Created rule: $($rule.DisplayName)" -ForegroundColor Green
            } catch {
                Write-Host "Failed to create rule: $($rule.DisplayName) - $_" -ForegroundColor Red
            }
        }
    }
}

# --- Summary ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Firewall rules configured for BAMSO:" -ForegroundColor Green
Write-Host ""
Write-Host "  ALLOW from LAN ($LanSubnet):" -ForegroundColor White
Write-Host "    - TCP 3443 (HTTPS)" -ForegroundColor Gray
Write-Host "    - TCP 3000 (HTTP redirect)" -ForegroundColor Gray
Write-Host ""
Write-Host "  BLOCK from external/WAN:" -ForegroundColor White
Write-Host "    - TCP 3443 (HTTPS)" -ForegroundColor Gray
Write-Host "    - TCP 3000 (HTTP)" -ForegroundColor Gray
Write-Host ""
Write-Host "NOTE: These rules apply to Domain and Private network profiles." -ForegroundColor Yellow
Write-Host "  Public profile rules are also created for blocking." -ForegroundColor Gray
Write-Host "  Verify network profile on the actual deployment machine." -ForegroundColor Gray
Write-Host ""
