[CmdletBinding()]
param(
    [string]$HostAddress = "127.0.0.1",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 4200,
    [switch]$OpenBrowser
)

$launcher = Join-Path $PSScriptRoot "respaldos-software\LiteratusNovelist-main\Start-Literatus.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "No se encontro el lanzador de Literatus en $launcher."
}

& $launcher @PSBoundParameters
exit $LASTEXITCODE
