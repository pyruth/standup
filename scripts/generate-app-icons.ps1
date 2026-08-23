param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$masterPath = Join-Path $projectRoot 'build\mello-app-icon.png'
$sourceImage = [System.Drawing.Image]::FromFile($Source)
$bitmap = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$radius = 238.0
$diameter = $radius * 2
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $diameter, $diameter, 180, 90)
$path.AddArc(1024 - $diameter, 0, $diameter, $diameter, 270, 90)
$path.AddArc(1024 - $diameter, 1024 - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc(0, 1024 - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()
$graphics.SetClip($path)
$graphics.DrawImage($sourceImage, 0, 0, 1024, 1024)
$bitmap.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$path.Dispose()
$bitmap.Dispose()
$sourceImage.Dispose()

Push-Location $projectRoot
try {
  & npx tauri icon $masterPath --output 'src-tauri\icons'
  if ($LASTEXITCODE -ne 0) { throw 'Tauri icon generation failed' }
  Copy-Item -LiteralPath 'src-tauri\icons\128x128@2x.png' -Destination 'src\renderer\assets\app-icon.png' -Force
  Copy-Item -LiteralPath $masterPath -Destination 'build\icon.png' -Force
  Copy-Item -LiteralPath 'src-tauri\icons\icon.ico' -Destination 'build\icon.ico' -Force
} finally {
  Pop-Location
}
