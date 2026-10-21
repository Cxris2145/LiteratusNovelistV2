# Backend en una máquina virtual de Azure for Students

> El frontend sigue en Vercel y la base sigue en Supabase. Solo cambia **dónde corre Django**.
>
> Orden: **1) Revisar la suscripción → 2) Imagen en GitHub → 3) Azure CLI → 4) Variables → 5) Publicar → 6) Conectar Vercel → 7) Apagar Render.**

## Por qué

El plan gratis de Render apaga el backend tras 15 min sin visitas, y el 21-10-2026 tardó **más de 3 minutos** en despertar. En la máquina virtual el backend queda **siempre encendido**:

- **Gratis por 12 meses:** Azure for Students regala 750 horas al mes de la máquina `Standard_B2pts_v2` (2 vCPU Arm64, 1 GB) y dos discos Premium de 64 GB. Un mes completo son ~744 horas.
- **Sin tarjeta:** lo que no cubra el regalo (por ejemplo, la IP pública si Azure la cobra aparte) se descuenta del crédito de US$100 al año. Si el crédito se acaba, Azure deshabilita la suscripción en vez de cobrar.
- **Ojo:** es la misma suscripción del recurso de voz `literatus-voz`. Si el crédito se acabara, se apagarían el backend y la voz juntos. Pasados los 12 meses la máquina deja de ser gratis (unos US$6-7 al mes del crédito, si renuevas Azure for Students).

**Por qué una máquina y no Azure Container Apps:** Azure ahora crea los entornos de Container Apps en modo *Express*. Ahí cada petición tardaba medio segundo más, no se podía nombrar cada versión publicada y las actualizaciones no llegaban al contenedor.

Cómo se arma:

| Pieza | Dónde |
|---|---|
| Imagen del backend (`backend/Dockerfile`) | GitHub la construye para amd64 y arm64 en cada push a `main` que toca el backend (`.github/workflows/backend-image.yml`) y la guarda en `ghcr.io/cxris2145/literatus-backend` (pública, gratis) |
| Máquina `literatus-vm` | Ubuntu 24.04 Arm64 en `westus`, grupo `Literatus`, con Docker |
| Backend | contenedor `backend` (gunicorn en el puerto 8080, solo dentro de la máquina) |
| HTTPS | contenedor `caddy`: certificado de Let's Encrypt automático para `literatus-novelist.westus.cloudapp.azure.com` |
| Publicar | `backend/deploy-azure.ps1` |

---

## PARTE 1 — Revisar la suscripción (2 min)

Entra a https://portal.azure.com con la cuenta de Azure for Students (la misma de la voz) → **Suscripciones** → **Azure for Students**: debe estar **activa**. El crédito restante aparece buscando **Educación** en la barra superior.

---

## PARTE 2 — La imagen en GitHub (automático)

Cada push a `main` que cambia algo en `Producto/backend` construye la imagen. En GitHub → **Actions** → **Imagen del backend** espera el ✓ verde (la versión Arm64 se construye emulada: ~10 min).

---

## PARTE 3 — Azure CLI (una vez, ~5 min)

1. Instálala desde https://learn.microsoft.com/cli/azure/install-azure-cli-windows, o en PowerShell:

   ```powershell
   winget install --exact --id Microsoft.AzureCLI
   ```

2. Abre una **PowerShell nueva** e inicia sesión con la cuenta de Azure for Students:

   ```powershell
   az login
   ```

3. Comprueba la suscripción: `az account show --query name -o tsv` debe decir **Azure for Students**.

---

## PARTE 4 — Variables del backend (~5 min)

En la carpeta `Producto/backend`:

```powershell
Copy-Item azure.env.example azure.env
```

Abre `azure.env` y pega los **mismos valores que tienes en Render** (Render → tu servicio → **Environment**). `azure.env` está en `.gitignore`: **nunca lo subas a GitHub**.

Para revisar lo que se ejecutará en la máquina, sin mostrar las claves:

```powershell
.\deploy-azure.ps1 -Preview
```

