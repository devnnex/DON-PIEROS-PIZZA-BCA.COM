$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$outputPath = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Extension -in @('.html','.css','.js','.webmanifest','.svg') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $outputPath -Force }
foreach ($directoryName in @('images','sound','vendor')) { Copy-Item -LiteralPath (Join-Path $projectRoot $directoryName) -Destination $outputPath -Recurse -Force }
[IO.File]::WriteAllText((Join-Path $outputPath '.nojekyll'),'')
$archivePath = Join-Path $projectRoot 'DON-PIEROS-PIZZA-web.zip'
Compress-Archive -Path (Join-Path $outputPath '*') -DestinationPath $archivePath -Force
Write-Output "Archivos para publicar: $outputPath"
Write-Output "ZIP para publicar: $archivePath"
Write-Output 'Recuerda configurar la nueva URL /exec en config.js antes de publicar.'
