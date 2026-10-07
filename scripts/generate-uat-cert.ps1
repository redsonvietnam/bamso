<#
.SYNOPSIS
    Generate a local/UAT HTTPS certificate for BAMSO.

.DESCRIPTION
    Generates certs\bamso.pfx with SANs for the selected LAN IPv4,
    127.0.0.1, localhost, and BAMSO-Internal.

    The PFX password is prompted securely when -Password is omitted.
    The password is never printed or written to the repository.

    If certs\bamso.pfx already exists, it is preserved as a timestamped
    .pre-uat-*.bak copy before replacement.

.PARAMETER ServerIP
    LAN IPv4 to include in the certificate SAN. If omitted, the script
    selects the unique non-loopback/non-APIPA IPv4 address. If multiple
    candidates exist, specify -ServerIP explicitly.

.PARAMETER OutputDir
    Certificate output directory. Defaults to certs.

.PARAMETER Password
    Optional password supplied by a trusted process. Prefer omitting this
    parameter so PowerShell prompts with Read-Host -AsSecureString.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\generate-uat-cert.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\generate-uat-cert.ps1 -ServerIP 192.168.1.148
#>

param(
    [string]$ServerIP,
    [string]$OutputDir = "certs",
    [string]$Password
)

$ErrorActionPreference = "Stop"

function Get-UatLanIPv4 {
    $candidates = @(
        Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object {
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.PrefixOrigin -ne "WellKnown"
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    )

    if ($candidates.Count -eq 1) {
        return $candidates[0]
    }

    if ($candidates.Count -eq 0) {
        throw "No non-loopback LAN IPv4 address was found. Supply -ServerIP explicitly."
    }

    throw ("Multiple LAN IPv4 candidates found ({0}). Supply -ServerIP explicitly: {1}" -f $candidates.Count, ($candidates -join ", "))
}

if ([string]::IsNullOrWhiteSpace($ServerIP)) {
    $ServerIP = Get-UatLanIPv4
}

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($ServerIP, [ref]$parsedIp) -or $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "Invalid IPv4 address: $ServerIP"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    $securePassword = Read-Host "HTTPS_PFX_PASSWORD" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if ([string]::IsNullOrWhiteSpace($Password)) {
    throw "A non-empty PFX password is required."
}

$fullOutputDir = Join-Path (Join-Path $PSScriptRoot "..") $OutputDir
if (-not (Test-Path -LiteralPath $fullOutputDir)) {
    New-Item -ItemType Directory -Path $fullOutputDir -Force | Out-Null
}

$pfxPath = Join-Path $fullOutputDir "bamso.pfx"
if (Test-Path -LiteralPath $pfxPath) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$pfxPath.pre-uat-$stamp.bak"
    Copy-Item -LiteralPath $pfxPath -Destination $backupPath -Force
    Write-Output "Existing PFX preserved: $backupPath"
}

$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$certificate = $null

try {
    $subject = [System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new(
        "CN=BAMSO-Internal, O=BAMSO, C=VN"
    )
    $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        $subject,
        $rsa,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )

    $sanBuilder = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $sanBuilder.AddIpAddress($parsedIp)
    $sanBuilder.AddIpAddress([System.Net.IPAddress]::Loopback)
    $sanBuilder.AddDnsName("localhost")
    $sanBuilder.AddDnsName("BAMSO-Internal")
    $request.CertificateExtensions.Add($sanBuilder.Build())
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true)
    )
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
            $true
        )
    )
    $serverAuthOid = [System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.1", "Server Authentication")
    $eku = [System.Security.Cryptography.OidCollection]::new()
    [void]$eku.Add($serverAuthOid)
    $request.CertificateExtensions.Add(
        [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku, $true)
    )

    $certificate = $request.CreateSelfSigned(
        [DateTimeOffset]::UtcNow.AddMinutes(-5),
        [DateTimeOffset]::UtcNow.AddYears(10)
    )

    [System.IO.File]::WriteAllBytes(
        $pfxPath,
        $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $Password)
    )
}
finally {
    if ($certificate) { $certificate.Dispose() }
    $rsa.Dispose()
}

Write-Output "UAT certificate generated: $pfxPath"
Write-Output "LAN IPv4 in SAN: $ServerIP"
Write-Output "SAN also includes: 127.0.0.1, localhost, BAMSO-Internal"
Write-Output "PFX password: process/interactive secret only; not printed"
