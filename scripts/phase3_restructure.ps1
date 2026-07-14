$ErrorActionPreference = "Continue"

# 1. GitHub Workflows
if (Test-Path "d:\Questioner\.github\workflows\main.yml") {
    Rename-Item "d:\Questioner\.github\workflows\main.yml" -NewName "ci.yml" -Force
}
New-Item -ItemType File -Force -Path "d:\Questioner\.github\workflows\deploy-staging.yml" | Out-Null
New-Item -ItemType File -Force -Path "d:\Questioner\.github\workflows\deploy-production.yml" | Out-Null

# 2. Infra Root & Subdirectories
$infraDirs = @(
    "d:\Questioner\infra\docker",
    "d:\Questioner\infra\nginx",
    "d:\Questioner\infra\aws\cloudformation",
    "d:\Questioner\infra\scripts"
)
foreach ($dir in $infraDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# 3. Infra Moves & Placeholders
if (Test-Path "d:\Questioner\docker-compose.yml") {
    Move-Item "d:\Questioner\docker-compose.yml" -Destination "d:\Questioner\infra\docker\" -Force
}
New-Item -ItemType File -Force -Path "d:\Questioner\infra\docker\docker-compose.prod.yml" | Out-Null
New-Item -ItemType File -Force -Path "d:\Questioner\infra\docker\docker-compose.test.yml" | Out-Null

if (Test-Path "d:\Questioner\nginx\nginx.conf") {
    Move-Item "d:\Questioner\nginx\nginx.conf" -Destination "d:\Questioner\infra\nginx\nginx.dev.conf" -Force
}
New-Item -ItemType File -Force -Path "d:\Questioner\infra\nginx\nginx.prod.conf" | Out-Null
if (Test-Path "d:\Questioner\nginx") {
    Remove-Item "d:\Questioner\nginx" -Recurse -Force
}

New-Item -ItemType File -Force -Path "d:\Questioner\infra\aws\ecs-task-definition.json" | Out-Null
New-Item -ItemType File -Force -Path "d:\Questioner\infra\aws\appspec.yml" | Out-Null
New-Item -ItemType File -Force -Path "d:\Questioner\infra\scripts\deploy.sh" | Out-Null
New-Item -ItemType File -Force -Path "d:\Questioner\infra\scripts\health-check.sh" | Out-Null

# 4. Backend
if (Test-Path "d:\Questioner\backend\Dockerfile") {
    Copy-Item "d:\Questioner\backend\Dockerfile" -Destination "d:\Questioner\backend\Dockerfile.dev" -Force
}
if (Test-Path "d:\Questioner\requirements.txt") {
    Copy-Item "d:\Questioner\requirements.txt" -Destination "d:\Questioner\backend\requirements-dev.txt" -Force
    Move-Item "d:\Questioner\requirements.txt" -Destination "d:\Questioner\backend\requirements.txt" -Force
}
if (Test-Path "d:\Questioner\backend\tests\conftest.py" -and -not (Test-Path "d:\Questioner\backend\conftest.py")) {
    Move-Item "d:\Questioner\backend\tests\conftest.py" -Destination "d:\Questioner\backend\" -Force
}

# 5. Frontend
if (Test-Path "d:\Questioner\frontend\Dockerfile") {
    Copy-Item "d:\Questioner\frontend\Dockerfile" -Destination "d:\Questioner\frontend\Dockerfile.dev" -Force
}

# 6. Data & Question Banks
New-Item -ItemType Directory -Force -Path "d:\Questioner\data\question_banks" | Out-Null
if (Test-Path "d:\Questioner\docs\question_bank") {
    Move-Item -Path "d:\Questioner\docs\question_bank\*" -Destination "d:\Questioner\data\question_banks\" -Force
    Remove-Item "d:\Questioner\docs\question_bank" -Recurse -Force
}
New-Item -ItemType File -Force -Path "d:\Questioner\docs\deployment.md" | Out-Null

# 7. Render.yaml cleanup
if (Test-Path "d:\Questioner\render.yaml") {
    Remove-Item "d:\Questioner\render.yaml" -Force
}

echo "Phase 3 restructuring complete."
