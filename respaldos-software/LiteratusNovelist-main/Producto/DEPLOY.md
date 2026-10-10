# Desplegar Literatus Novelist en TUS cuentas (Render + Vercel)

> No se "mueven datos". El código está en Git y la base está en tu Supabase.
> Esto solo vuelve a **publicar** el código en cuentas nuevas.
>
> Orden obligatorio: **1) Backend en Render → 2) Frontend en Vercel → 3) Conectar los dos.**

---

## PARTE 1 — Backend en Render  (~10 min)

### 1.1 Reúne estos 4 valores antes de empezar

| Necesitas | Dónde sacarlo |
|---|---|
| `DATABASE_URL` | Supabase → tu proyecto → **Project Settings → Database → Connection string → URI**. Copia la que dice *Transaction pooler* (puerto 6543). Reemplaza `[YOUR-PASSWORD]` por la contraseña real de la base. |
| `SUPABASE_URL` | Supabase → **Project Settings → API → Project URL** (ej. `https://abcd1234.supabase.co`) |
| `GOOGLE_API_KEY` | https://aistudio.google.com/apikey → **Create API key** (gratis) |
| Tu usuario de GitHub | El repo tiene que estar en GitHub para que Render lo lea |

### 1.2 Crear el servicio

1. Entra a https://render.com → **Get Started** → entra con GitHub.
2. Autoriza a Render a ver tu repositorio.
3. Botón **New +** (arriba a la derecha) → **Blueprint**.
4. Elige tu repositorio `LiteratusNovelist`.
5. Render detecta el archivo `Producto/backend/render.yaml` y muestra el servicio `literatus-novelist-backend`.
   - Si dice que el **nombre está ocupado**: cámbialo (ej. `literatus-novelist-backend-cxris`). Anótalo, lo necesitas después.
6. Render te va a pedir los valores marcados. Pega:

   | Campo | Qué poner |
   |---|---|
   | `DATABASE_URL` | La URI del pooler de Supabase (paso 1.1) |
   | `SUPABASE_URL` | Tu Project URL de Supabase |
   | `ALLOWED_HOSTS` | `NOMBRE-DE-TU-SERVICIO.onrender.com` (sin `https://`) |
   | `CORS_ALLOWED_ORIGINS` | `https://literatus-novelist.vercel.app` *(provisional, lo corriges en la Parte 3)* |
   | `GOOGLE_API_KEY` | Tu clave de Google AI Studio |
   | `WEBPAY_RETURN_URL` | `https://NOMBRE-DE-TU-SERVICIO.onrender.com/api/v1/finance/confirm/` |
   | `FRONTEND_URL` | `https://literatus-novelist.vercel.app` *(provisional)* |
   | `EMAIL_HOST_PASSWORD` | Clave de Resend (solo en el panel de Render, nunca en Git) |
   | `DEFAULT_FROM_EMAIL` | `Literatus <no-reply@TU-DOMINIO-VERIFICADO>`; el dominio debe estar verificado en Resend |
   | El resto (`GOOGLE_API_KEY_2`, `DEEPSEEK_API_KEY`, `ELEVENLABS_API_KEY`, `KOKORO_API_URL`) | Déjalos vacíos, la app arranca igual |

7. **Apply** / **Create**. Render instala y despliega (5-10 min la primera vez).
8. Cuando termine, arriba verás la URL: `https://NOMBRE-DE-TU-SERVICIO.onrender.com`.
   - Pruébala: abre `https://NOMBRE-DE-TU-SERVICIO.onrender.com/api/health/` → debe responder algo (no un error 500).

> **Nota:** el plan gratis de Render "duerme" el backend tras 15 min sin uso. La primera visita después de dormir tarda ~40 s en despertar. Es normal.

---

## PARTE 2 — Frontend en Vercel  (~5 min)

### 2.1 Cambiar 1 línea en el código

Archivo: `Producto/frontend/src/environments/environment.prod.ts`

Cambia la línea de `apiUrl` para que apunte a **tu** backend de Render:

```ts
apiUrl: 'https://NOMBRE-DE-TU-SERVICIO.onrender.com/api/v1/',
```

