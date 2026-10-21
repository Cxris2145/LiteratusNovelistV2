# Backend en Azure Container Apps (con Azure for Students)

> El frontend sigue en Vercel y la base sigue en Supabase. Solo cambia **dónde corre Django**.
>
> Orden: **1) Revisar el crédito → 2) Imagen en GitHub → 3) Azure CLI → 4) Variables → 5) Publicar → 6) Conectar Vercel → 7) Apagar Render.**

## Por qué

El plan gratis de Render apaga el backend tras 15 min sin visitas, y el 21-10-2026 tardó **más de 3 minutos** en despertar. En Azure el backend queda **siempre encendido**:

- **Sin tarjeta:** lo paga el crédito de Azure for Students (US$100 al año, renovable mientras seas estudiante).
- **Nunca cobra:** si el crédito se acaba, Azure deshabilita la suscripción en vez de cobrar.
- **Costo estimado:** unos US$4-5 al mes del crédito (0,25 vCPU y 0,5 GiB encendidos todo el mes, descontando lo que Container Apps regala cada mes). Es una estimación con los precios publicados; revisa el gasto real en el portal (ver "Mantenimiento").
- **Ojo:** es la misma suscripción del recurso de voz `literatus-voz`. Si el crédito se acabara, se apagarían el backend y la voz juntos.

Cómo se arma:

| Pieza | Dónde | Costo |
|---|---|---|
| Imagen del backend (`Dockerfile`) | GitHub la construye en cada push a `main` que toca el backend (`.github/workflows/backend-image.yml`) y la guarda en `ghcr.io/cxris2145/literatus-backend` | gratis (repositorio público) |
| Aplicación `literatus-backend` | Azure Container Apps, región `westus`, grupo `Literatus` | crédito de estudiante |
| Publicar | `backend/deploy-azure.ps1` | — |

---

## PARTE 1 — Revisar el crédito (2 min)

Entra a https://portal.azure.com con la cuenta de Azure for Students (la misma de la voz) → busca **"Suscripciones"** → abre **Azure for Students** y confirma que esté **activa** y cuánto crédito queda.

---

## PARTE 2 — La imagen en GitHub (una vez; después es automático)

1. Haz commit y push a `main` de estos cambios (Claude Code lo hace si se lo pides). Como siempre, ese push también vuelve a publicar Render y Vercel.
2. En GitHub → el repositorio → pestaña **Actions** → **Imagen del backend**: espera el ✓ verde (~5 min la primera vez).
3. **Haz pública la imagen** (una sola vez): GitHub → tu perfil → **Packages** → `literatus-backend` → **Package settings** → *Danger Zone* → **Change visibility → Public**. El repositorio ya es público y la imagen no lleva claves (`.env` y `azure.env` quedan fuera, ver `.dockerignore`).

---

## PARTE 3 — Azure CLI (una vez, ~5 min)

1. Instálala desde https://learn.microsoft.com/cli/azure/install-azure-cli-windows (instalador MSI), o en PowerShell:

   ```powershell
   winget install --exact --id Microsoft.AzureCLI
   ```

2. Abre una **PowerShell nueva** e inicia sesión (se abre el navegador; usa la cuenta de Azure for Students):

   ```powershell
   az login
   ```

3. Comprueba que quedó elegida la suscripción de estudiante:

   ```powershell
   az account show --query name -o tsv
   ```

   Debe decir **Azure for Students**. Si dice otra: `az account set --subscription "Azure for Students"`.

---

## PARTE 4 — Variables del backend (~5 min)

En la carpeta `Producto/backend`:

```powershell
Copy-Item azure.env.example azure.env
```

Abre `azure.env` y pega los **mismos valores que tienes en Render** (Render → tu servicio → **Environment**). El archivo explica cada uno. `azure.env` está en `.gitignore`: **nunca lo subas a GitHub** (tiene claves).

Para revisar lo que se va a publicar, sin mostrar las claves:

```powershell
.\deploy-azure.ps1 -Preview
```

---

## PARTE 5 — Publicar (~5-10 min la primera vez)

