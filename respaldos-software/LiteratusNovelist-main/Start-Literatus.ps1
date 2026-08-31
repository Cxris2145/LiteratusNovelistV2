[CmdletBinding()]
param(
    [string]$HostAddress = "127.0.0.1",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 4200,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"

$backendDirectory = Join-Path $PSScriptRoot "Producto\backend"
$frontendDirectory = Join-Path $PSScriptRoot "Producto\frontend"
$logDirectory = Join-Path $PSScriptRoot ".codex-run-logs"
$backendUrl = "http://${HostAddress}:${BackendPort}"
$frontendUrl = "http://${HostAddress}:${FrontendPort}"

function Test-ListeningPort {
    param([int]$Port)

    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $response.StatusCode
            }
        }
        catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)

    throw "No hubo respuesta de $Url despues de $TimeoutSeconds segundos."
}

if (-not (Test-Path -LiteralPath (Join-Path $backendDirectory "manage.py"))) {
    throw "No se encontro el backend en $backendDirectory."
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory "package.json"))) {
    throw "No se encontro el frontend en $frontendDirectory."
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$startedBackend = $false
$startedFrontend = $false
$backendProcess = $null
$frontendProcess = $null

if (-not (Test-ListeningPort -Port $BackendPort)) {
    $pythonCandidates = @(
        (Join-Path $backendDirectory ".venv\Scripts\python.exe"),
        (Join-Path $backendDirectory ".venv312\Scripts\python.exe")
    )
    $python = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $python) {
        throw "No se encontro Python en .venv ni en .venv312."
    }

    & $python (Join-Path $backendDirectory "manage.py") check
    if ($LASTEXITCODE -ne 0) {
        throw "Django no supero manage.py check."
    }

    $backendOutput = Join-Path $logDirectory "backend-$timestamp.out.log"
    $backendError = Join-Path $logDirectory "backend-$timestamp.err.log"
    $backendProcess = Start-Process `
        -FilePath $python `
        -ArgumentList @("manage.py", "runserver", "${HostAddress}:${BackendPort}", "--noreload") `
        -WorkingDirectory $backendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $backendOutput `
        -RedirectStandardError $backendError `
        -PassThru
    $startedBackend = $true
}

if (-not (Test-ListeningPort -Port $FrontendPort)) {
    if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory "node_modules"))) {
        throw "Falta Producto\frontend\node_modules. Ejecuta npm install antes de iniciar."
    }

    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $frontendOutput = Join-Path $logDirectory "frontend-$timestamp.out.log"
    $frontendError = Join-Path $logDirectory "frontend-$timestamp.err.log"
    $frontendProcess = Start-Process `
        -FilePath $npm `
        -ArgumentList @("start", "--", "--host", $HostAddress, "--port", $FrontendPort) `
        -WorkingDirectory $frontendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $frontendOutput `
        -RedirectStandardError $frontendError `
        -PassThru
    $startedFrontend = $true
}

$backendStatus = Wait-ForUrl -Url "$backendUrl/api/health/"
$frontendStatus = Wait-ForUrl -Url "$frontendUrl/"
$catalog = Invoke-RestMethod -Uri "$backendUrl/api/v1/catalog/books/" -TimeoutSec 20
$catalogCount = if ($null -ne $catalog.count) { $catalog.count } else { $catalog.Count }

if ($OpenBrowser) {
    Start-Process $frontendUrl
}

[PSCustomObject]@{
    Status           = "RUNNING"
    Frontend         = $frontendUrl
    FrontendHttp     = $frontendStatus
    BackendApi       = "$backendUrl/api/v1/"
    BackendHealth    = $backendStatus
    CatalogBooks     = $catalogCount
    BackendStarted   = $startedBackend
    FrontendStarted  = $startedFrontend
    BackendProcessId = $backendProcess.Id
    FrontendProcessId = $frontendProcess.Id
    Logs             = $logDirectory
} | Format-List
