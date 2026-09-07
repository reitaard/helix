$ErrorActionPreference = "Stop"

$python = $env:HELIX_FACEFUSION_WORKER_PYTHON
if (-not $python) { $python = "C:\Users\MSP-PC\.conda\envs\helix-facefusion-worker\python.exe" }

$workerDir = $PSScriptRoot
$tokenFile = $env:HELIX_FACEFUSION_TOKEN_FILE
if (-not $tokenFile) { $tokenFile = "C:\ProgramData\Helix\facefusion-worker.token" }

if (-not (Test-Path $tokenFile)) {
    throw "FaceFusion worker token file is missing."
}

$env:HELIX_FACEFUSION_API_TOKEN = (Get-Content $tokenFile -Raw).Trim()
if (-not $env:HELIX_FACEFUSION_API_TOKEN) {
    throw "FaceFusion worker token file is empty."
}

Set-Location $workerDir

& $python -m uvicorn app:app `
    --host 100.110.21.79 `
    --port 8791