```powershell
cd Producto/backend
.\deploy-azure.ps1
```

- La primera vez crea el entorno `literatus-env` y la aplicación `literatus-backend`. Las siguientes solo los actualiza.
- Publica la imagen del **último commit que cambió el backend**. Si ese commit no está en GitHub, el script avisa: haz push y espera el ✓ de Actions.
- Al final muestra la dirección: `https://literatus-backend.XXXX.westus.azurecontainerapps.io/api/health/` → debe responder `{"status": "ok", ...}`. Prueba también `/api/v1/catalog/books/`.

Después, en `azure.env` pon `WEBPAY_RETURN_URL=https://TU-URL/api/v1/finance/confirm/` y ejecuta `.\deploy-azure.ps1` otra vez.

**Si PowerShell no deja ejecutar el script** ("la ejecución de scripts está deshabilitada"), ejecútalo así (solo afecta a esa ejecución):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-azure.ps1
```

---

## PARTE 6 — Conectar el frontend de Vercel

Con la URL de Azure hay que cambiar tres archivos del frontend (Claude Code lo hace si le pasas la URL):

| Archivo | Qué cambia |
|---|---|
| `frontend/src/environments/environment.prod.ts` | `apiUrl: 'https://TU-URL/api/v1/'` |
| `frontend/vercel.json` | el destino de `/api/public-home` → `https://TU-URL/api/v1/catalog/home/` |
| `frontend/scripts/build-home-snapshot.mjs` | `DEFAULT_API_URL` → `https://TU-URL/api/v1/` |

Commit + push → Vercel vuelve a publicar solo. Abre el sitio, inicia sesión y abre un libro.

---

## PARTE 7 — Apagar Render

Cuando todo funcione un par de días: Render → tu servicio → **Settings → Suspend Web Service**. No lo borres hasta estar seguro. Si configuraste un ping en cron-job.org, desactívalo.

**Migraciones:** Render ejecutaba `migrate` en cada despliegue; Azure no. Cuando haya migraciones nuevas, ejecútalas desde tu PC (tu `.env` local ya apunta a Supabase):

```powershell
cd Producto/backend
.venv\Scripts\python.exe manage.py migrate
```

---

## Actualizar el backend más adelante

1. Push a `main` con los cambios del backend.
2. Espera el ✓ de **Imagen del backend** en Actions.
3. `.\deploy-azure.ps1`

## Cómo está configurado y por qué

- **Siempre encendido** (1 réplica mínima y máxima): nunca hay espera al entrar, y nunca hay dos réplicas gastando crédito a la vez.
- **0,25 vCPU y 0,5 GiB:** más CPU que el plan gratis de Render y la misma memoria. Si en los registros aparece `OOMKilled` (se quedó sin memoria), cambia en `deploy-azure.ps1` a `cpu: 0.5` y `memory: 1Gi` (el costo se duplica, ~US$9-10 al mes).
- **Narraciones y resúmenes:** se generan en hilos de fondo, igual que en Render; Azure no congela la CPU entre peticiones.
- **Sin Log Analytics:** los registros no se guardan (no gastan crédito), pero se pueden ver en vivo.
- **Disco temporal:** lo escrito en disco se pierde al reiniciar. Las narraciones se guardan en Supabase si `SUPABASE_KEY` está puesta.
- **Imagen liviana:** `requirements.txt` ya no trae faster-whisper, onnxruntime ni ctranslate2 (solo los usan los scripts de Colab; están en `requirements-scripts.txt`).

## Mantenimiento

- **Registros en vivo:**

  ```powershell
  az containerapp logs show --name literatus-backend --resource-group Literatus --follow
  ```

- **Gasto real:** portal → **Cost Management** → *Análisis de costos* de la suscripción Azure for Students.
- **Crédito:** portal → **Suscripciones** → Azure for Students. Se renueva cada año mientras sigas siendo estudiante.

Referencias: [Azure for Students](https://azure.microsoft.com/en-us/free/students), [precios de Container Apps](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [facturación de Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/billing), [suscripción de estudiante deshabilitada](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled).