---

## PARTE 5 — Publicar

```powershell
cd Producto/backend
.\deploy-azure.ps1
```

- La primera vez crea la máquina (~5 min) y espera a que instale Docker.
- Publica la imagen del **último commit que cambió el backend**. Si ese commit no está en GitHub, el script avisa: haz push y espera el ✓ de Actions.
- Al final muestra los contenedores corriendo y la dirección: `https://literatus-novelist.westus.cloudapp.azure.com/api/health/` → debe responder `{"status": "ok", ...}`. La primera vez Caddy tarda unos segundos en obtener el certificado.

**Si PowerShell no deja ejecutar el script** ("la ejecución de scripts está deshabilitada"):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-azure.ps1
```

---

## PARTE 6 — Conectar el frontend de Vercel

| Archivo | Qué cambia |
|---|---|
| `frontend/src/environments/environment.prod.ts` | `apiUrl: 'https://literatus-novelist.westus.cloudapp.azure.com/api/v1/'` |
| `frontend/vercel.json` | el destino de `/api/public-home` → `https://literatus-novelist.westus.cloudapp.azure.com/api/v1/catalog/home/` |
| `frontend/scripts/build-home-snapshot.mjs` | `DEFAULT_API_URL` → `https://literatus-novelist.westus.cloudapp.azure.com/api/v1/` |

Commit + push → Vercel vuelve a publicar solo. Abre el sitio, inicia sesión y abre un libro.

---

## PARTE 7 — Apagar Render

Cuando todo funcione un par de días: Render → tu servicio → **Settings → Suspend Web Service**. No lo borres hasta estar seguro. Si configuraste un ping en cron-job.org, desactívalo.

**Migraciones:** Render ejecutaba `migrate` en cada despliegue; la máquina no. Cuando haya migraciones nuevas, ejecútalas desde tu PC (tu `.env` local ya apunta a Supabase):

```powershell
cd Producto/backend
.venv\Scripts\python.exe manage.py migrate
```

---

## Actualizar el backend más adelante

1. Push a `main` con los cambios del backend.
2. Espera el ✓ de **Imagen del backend** en Actions.
3. `.\deploy-azure.ps1` (o, si solo cambiaste `azure.env`, también basta con esto).

## Cómo está configurado y por qué

- **Siempre encendida:** responde directo, sin arranques en frío. La máquina es *burstable*: acumula créditos de CPU mientras está tranquila y los usa en los picos.
- **Sin SSH abierto:** el puerto 22 está cerrado. Se administra con `az vm run-command` (lo usa el script). Solo están abiertos el 80 y el 443.
- **Actualizaciones de seguridad:** Ubuntu las instala solo (`unattended-upgrades`). Docker reinicia los contenedores si la máquina se reinicia.
- **Memoria:** 1 GB más 1 GB de swap. El backend usa ~250 MB.
- **Narraciones y resúmenes:** se generan en hilos de fondo, igual que en Render.
- **Disco:** lo que el backend escribe dentro del contenedor se pierde al publicar de nuevo. Las narraciones se guardan en Supabase si `SUPABASE_KEY` está puesta.

## Mantenimiento

- **Registros del backend:**

  ```powershell
  az vm run-command invoke -g Literatus -n literatus-vm --command-id RunShellScript --scripts "docker logs --tail 100 backend" --query "value[0].message" -o tsv
  ```

- **Reiniciar el backend:** vuelve a ejecutar `.\deploy-azure.ps1`.
- **Gasto real:** portal → **Cost Management** → *Análisis de costos* de la suscripción, y en la portada de la suscripción, **Principales servicios gratuitos por uso**.
- **Apagar todo** (deja de gastar al instante): `az vm deallocate -g Literatus -n literatus-vm`. Para volver: `az vm start -g Literatus -n literatus-vm`.

Referencias: [Azure for Students](https://azure.microsoft.com/en-us/free/students), [servicios gratuitos de Azure](https://azure.microsoft.com/en-us/free/), [suscripción de estudiante deshabilitada](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled).
