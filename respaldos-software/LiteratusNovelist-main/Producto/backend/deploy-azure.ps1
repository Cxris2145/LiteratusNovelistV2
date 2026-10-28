# Publica el backend en una máquina virtual de Azure for Students (guía: ..\DEPLOY-AZURE.md).
#
# Uso, desde esta carpeta:
#   .\deploy-azure.ps1              publica la imagen del último commit que cambió el backend
#   .\deploy-azure.ps1 -Tag <sha>   publica esa versión y pausa las actualizaciones automáticas
#                                   (para volver atrás); sin -Tag se reanudan
#   .\deploy-azure.ps1 -Preview     muestra lo que se ejecutará en la máquina (sin claves) y no publica
#
# La imagen la construye GitHub (.github/workflows/backend-image.yml) en cada push a main que toca
# el backend. La primera vez crea la máquina: Standard_B2pts_v2 (Arm64), una de las que Azure for
# Students regala 750 horas al mes durante 12 meses. En cada publicación le envía las variables de
# azure.env, descarga la imagen y reinicia el backend. Caddy atiende HTTPS con un certificado de
# Let's Encrypt que se renueva solo.
#
# Además deja instalado update-backend.sh: cada 5 minutos la máquina revisa si GitHub publicó una
# imagen nueva (:latest) y se actualiza sola. Este script solo hace falta para cambiar azure.env,
# volver a una versión anterior o crear la máquina.
param(
    [string]$Tag,
    [switch]$Preview
)
$TagElegido = [bool]$Tag

$ResourceGroup = 'Literatus'
$Location = 'westus'          # Azure for Students solo deja usar algunas regiones; westus es una
$Vm = 'literatus-vm'
$Size = 'Standard_B2pts_v2'
$DnsLabel = 'literatus-novelist'
$Fqdn = "$DnsLabel.$Location.cloudapp.azure.com"

Set-Location $PSScriptRoot

function Invoke-Az {
    az @args
    if ($LASTEXITCODE -ne 0) { throw "Falló: az $($args -join ' ')" }
}

function Test-Az {
    az @args --only-show-errors -o none 2>$null
    return $LASTEXITCODE -eq 0
}

# Escribe texto con saltos de línea de Linux y sin BOM (bash y cloud-init no aceptan otra cosa).
function Write-LinuxFile([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))
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
$Repo = 'ghcr.io/cxris2145/literatus-backend'
$Image = "${Repo}:$Tag"

# --- Variables de azure.env (CLAVE=valor) ---
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
if ($variables['ALLOWED_HOSTS'] -notmatch [regex]::Escape($Fqdn)) {
    throw "ALLOWED_HOSTS en azure.env debe incluir $Fqdn."
}

# --- Actualización automática: la máquina revisa cada 5 minutos si hay una imagen nueva ---
# Lo corre systemd como root, con sh (dash): nada de extensiones de bash. Los mensajes van sin
# tildes: run-command devuelve la salida con los acentos cambiados por «�».
$updater = @'
#!/bin/sh
# Actualiza el backend de Literatus cuando GitHub publica una imagen nueva. Lo instala
# deploy-azure.ps1 y lo corre literatus-update.timer cada 5 minutos.
#   update-backend.sh                    imagen :latest; no hace nada si ya es la que corre
#   update-backend.sh <imagen> --forzar  publica esa imagen aunque ya corra (deploy-azure.ps1)
# Antes de cambiar corre las migraciones con la versión nueva: si fallan, sigue la actual.
# Si el backend nuevo no responde en 90 s, vuelve al anterior y no reintenta esa imagen.
# Pausar: touch /opt/literatus/pausa    Reanudar: rm /opt/literatus/pausa
# Registro: journalctl -u literatus-update
set -eu
cd /opt/literatus
IMAGEN=${1:-__REPO__:latest}
FORZAR=${2:-}
exec 9> .actualizando
flock -w 900 9

