Copy-Item "d:\Questioner\03 Marketeers logo\*" -Destination "d:\Questioner\frontend\public\assets\brand" -Recurse -Force
Remove-Item "d:\Questioner\03 Marketeers logo" -Recurse -Force
Copy-Item "d:\Questioner\Pangram-FullFamily-FreeForPersonalUse\*" -Destination "d:\Questioner\frontend\public\fonts" -Recurse -Force
Remove-Item "d:\Questioner\Pangram-FullFamily-FreeForPersonalUse" -Recurse -Force
echo 'Done'
