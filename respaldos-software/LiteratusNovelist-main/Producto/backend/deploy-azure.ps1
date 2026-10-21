# Publica el backend en Azure Container Apps (guía: ..\DEPLOY-AZURE.md).
#
# Uso, desde esta carpeta:
#   .\deploy-azure.ps1            publica la imagen del último commit que cambió el backend
#   .\deploy-azure.ps1 -Preview   muestra la configuración (sin claves) y no publica nada
#
# La imagen la construye GitHub (.github/workflows/backend-image.yml) en cada push a main que
# toca el backend. La primera vez crea el entorno y la aplicación; después solo los actualiza.
# Tamaño pensado para el crédito de Azure for Students: 0,25 vCPU y 0,5 GiB, una sola réplica
# siempre encendida (nunca se duerme y nunca hay dos cobrando a la vez).
param(
    [string]$Tag,
    [switch]$Preview
)

$ResourceGroup = 'Literatus'
$Location = 'westus'          # Azure for Students solo deja usar algunas regiones; westus es una
$Environment = 'literatus-env'
$App = 'literatus-backend'

Set-Location $PSScriptRoot

function Invoke-Az {
    az @args
    if ($LASTEXITCODE -ne 0) { throw "Falló: az $($args -join ' ')" }
}

function Test-Az {
    az @args --only-show-errors -o none 2>$null
    return $LASTEXITCODE -eq 0
}

function ConvertTo-YamlText([string]$text) {
    "'" + $text.Replace("'", "''") + "'"
}

function ConvertTo-SecretName([string]$key) {
    $key.ToLower().Replace('_', '-')
}

# --- Imagen: la del último commit del backend, que GitHub ya debe haber construido ---
if (-not $Tag) {
    $Tag = git log -1 --format=%H -- . ':/.github/workflows/backend-image.yml'
    git fetch origin main --quiet
    git merge-base --is-ancestor $Tag origin/main
    if ($LASTEXITCODE -ne 0) {
        throw "El commit $Tag no está en GitHub. Haz push y espera que termine 'Imagen del backend' en la pestaña Actions."
    }
}
$Image = "ghcr.io/cxris2145/literatus-backend:$Tag"

# --- Variables de azure.env (CLAVE=valor): todas viajan como secretos de la aplicación ---
if (-not (Test-Path azure.env)) {
    throw 'Falta azure.env: copia azure.env.example con ese nombre y complétalo.'
}
$variables = [ordered]@{}
foreach ($line in Get-Content azure.env -Encoding UTF8) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $key, $value = $line -split '=', 2
    $value = "$value".Trim()
    if ($value) { $variables[$key.Trim()] = $value }
}
foreach ($required in 'SECRET_KEY', 'DATABASE_URL', 'ALLOWED_HOSTS', 'CORS_ALLOWED_ORIGINS') {
    if (-not $variables.Contains($required)) { throw "Falta $required en azure.env." }
}

function New-AppYaml([string]$environmentId, [switch]$HideSecrets) {
    $secrets = foreach ($key in $variables.Keys) {
        $value = if ($HideSecrets) { '***' } else { $variables[$key] }
        "      - name: $(ConvertTo-SecretName $key)`n        value: $(ConvertTo-YamlText $value)"
    }
    $envLines = foreach ($key in $variables.Keys) {
        "          - name: $key`n            secretRef: $(ConvertTo-SecretName $key)"
    }
    @"
location: $Location
properties:
  managedEnvironmentId: $environmentId
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 8080
      transport: auto
      allowInsecure: false
    secrets:
$($secrets -join "`n")
  template:
    containers:
      - name: backend
        image: $Image
        resources:
          cpu: 0.25
          memory: 0.5Gi
        env:
$($envLines -join "`n")
    scale:
      minReplicas: 1
      maxReplicas: 1
"@
}

if ($Preview) {
    New-AppYaml '<id del entorno>' -HideSecrets
    return
}

# --- Azure: lo que falte se crea una sola vez ---
Invoke-Az extension add --name containerapp --upgrade --only-show-errors
Invoke-Az provider register --namespace Microsoft.App --wait
if (-not (Test-Az group show --name $ResourceGroup)) {
    Invoke-Az group create --name $ResourceGroup --location $Location -o none
}
if (-not (Test-Az containerapp env show --name $Environment --resource-group $ResourceGroup)) {
    Write-Host 'Creando el entorno de Container Apps (la primera vez tarda unos minutos)...'
    Invoke-Az containerapp env create --name $Environment --resource-group $ResourceGroup `
        --location $Location --logs-destination none -o none
}
$environmentId = Invoke-Az containerapp env show --name $Environment --resource-group $ResourceGroup --query id -o tsv

# El YAML lleva las claves: va a un archivo temporal que se borra al terminar.
$file = Join-Path $env:TEMP 'literatus-backend.yaml'
[System.IO.File]::WriteAllText($file, (New-AppYaml $environmentId), (New-Object System.Text.UTF8Encoding $false))
try {
    if (Test-Az containerapp show --name $App --resource-group $ResourceGroup) {
        Write-Host "Actualizando $App con $Image..."
        Invoke-Az containerapp update --name $App --resource-group $ResourceGroup --yaml $file -o none
    } else {
        Write-Host "Creando $App con $Image..."
        Invoke-Az containerapp create --name $App --resource-group $ResourceGroup --yaml $file -o none
    }
} finally {
    Remove-Item $file -ErrorAction SilentlyContinue
}

$fqdn = Invoke-Az containerapp show --name $App --resource-group $ResourceGroup `
    --query properties.configuration.ingress.fqdn -o tsv
Write-Host ''
Write-Host "Listo. Pruébalo en: https://$fqdn/api/health/"