if [ -z "$FORZAR" ] && [ -e pausa ]; then exit 0; fi
docker pull --quiet "$IMAGEN" > /dev/null
NUEVA=$(docker image inspect -f '{{.Id}}' "$IMAGEN")
ACTUAL=$(docker inspect -f '{{.Image}}' backend 2> /dev/null || true)
if [ -z "$FORZAR" ]; then
    if [ "$NUEVA" = "$ACTUAL" ] || [ "$NUEVA" = "$(cat fallida 2> /dev/null || true)" ]; then exit 0; fi
fi

echo "Publicando $IMAGEN ($NUEVA)"
if ! docker run --rm --env-file backend.env "$NUEVA" python manage.py migrate --noinput; then
    echo "Fallaron las migraciones: sigue la version anterior."
    echo "$NUEVA" > fallida
    exit 1
fi

arrancar() {
    docker rm -f backend > /dev/null 2>&1 || true
    docker run -d --name backend --restart unless-stopped --network literatus --env-file backend.env "$1" > /dev/null
}
responde() {
    intentos=0
    until docker exec backend python -c "import urllib.request as u; u.urlopen(u.Request('http://127.0.0.1:8080/api/health/', headers={'Host': '__FQDN__'}), timeout=5)" > /dev/null 2>&1; do
        intentos=$((intentos + 1))
        if [ "$intentos" -ge 45 ]; then return 1; fi
        sleep 2
    done
}

arrancar "$NUEVA"
if responde; then
    rm -f fallida
    docker image prune -af > /dev/null
    echo "Listo: el backend nuevo responde."
    exit 0
fi
echo "El backend nuevo no respondio en 90 s:"
docker logs --tail 50 backend 2>&1 || true
echo "$NUEVA" > fallida
if [ -n "$ACTUAL" ]; then
    arrancar "$ACTUAL"
    echo "Se volvio a la version anterior."
fi
exit 1
'@
$updater = $updater.Replace('__REPO__', $Repo).Replace('__FQDN__', $Fqdn)

$updateService = @'
[Unit]
Description=Actualiza el backend de Literatus si GitHub publico una version nueva
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh /opt/literatus/update-backend.sh
'@

$updateTimer = @'
[Unit]
Description=Revisa cada 5 minutos si hay una version nueva del backend

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
'@

function ConvertTo-LinuxBase64([string]$text) {
    [Convert]::ToBase64String((New-Object System.Text.UTF8Encoding $false).GetBytes($text.Replace("`r`n", "`n")))
}

# --- Lo que se ejecuta en la máquina en cada publicación ---
function New-RemoteScript([switch]$HideSecrets) {
    $envFile = ($variables.Keys | ForEach-Object {
        $value = if ($HideSecrets) { '***' } else { $variables[$_] }
        "$_=$value"
    }) -join "`n"
    $envBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envFile + "`n"))
    $updaterBase64 = ConvertTo-LinuxBase64 $updater
    $serviceBase64 = ConvertTo-LinuxBase64 $updateService
    $timerBase64 = ConvertTo-LinuxBase64 $updateTimer
    if ($HideSecrets) {
        $envBase64 = "<azure.env sin claves:`n$envFile`n>"
        $updaterBase64 = '<update-backend.sh, abajo>'
        $serviceBase64 = '<literatus-update.service, abajo>'
        $timerBase64 = '<literatus-update.timer, abajo>'
    }
    # Publicar una versión elegida con -Tag pausa las actualizaciones automáticas: si no, en
    # 5 minutos la máquina volvería sola a la última.
    $pauseCommand = if ($TagElegido) { 'touch pausa' } else { 'rm -f pausa' }
    # run-command lo ejecuta con sh (dash), no con bash: nada de pipefail ni otras extensiones de bash.
    @"
