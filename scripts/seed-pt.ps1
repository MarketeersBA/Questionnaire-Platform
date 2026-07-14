# Seed product/package test question banks and verify health.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Product Test bank seed (Questioner)"
python -m backend.scripts.seed_product_test_data @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

python -m backend.scripts.seed_product_test_data --verify-only
exit $LASTEXITCODE
