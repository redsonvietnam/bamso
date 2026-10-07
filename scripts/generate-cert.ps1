<#
.SYNOPSIS
    Compatibility wrapper for the canonical BAMSO LOCAL/UAT certificate generator.

.DESCRIPTION
    The legacy generator is retained only so existing operator commands do not
    break. It delegates to scripts\generate-uat-cert.ps1, which uses secure
    password input and preserves an existing UAT PFX before replacement.

    No password default or secret is stored here.
#>

$ErrorActionPreference = "Stop"
$generator = Join-Path $PSScriptRoot "generate-uat-cert.ps1"

if (-not (Test-Path -LiteralPath $generator -PathType Leaf)) {
    throw "Canonical UAT certificate generator not found: $generator"
}

& $generator @args
exit $LASTEXITCODE
