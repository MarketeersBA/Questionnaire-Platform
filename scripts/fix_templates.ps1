Rename-Item "d:\Questioner\backend\resources\templates" -NewName "Marketeers_Template_2025.pptx" -Force
New-Item -ItemType Directory -Force -Path "d:\Questioner\backend\resources\templates"
Move-Item "d:\Questioner\backend\resources\Marketeers_Template_2025.pptx" -Destination "d:\Questioner\backend\resources\templates" -Force
echo 'Done'
