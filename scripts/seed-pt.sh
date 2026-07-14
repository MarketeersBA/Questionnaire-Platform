#!/usr/bin/env bash
# Seed product/package test question banks and verify health.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Product Test bank seed (Questioner)"
python -m backend.scripts.seed_product_test_data "$@"
python -m backend.scripts.seed_product_test_data --verify-only