set -eu
cloud-init status --wait > /dev/null || true
mkdir -p /opt/literatus
cd /opt/literatus
echo '$envBase64' | base64 -d > backend.env
chmod 600 backend.env
cat > Caddyfile <<'CADDY'
$Fqdn {
    encode gzip
    reverse_proxy backend:8080
}
CADDY
echo '$updaterBase64' | base64 -d > update-backend.sh
echo '$serviceBase64' | base64 -d > /etc/systemd/system/literatus-update.service
echo '$timerBase64' | base64 -d > /etc/systemd/system/literatus-update.timer
systemctl daemon-reload
systemctl enable --now literatus-update.timer > /dev/null
$pauseCommand
docker network inspect literatus > /dev/null 2>&1 || docker network create literatus > /dev/null
sh update-backend.sh $Image --forzar
if docker ps --format '{{.Names}}' | grep -qx caddy; then
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile
else
    docker rm -f caddy > /dev/null 2>&1 || true
    docker run -d --name caddy --restart unless-stopped --network literatus -p 80:80 -p 443:443 \
        -v /opt/literatus/Caddyfile:/etc/caddy/Caddyfile:ro -v caddy_data:/data -v caddy_config:/config caddy:2 > /dev/null
fi
docker ps --format '{{.Names}}: {{.Status}}'
if [ -e pausa ]; then echo 'Actualizaciones automaticas: en pausa'; else echo 'Actualizaciones automaticas: activas (cada 5 min)'; fi
echo PUBLICADO_OK
"@
}

if ($Preview) {
    New-RemoteScript -HideSecrets
    Write-Host "`n--- update-backend.sh ---`n$updater`n--- literatus-update.service ---`n$updateService`n--- literatus-update.timer ---`n$updateTimer"
    return
}

# --- La máquina: se crea una sola vez ---
# Docker y 1 GB de swap. Ubuntu instala solo las actualizaciones de seguridad (unattended-upgrades).
$cloudInit = @'
#cloud-config
package_update: true
packages:
  - docker.io
swap:
  filename: /swapfile
  size: 1073741824
runcmd:
  - systemctl enable --now docker
'@

Invoke-Az provider register --namespace Microsoft.Compute --wait
Invoke-Az provider register --namespace Microsoft.Network --wait
if (-not (Test-Az group show --name $ResourceGroup)) {
    Invoke-Az group create --name $ResourceGroup --location $Location -o none
}
if (-not (Test-Az vm show --resource-group $ResourceGroup --name $Vm)) {
    Write-Host "Creando la máquina $Vm ($Size, Arm64)..."
    $cloudInitFile = Join-Path $env:TEMP 'literatus-cloud-init.yaml'
    Write-LinuxFile $cloudInitFile $cloudInit
    try {
        # Disco Premium de 64 GB (P6): es el tamaño que cubre el regalo de Azure for Students.
        # Sin regla de SSH: la máquina se administra con "az vm run-command".
        Invoke-Az vm create --resource-group $ResourceGroup --name $Vm --location $Location `
            --image Canonical:ubuntu-24_04-lts:server-arm64:latest --size $Size `
            --admin-username literatus --generate-ssh-keys --security-type Standard `
            --storage-sku Premium_LRS --os-disk-size-gb 64 `
            --public-ip-sku Standard --public-ip-address-dns-name $DnsLabel `
            --nsg-rule NONE --custom-data $cloudInitFile -o none
    } finally {
        Remove-Item $cloudInitFile -ErrorAction SilentlyContinue
    }
    Invoke-Az vm open-port --resource-group $ResourceGroup --name $Vm --port 80,443 --priority 900 -o none
}

# --- Publicar: el script lleva las claves, así que va a un archivo temporal que se borra ---
Write-Host "Publicando $Image en $Vm..."
$scriptFile = Join-Path $env:TEMP 'literatus-deploy.sh'
Write-LinuxFile $scriptFile (New-RemoteScript)
try {
    # run-command responde "succeeded" aunque el script falle: se revisa la marca del final.
    $output = Invoke-Az vm run-command invoke --resource-group $ResourceGroup --name $Vm `
        --command-id RunShellScript --scripts "@$scriptFile" --query 'value[0].message' -o tsv
    $output | Where-Object { $_ -notmatch 'PUBLICADO_OK' } | Write-Host
    if (-not ($output -match 'PUBLICADO_OK')) { throw 'La publicación falló en la máquina (ver el mensaje de arriba).' }
} finally {
    Remove-Item $scriptFile -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "Listo. Pruébalo en: https://$Fqdn/api/health/"
Write-Host '(La primera vez Caddy tarda unos segundos en obtener el certificado HTTPS.)'
