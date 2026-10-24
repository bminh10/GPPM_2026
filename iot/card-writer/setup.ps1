param([switch]$SkipWifi)
$ErrorActionPreference = "Stop"
& (Join-Path (Split-Path $PSScriptRoot -Parent) "card-reader\setup.ps1") -Role writer -SkipWifi:$SkipWifi
