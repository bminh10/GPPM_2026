# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
param([switch]$SkipWifi)
$ErrorActionPreference = "Stop"
& (Join-Path (Split-Path $PSScriptRoot -Parent) "card-reader\setup.ps1") -Role writer -SkipWifi:$SkipWifi
