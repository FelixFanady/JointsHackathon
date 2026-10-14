# Starts the face service on 127.0.0.1:8100 with the CV_API_KEY from frontend/.env.local
# (one key, shared by both sides). First run creates .venv, installs pinned deps, downloads models.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$envFile = Join-Path $here '..\frontend\.env.local'
$hit = Select-String -Path $envFile -Pattern '^CV_API_KEY=(.+)$' | Select-Object -First 1
if (-not $hit) { Write-Error 'CV_API_KEY is missing in frontend/.env.local'; exit 1 }
$env:CV_API_KEY = $hit.Matches[0].Groups[1].Value.Trim()

$py = Join-Path $here '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
  python -m venv (Join-Path $here '.venv')
  & $py -m pip install -r (Join-Path $here 'requirements.txt')
}
& $py (Join-Path $here 'download_models.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $py (Join-Path $here 'face_service.py')
