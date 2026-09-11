# Sella index.html con la fecha y hora de la publicacion.
#
# POR QUE: GitHub Pages manda los archivos con cache de 10 minutos, y el
# navegador que ya tiene la pagina abierta puede quedarse con el JS viejo
# mucho mas tiempo. Si el <script> trae ?v=<sello>, al cambiar el sello la
# direccion cambia y el navegador esta obligado a bajar la version nueva.
#
# USO: correr esto ANTES de cada commit que toque assets/.
#   powershell -NoProfile -ExecutionPolicy Bypass -File herramientas\sellar-version.ps1

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$indice = Join-Path $raiz 'index.html'
$sello = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm')

$texto = [System.IO.File]::ReadAllText($indice)

# assets/...js  o  assets/...css, con o sin ?v= previo.
$patron = '(href|src)="(assets/[^"?]+\.(?:js|css))(\?v=[^"]*)?"'
$nuevo = [System.Text.RegularExpressions.Regex]::Replace(
  $texto, $patron, { param($m) '{0}="{1}?v={2}"' -f $m.Groups[1].Value, $m.Groups[2].Value, $sello })

if ($nuevo -eq $texto) {
  Write-Output "Sin cambios (ya tenia el sello $sello)."
  exit 0
}

# UTF-8 SIN BOM: el archivo original no lo trae y agregarlo ensucia el diff.
$sinBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indice, $nuevo, $sinBom)

$cuantos = ([regex]::Matches($nuevo, [regex]::Escape("?v=$sello"))).Count
Write-Output "Sello $sello aplicado a $cuantos archivos de index.html"
