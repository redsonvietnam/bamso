<#
.SYNOPSIS
    Generate a self-signed HTTPS certificate for BAMSO internal LAN deployment.

.DESCRIPTION
    Creates a self-signed certificate with IP SAN (Subject Alternative Name)
    for use with BAMSO's HTTPS server on port 3443.

    The certificate is exported as a PFX file.

.PARAMETER ServerIP
    The IP address of the BAMSO server (e.g., 192.168.1.10).
    This IP will be added as a SAN so browsers trust the certificate.

.PARAMETER OutputDir
    Directory to output certificate files. Defaults to ./certs

.PARAMETER Password
    PFX password. Defaults to 'bamso2026'. Change for production!

.PARAMETER IncludeLocalhost
    Include 'localhost' and '127.0.0.1' as SANs. Default: true.

.EXAMPLE
    # Interactive — prompts for IP
    powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1

    # With IP
    powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1 -ServerIP 192.168.1.10

    # Custom password
    powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1 -ServerIP 192.168.1.10 -Password "MySecret123"
#>

param(
    [string]$ServerIP,
    [string]$OutputDir = "certs",
    [string]$Password = "bamso2026",
    [switch]$IncludeLocalhost = $true
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BAMSO HTTPS Certificate Generator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Get Server IP ---
if (-not $ServerIP) {
    $ServerIP = Read-Host "Enter the server IP address (e.g., 192.168.1.10)"
}

if (-not $ServerIP -or $ServerIP -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    Write-Error "Invalid IP address: '$ServerIP'. Please provide a valid IPv4 address."
    exit 1
}

Write-Host "Server IP:     $ServerIP" -ForegroundColor Yellow
Write-Host "Output dir:    $OutputDir" -ForegroundColor Yellow
Write-Host "Validity:      10 years" -ForegroundColor Yellow
Write-Host ""

# --- Build DNS names for -DnsName ---
$dnsNames = @("BAMSO-Internal")
if ($IncludeLocalhost) {
    $dnsNames += "localhost"
}

# --- Build IP SAN extension (for IP-based access) ---
# OID 2.5.29.17 = Subject Alternative Name
# Format: IP: x.x.x.x  (prefix with "IP:" for IP addresses)
$sanEntries = @("IP: $ServerIP")
if ($IncludeLocalhost) {
    $sanEntries += "IP: 127.0.0.1"
    $sanEntries += "DNS: localhost"
}
$sanString = $sanEntries -join ", "

# Create the SAN extension using ASN.1
$sanOid = [System.Security.Cryptography.Oid]::LookupOidByValue("2.5.29.17")
$sanAsn = [System.Security.Cryptography.Asnn]::Create()

# Build the SAN raw data
$ipBytes = [System.Net.IPAddress]::Parse($ServerIP.Trim()).GetAddressBytes()
$ipOctetString = [System.Security.Cryptography.AsnEncodedData]::new("2.5.29.17", $ipBytes)

# Use TextExtension approach for PS 5.1 compatibility
# The format "ip_address=x.x.x.x" works with TextExtension
$textExtensions = @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

# --- Create output directory ---
$fullOutputDir = Join-Path $PSScriptRoot ".." $OutputDir
if (-not (Test-Path $fullOutputDir)) {
    New-Item -ItemType Directory -Path $fullOutputDir -Force | Out-Null
    Write-Host "Created directory: $fullOutputDir" -ForegroundColor Green
}

# --- Generate certificate ---
Write-Host "Generating self-signed certificate..." -ForegroundColor Yellow

# Try with SubjectAlternativeName first (PS 7+ / Server 2019+)
$cert = $null
try {
    $cert = New-SelfSignedCertificate `
        -DnsName $dnsNames `
        -Subject "CN=BAMSO-Internal, O=BAMSO, C=VN" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(10) `
        -KeyUsage DigitalSignature, KeyEncipherment `
        -TextExtension $textExtensions `
        -SubjectAlternativeName @("ip_address= $ServerIP") `
        -CertStoreLocation Cert:\CurrentUser\My
} catch {
    Write-Host "SubjectAlternativeName parameter not available (PS 5.1). Using DNS-only SAN." -ForegroundColor Yellow
}

# Fallback: without SubjectAlternativeName (PS 5.1)
if (-not $cert) {
    $cert = New-SelfSignedCertificate `
        -DnsName $dnsNames `
        -Subject "CN=BAMSO-Internal, O=BAMSO, C=VN" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(10) `
        -KeyUsage DigitalSignature, KeyEncipherment `
        -TextExtension $textExtensions `
        -CertStoreLocation Cert:\CurrentUser\My
}

if (-not $cert) {
    Write-Error "Failed to generate certificate."
    exit 1
}

Write-Host "Certificate generated successfully!" -ForegroundColor Green
Write-Host "  Thumbprint: $($cert.Thumbprint)" -ForegroundColor Cyan
Write-Host "  Subject:    $($cert.Subject)" -ForegroundColor Cyan
Write-Host "  Expires:    $($cert.NotAfter)" -ForegroundColor Cyan
Write-Host "  DNS Names:  $($cert.DnsNameList -join ', ')" -ForegroundColor Cyan
Write-Host ""

# --- Export PFX ---
$pfxPath = Join-Path $fullOutputDir "bamso.pfx"
$passwordSecure = ConvertTo-SecureString -String $Password -Force -AsPlainText

Export-PfxCertificate `
    -Cert $cert `
    -FilePath $pfxPath `
    -Password $passwordSecure `
    -ChainOption BuildChain | Out-Null

Write-Host "PFX exported:  $pfxPath" -ForegroundColor Green

# --- Summary ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "PFX file:     $pfxPath" -ForegroundColor Green
Write-Host "PFX password: $Password" -ForegroundColor Green
Write-Host "Server IP:    $ServerIP" -ForegroundColor Green
Write-Host "HTTPS port:   3443" -ForegroundColor Green
Write-Host ""

# --- Trust instructions ---
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TRUST INSTALLATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To avoid browser warnings on client machines:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Copy $pfxPath to each client machine" -ForegroundColor White
Write-Host "  2. Double-click .pfx → Install Certificate" -ForegroundColor White
Write-Host "  3. Choose 'Local Machine' → Next" -ForegroundColor White
Write-Host "  4. Place in 'Trusted Root Certification Authorities'" -ForegroundColor White
Write-Host "  5. Finish" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: On PS 5.1, the certificate has DNS SAN only (not IP SAN)." -ForegroundColor Yellow
Write-Host "  - Access via https://localhost:3443 works immediately" -ForegroundColor Gray
Write-Host "  - Access via https://<IP>:3443 requires cert trust on client" -ForegroundColor Gray
Write-Host "  - For IP SAN, use OpenSSL or PS 7+" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy certs/ folder to BAMSO server" -ForegroundColor White
Write-Host "  2. Install PFX on client machines (Trusted Root)" -ForegroundColor White
Write-Host "  3. Run: npm run start:https" -ForegroundColor White
Write-Host ""
