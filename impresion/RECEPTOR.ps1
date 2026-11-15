$ErrorActionPreference = 'Stop'
$printRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'DonPierosPrint'))
$settings = Get-Content -LiteralPath (Join-Path $printRoot 'settings.json') -Raw | ConvertFrom-Json
$ledger = Join-Path $printRoot 'jobs'
New-Item -ItemType Directory -Path $ledger -Force | Out-Null
$mutex = New-Object Threading.Mutex($false,'Local\DonPierosPrintReceiver')
if (!$mutex.WaitOne(0)) { exit }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,8767)
$utf8 = [Text.UTF8Encoding]::new($false)
function Save-Receipt($file,$receipt) {
 $temp = $file+'.tmp'
 [IO.File]::WriteAllText($temp,($receipt | ConvertTo-Json -Compress),$utf8)
 Move-Item -LiteralPath $temp -Destination $file -Force
}
function Printer-Ready {
 $printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $settings.printer } | Select-Object -First 1
 return ($null -ne $printer -and !$printer.WorkOffline -and $printer.PrinterStatus -notin @(6,7) -and (Test-Path -LiteralPath $settings.engine))
}
function Print-Job($job) {
 $id = [guid]::Empty
 if (![guid]::TryParse([string]$job.id,[ref]$id) -or $job.secret -cne $settings.secret) { throw 'Trabajo no autorizado.' }
 $file = Join-Path $ledger ($id.ToString()+'.json')
 if (Test-Path -LiteralPath $file) {
  $receipt = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  if ($receipt.status -eq 'reserved') { $receipt.status='unknown';$receipt.error='Windows no confirmo el trabajo anterior. Revisa la impresora antes de reimprimir.';Save-Receipt $file $receipt }
  return $receipt
 }
 if (!(Printer-Ready)) { return @{status='failed';error='La impresora configurada no esta disponible en Windows.'} }
 $bytes = [Convert]::FromBase64String([string]$job.pdf)
 if ($bytes.Length -lt 8 -or $bytes.Length -gt 6291456 -or [Text.Encoding]::ASCII.GetString($bytes,0,5) -ne '%PDF-') { throw 'Documento PDF no valido.' }
 $pdf = Join-Path $ledger ($id.ToString()+'.pdf')
 $receipt = @{status='reserved';error='';at=[DateTime]::UtcNow.ToString('o')}
 Save-Receipt $file $receipt
 try {
  [IO.File]::WriteAllBytes($pdf,$bytes)
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$settings.engine
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true
  $info.Arguments='-silent -print-to "'+$settings.printer+'" -print-settings "noscale" "'+$pdf+'"'
  $process = [Diagnostics.Process]::Start($info)
  if (!$process.WaitForExit(60000)) {
   # Do not retry: the driver may already have accepted the job.
   $receipt.status='unknown';$receipt.error='El controlador tardo demasiado. Revisa la impresora antes de reimprimir.'
  } elseif ($process.ExitCode -eq 0) { $receipt.status='spooled' }
  else { $receipt.status='failed';$receipt.error='Windows rechazo la impresion (codigo '+$process.ExitCode+'). Revisa el controlador y el papel.' }
 } catch { $receipt.status='unknown';$receipt.error='No se pudo confirmar el envio a Windows. Revisa la impresora antes de reimprimir.' }
 finally { if (Test-Path -LiteralPath $pdf) { Remove-Item -LiteralPath $pdf -ErrorAction SilentlyContinue } }
 Save-Receipt $file $receipt
 return $receipt
}
try {
 $listener.Start()
 $requests=0
 while ($true) {
  $client=$listener.AcceptTcpClient()
  try {
   $client.ReceiveTimeout=5000;$client.SendTimeout=5000;$stream=$client.GetStream()
   $head=New-Object 'Collections.Generic.List[byte]'
   while ($head.Count -lt 8192) {
    $b=$stream.ReadByte();if($b -lt 0){throw 'Solicitud incompleta.'};$head.Add([byte]$b)
    $n=$head.Count
    if($n -ge 4 -and $head[$n-4] -eq 13 -and $head[$n-3] -eq 10 -and $head[$n-2] -eq 13 -and $head[$n-1] -eq 10){break}
   }
   if($head.Count -ge 8192){throw 'Cabecera demasiado grande.'}
   $lines=[Text.Encoding]::ASCII.GetString($head.ToArray()) -split "`r`n"
   $parts=$lines[0].Split(' ');$method=$parts[0];$route=$parts[1];$headers=@{}
   foreach($line in $lines | Select-Object -Skip 1){$colon=$line.IndexOf(':');if($colon -gt 0){$headers[$line.Substring(0,$colon).ToLowerInvariant()]=$line.Substring($colon+1).Trim()}}
   $origin=$headers['origin']
   $allowed=$origin -eq 'https://devnnex.github.io' -or $origin -match '^http://127\.0\.0\.1:(4173|5500)$'
   $code=200;$result=$null
   if(!$allowed){$code=403;$result=@{error='Origen no autorizado.'}}
   elseif($method -eq 'OPTIONS'){$result=@{ok=$true}}
   elseif($headers['x-don-pieros-print'] -ne '1'){$code=403;$result=@{error='Cabecera requerida.'}}
   elseif($method -eq 'GET' -and $route -eq '/status'){
    $result=@{id=$settings.id;secret=$settings.secret;label=$settings.label;printer=$settings.printer;ready=(Printer-Ready)}
   }elseif($method -eq 'POST' -and $route -eq '/print'){
    $length=0
    if(![int]::TryParse($headers['content-length'],[ref]$length) -or $length -lt 1 -or $length -gt 8390000){throw 'Tamano no permitido.'}
    $body=New-Object byte[] $length;$offset=0
    while($offset -lt $length){$read=$stream.Read($body,$offset,$length-$offset);if(!$read){throw 'Solicitud incompleta.'};$offset+=$read}
    $job=$utf8.GetString($body) | ConvertFrom-Json
    $result=Print-Job $job
   }else{$code=404;$result=@{error='Ruta no disponible.'}}
   $payload=$utf8.GetBytes(($result | ConvertTo-Json -Depth 6 -Compress))
   $cors=''
   if($allowed){$cors="Access-Control-Allow-Origin: $origin`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type, X-Don-Pieros-Print`r`nAccess-Control-Allow-Private-Network: true`r`n"}
   $response=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $code OK`r`n${cors}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($payload.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
   $stream.Write($response,0,$response.Length);$stream.Write($payload,0,$payload.Length);$stream.Flush()
   $requests++
   if($requests % 100 -eq 0){
    # Individual ledger files only, within the resolved application directory.
    Get-ChildItem -LiteralPath $ledger -File | Where-Object {$_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-8)} | Select-Object -First 100 | ForEach-Object {
     if($_.FullName.StartsWith($ledger+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $_.FullName -ErrorAction SilentlyContinue}
    }
   }
  }catch{# Drop malformed requests; never evaluate caller-supplied commands.
   Write-Warning ('Receptor: '+$_.Exception.GetType().Name+' en linea '+$_.InvocationInfo.ScriptLineNumber)
  }finally{$client.Close()}
 }
}finally{$listener.Stop();$mutex.ReleaseMutex();$mutex.Dispose()}
