$ErrorActionPreference = "Continue"

$junkFiles = @(
    "api_fail_trace.txt", "backend_logs.txt", "cost_error.txt", "docker-logs.txt",
    "error_log.txt", "error_report.txt", "error_report_detailed.txt", "flow_debug.txt",
    "flow_error.txt", "full_debug.txt", "single_fail_trace.txt", "suite_error.txt",
    "suite_fail_trace.txt", "test_out.txt", "test_output.txt", "ba_excel_output.txt",
    "tmp_Purchase_Behaveior.json", "tmp_Usage.json", "tmp_excel_dump.txt", "tmp_excel_full.txt",
    "tmp_lines.xml", "db_output.json", "ba_excel_structure.json", "_api_download_test.pptx",
    "dump.archive"
)

foreach ($f in $junkFiles) {
    if (Test-Path "d:\Questioner\$f") { Remove-Item "d:\Questioner\$f" -Force }
}

New-Item -ItemType Directory -Force -Path "d:\Questioner\scripts\db" | Out-Null
New-Item -ItemType Directory -Force -Path "d:\Questioner\scripts\external" | Out-Null

$dbScripts = @(
    "check_db.py", "check_db_ids.py", "check_db_safe.py", "check_indexes.py",
    "check_pt.py", "check_report_content.py", "check_survey_report.py", "check_tt_stats.py",
    "find_reports.py", "inspect_pptx.py", "inspect_template.py", "read_ba_excel.py",
    "scan_charts.py", "test_gen.py", "test_pptx.py", "update_db.py"
)

foreach ($s in $dbScripts) {
    if (Test-Path "d:\Questioner\$s") { Move-Item "d:\Questioner\$s" -Destination "d:\Questioner\scripts\db\" -Force }
}

if (Test-Path "d:\Questioner\google-apps-script.js") { 
    Move-Item "d:\Questioner\google-apps-script.js" -Destination "d:\Questioner\scripts\external\" -Force
}

New-Item -ItemType Directory -Force -Path "d:\Questioner\docs" | Out-Null

if (Test-Path "d:\Questioner\analytics_enhancement_summary.md") {
    Move-Item "d:\Questioner\analytics_enhancement_summary.md" -Destination "d:\Questioner\docs\" -Force
}
# architecture_analysis.md.resolved migration complete (Phase 7).
# Historical content: docs/technical/architecture-review.md
# Redirect stub: docs/architecture_analysis.md

New-Item -ItemType Directory -Force -Path "d:\Questioner\data" | Out-Null

$dataAssets = @(
    "BAPF_pivot.xlsx",
    "General_Product_Test_Evaluation.xlsx",
    "Hero_data (2).csv",
    "Usage Questionnaire for automation (1).xlsx",
    "brand_analyzer_questionnaire (1).xlsx",
    "deomg.xlsx",
    "pivot_scalers.xlsx"
)

foreach ($d in $dataAssets) {
    if (Test-Path "d:\Questioner\$d") { Move-Item "d:\Questioner\$d" -Destination "d:\Questioner\data\" -Force }
}

if (Test-Path "d:\Questioner\Marketeers' Template 2025 (1).pptx") {
    Move-Item "d:\Questioner\Marketeers' Template 2025 (1).pptx" -Destination "d:\Questioner\backend\resources\templates\" -Force
}

if (Test-Path "d:\Questioner\conftest.py") { Move-Item "d:\Questioner\conftest.py" -Destination "d:\Questioner\backend\tests\" -Force }
if (Test-Path "d:\Questioner\pytest.ini") { Move-Item "d:\Questioner\pytest.ini" -Destination "d:\Questioner\backend\" -Force }

New-Item -ItemType Directory -Force -Path "d:\Questioner\frontend\public\assets\brand" | Out-Null
if (Test-Path "d:\Questioner\03 Marketeers logo") {
    Move-Item -Path "d:\Questioner\03 Marketeers logo\*" -Destination "d:\Questioner\frontend\public\assets\brand\" -Force -Recurse
    Remove-Item "d:\Questioner\03 Marketeers logo" -Recurse -Force
}

New-Item -ItemType Directory -Force -Path "d:\Questioner\frontend\public\fonts" | Out-Null
if (Test-Path "d:\Questioner\Pangram-FullFamily-FreeForPersonalUse") {
    Move-Item -Path "d:\Questioner\Pangram-FullFamily-FreeForPersonalUse\*" -Destination "d:\Questioner\frontend\public\fonts\" -Force -Recurse
    Remove-Item "d:\Questioner\Pangram-FullFamily-FreeForPersonalUse" -Recurse -Force
}

$dirsToDelete = @("d:\Questioner\out", "d:\Questioner\reports", "d:\Questioner\__pycache__", "d:\Questioner\.pytest_cache", "d:\Questioner\.system_view", "d:\Questioner\tmp")
foreach ($dir in $dirsToDelete) {
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
}

if (Test-Path "d:\Questioner\report.pptx") { Remove-Item "d:\Questioner\report.pptx" -Force }

echo "Cleanup phase 1 complete!"
