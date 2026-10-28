$ErrorActionPreference = 'Stop'
$previewRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,5500)
$mime = @{ '.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.webmanifest'='application/manifest+json';'.svg'='image/svg+xml';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';'.mp3'='audio/mpeg';'.wav'='audio/wav';'.ico'='image/x-icon';'.woff2'='font/woff2' }
$listener.Start()
Write-Output 'Carta: http://127.0.0.1:5500/index.html'
Write-Output 'Admin: http://127.0.0.1:5500/admin.html'
Write-Output 'Mantén esta ventana abierta. Pulsa Ctrl+C para cerrar la vista previa.'
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout=2000
      $stream=$client.GetStream()
      $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,1024,$true)
      $line=$reader.ReadLine()
      if (-not $line) { continue }
      $parts=$line.Split(' ')
      while ($reader.ReadLine()) {}
      $route=[Uri]::UnescapeDataString(($parts[1] -split '\?')[0])
      if ($route -eq '/') { $route='/index.html' }
      $file=[IO.Path]::GetFullPath((Join-Path $previewRoot $route.TrimStart('/').Replace('/',[IO.Path]::DirectorySeparatorChar)))
      $extension=[IO.Path]::GetExtension($file).ToLowerInvariant()
      if (-not $file.StartsWith($previewRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $route -match '^/(appscript|supabase|tools|tests|node_modules|\.git)/' -or -not $mime.ContainsKey($extension)) {
        $status='403 Forbidden';$content=[Text.Encoding]::UTF8.GetBytes('Acceso no permitido');$type='text/plain'
      } elseif (-not [IO.File]::Exists($file)) {
        $status='404 Not Found';$content=[Text.Encoding]::UTF8.GetBytes('No encontrado');$type='text/plain'
      } else {
        $status='200 OK';$content=[IO.File]::ReadAllBytes($file);$type=$mime[$extension]
      }
      $header=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($content.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
      $stream.Write($header,0,$header.Length)
      if ($parts[0] -ne 'HEAD') { $stream.Write($content,0,$content.Length) }
      $stream.Flush()
    } catch { } finally { $client.Close() }
  }
} finally { $listener.Stop() }
