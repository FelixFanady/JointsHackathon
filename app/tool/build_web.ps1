$ErrorActionPreference = "Stop"
$app = Split-Path -Parent $PSScriptRoot
$out = Join-Path (Split-Path -Parent $app) "frontend\public\app"
$flutter = if (Get-Command flutter -ErrorAction SilentlyContinue) { "flutter" } else { "D:\src\flutter\bin\flutter.bat" }

Push-Location $app
try {
  & $flutter pub get
  & $flutter build web --release --base-href /app/
  if ($LASTEXITCODE -ne 0) { throw "flutter build web gagal ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Copy-Item -Recurse (Join-Path $app "build\web") $out
Write-Host "Selesai: $out -> https://siagaku.felixfanady.com/app/"
