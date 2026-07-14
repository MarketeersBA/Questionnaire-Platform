if (Test-Path "d:\Questioner\backend\tests\conftest.py") {
    Move-Item "d:\Questioner\backend\tests\conftest.py" -Destination "d:\Questioner\backend\" -Force
}
