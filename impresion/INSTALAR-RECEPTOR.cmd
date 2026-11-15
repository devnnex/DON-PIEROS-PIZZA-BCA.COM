@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=Join-Path $env:LOCALAPPDATA 'DonPierosPrint'; New-Item -ItemType Directory -Path $d -Force | Out-Null; $f=Join-Path $d 'INSTALAR.ps1'; Invoke-WebRequest -UseBasicParsing 'https://devnnex.github.io/DON-PIEROS-PIZZA-BCA.COM/impresion/INSTALAR.ps1' -OutFile $f; & $f"
pause