(Deja `supabaseUrl` y `supabaseKey` como están: la clave `anon` es pública.)

Guarda, haz **commit** y **push** a GitHub.

### 2.2 Crear el proyecto en Vercel

1. Entra a https://vercel.com → **Sign Up** → entra con GitHub.
2. **Add New… → Project** → elige tu repo `LiteratusNovelist` → **Import**.
3. Configura:
   | Campo | Valor |
   |---|---|
   | **Root Directory** | `Producto/frontend` (botón *Edit* → seleccionar la carpeta) |
   | **Framework Preset** | Angular (lo detecta solo) |
   | **Build Command** | `npm run build` (por defecto) |
   | **Output Directory** | `dist/frontend/browser` |
   | **Environment Variables** | ninguna (van dentro del código) |
4. **Deploy**. En 2-3 min te da una URL tipo `https://literatus-novelist-xxxx.vercel.app`.
5. Anota esa URL.

---

## PARTE 3 — Conectar backend y frontend  (~3 min)

El backend solo acepta peticiones del frontend si conoce su URL exacta.

1. Vuelve a Render → tu servicio → pestaña **Environment**.
2. Corrige estas dos variables con la URL **real** de Vercel (paso 2.2, punto 4):
   - `CORS_ALLOWED_ORIGINS` = `https://literatus-novelist-v2.vercel.app`
   - `FRONTEND_URL` = `https://literatus-novelist-v2.vercel.app`
3. **Save Changes** → Render redesplega solo (~2 min).
4. Abre tu URL de Vercel, entra a la app, intenta iniciar sesión o abrir el catálogo.
   - Si el catálogo carga → listo ✅
   - Si no carga → abre la consola del navegador (F12) y busca errores de *CORS* o de *network*; casi siempre es una URL mal escrita en el paso 2 o 3.

---

## Checklist final

- [ ] `GET https://tu-backend.onrender.com/api/health/` responde OK
- [ ] `GET https://tu-backend.onrender.com/api/v1/catalog/books/` devuelve libros (JSON)
- [ ] La app en Vercel carga el catálogo con portadas
- [ ] Login funciona
- [ ] `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL` en Render = URL real de Vercel
- [ ] `apiUrl` en `environment.prod.ts` = URL real de Render

---

## Correo de recuperación con Resend

La integración se probó en el backend local y el usuario confirmó que recibió el correo de prueba. Para habilitar el envío a los demás usuarios en el sitio publicado:

1. Registrar un dominio propio o usar uno que ya controles. La dirección `.vercel.app` del sitio no sirve como dominio de envío de Resend.
2. En Resend, añadir ese dominio y copiar sus registros de verificación al proveedor DNS del dominio. Esperar hasta que Resend indique **Verified**.
3. En el servicio existente de Render, abrir **Environment** y configurar `EMAIL_HOST_PASSWORD` con la clave de Resend y `DEFAULT_FROM_EMAIL` con una dirección del dominio verificado.
4. Mantener `FRONTEND_URL=https://literatus-novelist-v2.vercel.app` para que los enlaces de activación abran el sitio publicado.
5. Publicar los cambios del backend y frontend, aplicar la migración `users/0013_password_reset_challenge.py` y probar la recuperación con una cuenta registrada y verificada en esa base.

El remitente `onboarding@resend.dev` sirve para enviar pruebas únicamente al correo de la cuenta de Resend. No habilita el envío a los demás usuarios. La clave local no se copia automáticamente a Render.

Detalles y pruebas en [Recuperación de contraseña](docs/RECUPERACION_CONTRASENA.md). Referencia: [dominios verificados de Resend](https://resend.com/docs/dashboard/domains/introduction).

## Otras notas

- **Dominio `novelatus.tech`:** si no controlas el registrador del dominio, no puedes usarlo. Quédate con las URLs `.vercel.app` y `.onrender.com`.
- **Admin de Django sin estilos:** cosmético (falta `whitenoise`). No afecta la API ni la app. Se arregla en 5 min si lo necesitas para la defensa.
