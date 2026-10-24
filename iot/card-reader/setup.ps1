param([switch]$SkipWifi, [ValidateSet("reader", "writer")][string]$Role = "reader")
$ErrorActionPreference = "Stop"
$backend = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "backend"
$envPath = Join-Path $backend ".env"
if (-not (Test-Path -LiteralPath $envPath)) { throw "Configure backend\.env first." }
$stationFolder = Join-Path (Split-Path $PSScriptRoot -Parent) "card-$Role"
$prefix = "CARD_" + $Role.ToUpperInvariant()
$headerPath = Join-Path $stationFolder "DeviceLocal.h"
if (Test-Path -LiteralPath $headerPath) {
    throw "DeviceLocal.h already exists. Edit its network fields locally; setup will not overwrite it."
}
$content = Get-Content -LiteralPath $envPath -Raw -Encoding UTF8
$match = [regex]::Match($content, "(?m)^${prefix}_KEY=([A-Za-z0-9+/=]{32,256})\r?$")
if ($content -match "(?m)^${prefix}_KEY=[^\r\n]+\r?$" -and -not $match.Success) {
    throw "Existing ${prefix}_KEY format is unsupported; refusing to replace it."
}
$key = $match.Groups[1].Value
if (-not $match.Success) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [Convert]::ToBase64String($bytes)
    if ($content -match "(?m)^${prefix}_KEY=\r?$") {
        $content = [regex]::Replace($content, "(?m)^${prefix}_KEY=\r?$", "${prefix}_KEY=$key")
        [IO.File]::WriteAllText($envPath, $content, (New-Object Text.UTF8Encoding($false)))
    } else {
        [IO.File]::AppendAllText($envPath, "`n${prefix}_KEY=$key`n", (New-Object Text.UTF8Encoding($false)))
    }
}
$idMatch = [regex]::Match($content, "(?m)^${prefix}_ID=([A-Za-z0-9_-]{1,80})\r?$")
if ($content -match "(?m)^${prefix}_ID=" -and -not $idMatch.Success) {
    throw "Unsupported ${prefix}_ID format."
}
$readerId = "card-$Role-01"
if ($idMatch.Success) { $readerId = $idMatch.Groups[1].Value }
$ssid = ""
$password = ""
$api = "http://REPLACE_WITH_PC_LAN_IP:8000"
if (-not $SkipWifi) {
    $ssid = Read-Host "Wi-Fi SSID (2.4 GHz)"
    $secure = Read-Host "Wi-Fi password" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $api = (Read-Host "Backend LAN URL, e.g. http://192.168.1.10:8000").TrimEnd("/")
    if ($api -notmatch '^http://(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):[0-9]+$') {
        throw "Use a private LAN HTTP URL for this setup. Configure CA/HTTPS manually for deployment."
    }
}
$ssidJson = ConvertTo-Json -InputObject $ssid -Compress
$passwordJson = ConvertTo-Json -InputObject $password -Compress
$header = @"
#pragma once
#define READER_WIFI_SSID $ssidJson
#define READER_WIFI_PASSWORD $passwordJson
#define READER_ID "$readerId"
#define READER_API_URL "$api"
#define READER_DEVICE_KEY "$key"
#define READER_ALLOW_LAN_HTTP true
#define READER_ROOT_CA ""
"@
[IO.File]::WriteAllText($headerPath, $header, (New-Object Text.UTF8Encoding($false)))
Push-Location $backend
try {
    $module = "app.cards.router"
    if ($Role -eq "writer") { $module = "app.cards.writer" }
    & python -m $module
    if ($LASTEXITCODE -ne 0) { throw "Station initialization failed. Fix backend configuration and run python -m $module from backend." }
} finally { Pop-Location }
Write-Output "Private $Role configuration saved. Restart backend, configure LAN/Wi-Fi if skipped, then build/upload."
