# Servidor local para probar la app de Fichas de Embalaje.
# No requiere instalar nada: usa el HttpListener que ya trae Windows.
# Uso normal: doble clic en "abrir-app.bat".
# Uso manual:  powershell -ExecutionPolicy Bypass -File servidor.ps1 [-Port 8123]

param([int]$Port = 8123)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  No se pudo abrir el puerto $Port." -ForegroundColor Red
  Write-Host "  Probablemente ya hay un servidor corriendo ahi." -ForegroundColor Red
  Write-Host "  Abre http://localhost:$Port/ o cierra la otra ventana e intenta de nuevo." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Enter para cerrar"
  exit 1
}

Write-Host ""
Write-Host "  Fichas de Embalaje - Arqueta Folding" -ForegroundColor Cyan
Write-Host "  ------------------------------------"
Write-Host "  Abre:  http://localhost:$Port/" -ForegroundColor Green
Write-Host "  Carpeta: $Root"
Write-Host ""
Write-Host "  Deja esta ventana abierta mientras uses la app."
Write-Host "  Para detenerlo: cierra esta ventana o presiona Ctrl+C."
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json"
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"; ".gif" = "image/gif"; ".pdf" = "application/pdf"
  ".ico" = "image/x-icon"; ".woff2" = "font/woff2"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }

    $full = Join-Path $Root ($path.TrimStart('/'))
    # No servir nada fuera de la carpeta del proyecto.
    $fullResolved = [System.IO.Path]::GetFullPath($full)
    $rootResolved = [System.IO.Path]::GetFullPath($Root)

    if (-not $fullResolved.StartsWith($rootResolved)) {
      $res.StatusCode = 403
    } elseif (Test-Path -LiteralPath $fullResolved -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($fullResolved).ToLower()
      $ct = $mime[$ext]
      if (-not $ct) { $ct = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
      $res.ContentType = $ct
      # Sin cache, para que siempre veas la ultima version.
      $res.Headers.Add("Cache-Control", "no-store")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("No encontrado: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
