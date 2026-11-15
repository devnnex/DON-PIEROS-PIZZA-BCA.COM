$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$printRoot = Join-Path $env:LOCALAPPDATA 'DonPierosPrint'
New-Item -ItemType Directory -Path $printRoot -Force | Out-Null
Write-Host 'Don Pieros Pizza - Receptor de impresion para Windows'
Write-Host 'La impresora debe estar instalada en Windows y conectada por USB, red o Bluetooth.'
$printers = @(Get-CimInstance Win32_Printer | Where-Object { $_.Name -notmatch 'Microsoft Print to PDF|OneNote|XPS Document|Fax' })
if (!$printers.Count) { throw 'No hay impresoras fisicas instaladas. Instala el controlador y vuelve a ejecutar este archivo.' }
for ($i=0; $i -lt $printers.Count; $i++) { Write-Host ('{0}. {1}' -f ($i+1),$printers[$i].Name) }
$choice = 0
if (![int]::TryParse((Read-Host 'Numero de la impresora que recibira los trabajos'),[ref]$choice) -or $choice -lt 1 -or $choice -gt $printers.Count) { throw 'Seleccion no valida.' }
$printer = $printers[$choice-1].Name
if ($printer -match '["\r\n]') { throw 'El nombre de la impresora no puede contener comillas ni saltos de linea.' }
# Portable PDF engine, downloaded from the publisher and pinned by SHA-256.
# No printer driver, default printer, file association or cash drawer is changed.
if (![Environment]::Is64BitOperatingSystem) { throw 'Este instalador requiere Windows de 64 bits.' }
$zip = Join-Path $printRoot 'SumatraPDF-3.6.1-64.zip'
$engine = Join-Path $printRoot 'SumatraPDF-3.6.1-64.exe'
if (!(Test-Path -LiteralPath $engine)) {
 Write-Host 'Descargando motor PDF portable de SumatraPDF...'
 Invoke-WebRequest -UseBasicParsing 'https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip' -OutFile $zip
 if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne '98B33A518D42986856D225064B0CD2D3643ECF78CBF84AB873D26CC51877A544') { throw 'La descarga no coincide con la version verificada.' }
 Expand-Archive -LiteralPath $zip -DestinationPath $printRoot -Force
 Remove-Item -LiteralPath $zip
}
if (!(Test-Path -LiteralPath $engine)) { throw 'No se encontro el motor PDF.' }
$settingsFile = Join-Path $printRoot 'settings.json'
$old = $null
if (Test-Path -LiteralPath $settingsFile) { $old = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json }
if ($old.id -and $old.secret) { $id=$old.id; $secret=$old.secret } else {
 $id = [guid]::NewGuid().ToString()
 $random = New-Object byte[] 32
 $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($random); $rng.Dispose()
 $secret = [Convert]::ToBase64String($random)
}
@{id=$id;secret=$secret;printer=$printer;engine=$engine;label=$env:COMPUTERNAME} | ConvertTo-Json | Set-Content -LiteralPath $settingsFile -Encoding UTF8
$receiver = Join-Path $printRoot 'RECEPTOR.ps1'
Invoke-WebRequest -UseBasicParsing 'https://devnnex.github.io/DON-PIEROS-PIZZA-BCA.COM/impresion/RECEPTOR.ps1' -OutFile $receiver
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup 'Don Pieros - Impresora.lnk'))
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$receiver+'"'
$shortcut.WindowStyle=7; $shortcut.Save()
Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Host 'Receptor instalado. Abre admin.html o mesero.html e inicia sesion en este PC.'
Write-Host 'Si el navegador pide acceso a la red local, permite el acceso para este sitio.'
Write-Host 'Configura el ancho de papel de la impresora en Windows (58 u 80 mm) y elige el mismo ancho en el sistema.'
Write-Host 'No se ha enviado ninguna pagina de prueba.'
