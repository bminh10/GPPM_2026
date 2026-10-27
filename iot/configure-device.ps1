# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
param(
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$DeviceId,
    [string]$CampusId,
    [string]$RoomId,
    [string[]]$LightIds,
    [string]$ApiUrl = "http://host.wokwi.internal:8000",
    [string]$CaCertificate,
    [switch]$RotateKey
)
$ErrorActionPreference = "Stop"
$projectRoot = Join-Path $PSScriptRoot "light-room"
$folder = (Resolve-Path -LiteralPath (Join-Path $projectRoot $Project)).Path
if (-not $folder.StartsWith($projectRoot + "\", [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath (Join-Path $folder "platformio.ini"))) {
    throw "Project must be an IoT project folder under this directory."
}
$headerPath = Join-Path $folder "DeviceLocal.h"
$metadataPath = Join-Path $folder "device.json"
if (Test-Path -LiteralPath $metadataPath) {
    $metadata = Get-Content -LiteralPath $metadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($field in @("DeviceId", "CampusId", "RoomId")) {
        $configured = [string]$metadata.$field
        if (-not $configured) { throw "device.json is missing $field" }
        $provided = Get-Variable -Name $field -ValueOnly
        if ($provided -and $provided -cne $configured) { throw "$field differs from the generated firmware configuration." }
        Set-Variable -Name $field -Value $configured
    }
    $configuredLights = @($metadata.lightIds)
    if (-not $configuredLights.Count) { throw "device.json has no lightIds" }
    if ($LightIds -and (($LightIds -join ",") -cne ($configuredLights -join ","))) {
        throw "LightIds differ from the generated firmware configuration."
    }
    $LightIds = $configuredLights
} elseif (-not $LightIds) {
    $LightIds = @("light-1", "light-2")
}
if (-not $DeviceId -or -not $CampusId -or -not $RoomId) {
    throw "Provide DeviceId, CampusId and RoomId, or generate a project with device.json."
}
if ((Test-Path -LiteralPath $headerPath) -and -not $RotateKey) {
    throw "DeviceLocal.h already exists. Use -RotateKey explicitly to replace its credential."
}
$ApiUrl = $ApiUrl.TrimEnd("/")
if ($ApiUrl -match '["\r\n]' -or $ApiUrl -notmatch '^https?://') { throw "Invalid API URL" }
$certificate = ""
$allowHttp = "false"
if ($ApiUrl.StartsWith("https://")) {
    if (-not $CaCertificate) { throw "HTTPS requires -CaCertificate pointing to a trusted PEM root CA." }
    $certificate = Get-Content -LiteralPath $CaCertificate -Raw
    if ($certificate -notmatch '-----BEGIN CERTIFICATE-----' -or $certificate.Contains(')CA"')) {
        throw "Invalid PEM certificate"
    }
} elseif ($ApiUrl -match '^http://(host\.wokwi\.internal|localhost|127\.0\.0\.1):[0-9]+$') {
    $allowHttp = "true"
} else {
    throw "Unencrypted HTTP is only allowed for the local Wokwi gateway. Deploy with HTTPS."
}
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$key = [Convert]::ToBase64String($bytes)
$previousKey = $env:CAMPUSOPT_PROVISION_KEY
$env:CAMPUSOPT_PROVISION_KEY = $key
Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) "backend")
try {
    $arguments = @("-m", "app.lighting.provision", "--device", $DeviceId,
        "--campus", $CampusId, "--room", $RoomId, "--key-env", "CAMPUSOPT_PROVISION_KEY")
    foreach ($light in $LightIds) { $arguments += @("--light", $light) }
    & python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Provisioning failed; DeviceLocal.h was not changed." }
    $header = @"
#pragma once
#define LIGHTING_API_URL "$ApiUrl"
#define LIGHTING_DEVICE_KEY "$key"
#define LIGHTING_ALLOW_LOCAL_HTTP $allowHttp
#define LIGHTING_ROOT_CA R"CA($certificate)CA"
"@
    [IO.File]::WriteAllText($headerPath, $header, (New-Object Text.UTF8Encoding($false)))
    Write-Output "Configured $DeviceId. Credential is private in DeviceLocal.h; rebuild this project."
} finally {
    Pop-Location
    $env:CAMPUSOPT_PROVISION_KEY = $previousKey
}
