# Builds the image for a linux/amd64 server and writes a single compressed
# archive you can scp across. Run from anywhere:
#
#   powershell -File scripts\build-and-export.ps1
#   powershell -File scripts\build-and-export.ps1 -Tag v1.1
#
param(
  [string]$Tag = 'latest',
  [string]$OutDir = 'dist'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$image = "clocktower:$Tag"
$outPath = Join-Path $root $OutDir
$tarPath = Join-Path $outPath "clocktower-$Tag.tar"

New-Item -ItemType Directory -Force -Path $outPath | Out-Null

Write-Host "Building $image for linux/amd64..." -ForegroundColor Cyan
docker build --platform linux/amd64 -t $image .
if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

Write-Host "Saving image..." -ForegroundColor Cyan
# -o rather than a pipe: PowerShell corrupts binary data sent through a pipeline.
# Not compressed afterwards: this daemon stores layers already compressed, so
# gzipping the export was measured to save about 1%.
docker save -o $tarPath $image
if ($LASTEXITCODE -ne 0) { throw 'docker save failed' }

$size = [math]::Round((Get-Item $tarPath).Length / 1MB, 1)
Write-Host ""
Write-Host "Done: $tarPath ($size MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Copy it over, then on the server:" -ForegroundColor Yellow
Write-Host "  docker load -i clocktower-$Tag.tar"
Write-Host "  docker compose up -d --no-build --force-recreate"
