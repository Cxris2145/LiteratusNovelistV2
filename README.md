<div align="center">

# 📚 Literatus Novelist V2

**Plataforma de lectura interactiva que combina literatura digital, biblioteca personal, economía virtual e inteligencia artificial conversacional para transformar obras clásicas en experiencias inmersivas.**

[![Django](https://img.shields.io/badge/Django-6.0-092E20?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![Angular](https://img.shields.io/badge/Angular-17-DD0031?style=for-the-badge&logo=angular)](https://angular.dev/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://supabase.com/)

🌐 **Demo en vivo:** [https://literatus-novelist-v2.vercel.app/](https://literatus-novelist-v2.vercel.app/)

</div>

---

## 👥 Integrantes del Equipo

- **Christopher Guerrero**
- **Luis Faúndes**
- **Eithan Santibáñez**
- **Matías Morales**

> Para mayor detalle sobre arquitectura, diseño y actas de proyecto, consulta las carpetas [`Documentacion/`](respaldos-software/LiteratusNovelist-main/Documentacion) y [`Gestion/`](respaldos-software/LiteratusNovelist-main/Gestion).

---

## 📋 Tabla de Contenidos

- [Descripción del Proyecto](#-descripción-del-proyecto)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Repositorio](#-estructura-del-repositorio)
- [Requisitos Previos](#-requisitos-previos)
- [Guía de Instalación](#-guía-de-instalación)
  - [Paso 1: Clonar el repositorio](#paso-1-clonar-el-repositorio)
  - [Paso 2: Preparar el backend (Django)](#paso-2-preparar-el-backend-django)
  - [Paso 3: Elegir la base de datos](#paso-3-elegir-la-base-de-datos)
  - [Paso 4: Migrar y crear el administrador](#paso-4-migrar-y-crear-el-administrador)
  - [Paso 5: Cargar el catálogo (solo base nueva)](#paso-5-cargar-el-catálogo-solo-base-nueva)
  - [Paso 6: Preparar el frontend (Angular)](#paso-6-preparar-el-frontend-angular)
  - [Paso 7: Levantar todo](#paso-7-levantar-todo)
  - [Paso 8: Probar la aplicación](#paso-8-probar-la-aplicación)
- [Variables de Entorno](#-variables-de-entorno)
- [Pruebas Automatizadas](#-pruebas-automatizadas)
- [Compilación Móvil (Capacitor / Android)](#-compilación-móvil-capacitor--android)
- [Despliegue](#-despliegue)
- [Automatizaciones y Scripts Adicionales](#-automatizaciones-y-scripts-adicionales)
- [Solución de Problemas Comunes](#-solución-de-problemas-comunes)

---

## 📖 Descripción del Proyecto

**Literatus Novelist** es una aplicación full-stack para leer obras clásicas de dominio público y vivirlas de otra forma:

| Módulo | Qué hace |
|---|---|
| 📚 **Catálogo y Mi Biblioteca** | 200 obras curadas en 10 categorías, búsqueda sin tildes, compra con Tinta, progreso, marcadores y resumen IA por libro. |
| 📖 **Lector e-reader** | Vista de página y vista Libro con giro de hoja, temas, subrayados, post-its, búsqueda dentro del libro, cuaderno flotante y narración con voz. |
| 🤖 **Personajes con IA** | Chat con personajes y autores clásicos impulsado por Google Gemini (con DeepSeek de respaldo). |
| 🧭 **La Senda del Lector** | Mapa de 30 unidades y 150 niveles con ejercicios, misiones, logros y enigma diario. |
| 🍻 **La Taberna** | Comunidad: amigos, charlas, lectura conjunta en vivo, El Bazar y salón de juegos. |
| 🪙 **Economía y planes** | Saldo de "Tinta", planes mensuales con PayPal y recargas con Transbank Webpay (ambiente de integración). |
| 👨‍👧 **Control parental** | Cuentas de padres vinculadas a las de sus hijos, con historial de lectura. |
| 📊 **Panel administrativo** | Gestión de autores, libros, géneros, métricas y avatares IA. |

---

## 🧰 Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Backend** | Django 6 + Django REST Framework, JWT (SimpleJWT), drf-spectacular (OpenAPI/Swagger) |
| **Frontend** | Angular 17 (SPA / PWA), TypeScript, Angular Material, Three.js, Phaser |
| **Base de datos** | PostgreSQL (Supabase en producción) · SQLite para pruebas |
| **Archivos** | Supabase Storage (portadas, retratos y narraciones) |
| **IA** | Google Gemini · DeepSeek |
| **Voz** | Azure AI Speech (plan gratuito F0) |
| **Pagos** | PayPal (suscripciones) · Transbank Webpay Plus (integración) |
| **Correo** | Gmail vía Google Apps Script · Resend (SMTP) |
| **Móvil** | Capacitor 8 (Android nativo) |
| **Despliegue** | Vercel (frontend) · Máquina virtual de Azure con Docker (backend) |

---

## 📁 Estructura del Repositorio

```text
LiteratusNovelistV2/
├── README.md                       # Esta guía
├── package.json                    # Atajos: npm start, npm run backend, npm run frontend
├── iniciar.bat / iniciar.ps1       # Levantan backend y frontend en dos ventanas (Windows)
├── iniciar-backend.bat             # Solo el backend
├── iniciar-frontend.bat            # Solo el frontend
├── .github/workflows/              # Imagen Docker del backend (GitHub Actions)
├── docs/                           # Notas de mantenimiento, lector y retratos
└── respaldos-software/
    ├── Automatizaciones/           # Scraper de libros y generación de portadas
    ├── books/                      # EPUB y portadas de cada obra (<slug>/)
    └── LiteratusNovelist-main/
        ├── Documentacion/          # Arquitectura, manuales, actas, QA y casos de prueba
        ├── Gestion/                # Documentos de gestión e integrantes
        └── Producto/
            ├── DEPLOY.md           # Despliegue en Render + Vercel
            ├── DEPLOY-AZURE.md     # Despliegue en la VM de Azure (el actual)
            ├── backend/            # API REST Django (Python)
            │   ├── ai_engine/      # Chat con personajes, avatares y retratos
            │   ├── catalog/        # Libros, autores, capítulos, búsqueda y resúmenes
            │   ├── community/      # La Taberna: amigos, charlas y lectura conjunta
            │   ├── config/         # settings.py, test_settings.py, urls.py, wsgi.py
            │   ├── core/           # Utilidades, paginación y Supabase Storage
            │   ├── dashboard/      # Métricas y administración
            │   ├── finance/        # Tinta, PayPal y Webpay
            │   ├── learning/       # La Senda del Lector y El Bazar
            │   ├── library/        # Biblioteca, progreso, logros y misiones
            │   ├── parental/       # Control parental
            │   ├── users/          # Cuentas, JWT, invitados y verificación por correo
            │   ├── .env.example    # Plantilla de variables de entorno
            │   ├── REBUILD.md      # Reconstrucción completa del catálogo
            │   ├── Dockerfile      # Imagen para la VM de Azure
            │   └── requirements.txt
            └── frontend/           # Aplicación Angular 17
                ├── android/        # Proyecto nativo Android (Capacitor)
                ├── src/            # Código fuente (environments/ define la URL de la API)
                ├── angular.json
                ├── capacitor.config.ts
                └── package.json
```

---

## 🛠 Requisitos Previos

| Herramienta | Versión | Para qué | Enlace |
|---|---|---|---|
| Git | 2.40+ | Clonar el repositorio | [Descargar Git](https://git-scm.com/downloads) |
| Python | **3.12** | Backend (Django 6 pide 3.12 o superior) | [Descargar Python](https://www.python.org/downloads/) |
| Node.js | **22 LTS** (incluye npm) | Frontend (el proyecto declara `node 22.x`) | [Descargar Node.js](https://nodejs.org/) |
| PostgreSQL | 14+ *(opcional)* | Solo si quieres una base local propia | [Descargar PostgreSQL](https://www.postgresql.org/download/) |
| Android Studio | Reciente *(opcional)* | Solo para compilar la app Android | [Descargar Android Studio](https://developer.android.com/studio) |

> 💡 En Windows, al instalar Python marca **"Add python.exe to PATH"**. Comprueba las versiones con:
>
> ```bash
> git --version
> python --version
> node --version
> ```

---

## 🚀 Guía de Instalación

Todos los comandos se escriben en una terminal (PowerShell en Windows, Terminal en macOS/Linux). Las rutas parten de la carpeta raíz del repositorio.

### Paso 1: Clonar el repositorio

El repositorio pesa cerca de **2,6 GB** porque incluye los EPUB y las portadas de las obras. Para instalar basta con la última versión:

```bash
git clone --depth 1 https://github.com/Cxris2145/LiteratusNovelistV2.git
cd LiteratusNovelistV2
```

> Si vas a trabajar con ramas o con el historial completo, clona sin `--depth 1`.

### Paso 2: Preparar el backend (Django)

**2.1. Entrar a la carpeta del backend**

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/backend
```

**2.2. Crear y activar el entorno virtual**

El entorno debe llamarse `.venv` y quedar dentro de `backend/`: los scripts `iniciar.*` lo buscan ahí.

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> Si PowerShell bloquea la activación, ejecuta antes:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

</details>

<details>
<summary><b>macOS / Linux</b></summary>

```bash
python3 -m venv .venv
source .venv/bin/activate
```

</details>

Sabrás que está activo porque la línea de la terminal empieza con `(.venv)`.

**2.3. Instalar las dependencias**

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> `requirements-vocabulary.txt` y `requirements-scripts.txt` **no** hacen falta para usar la aplicación: son para generar el vocabulario de los libros y alinear audios.

**2.4. Crear el archivo `.env`**

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Abre `.env` y cambia `SECRET_KEY` por cualquier texto largo. Para generar uno:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

El resto de las variables es opcional; la tabla de [Variables de Entorno](#-variables-de-entorno) explica qué activa cada una.

### Paso 3: Elegir la base de datos

En `.env`, deja **una sola** línea `DATABASE_URL` activa:

| Opción | Cuándo usarla | `DATABASE_URL` |
|---|---|---|
| **A. Supabase del equipo** | Integrantes del equipo que necesitan los datos reales (catálogo completo, personajes con retrato, narraciones). | Pídela al equipo junto con `SUPABASE_URL` y `SUPABASE_KEY`. |
| **B. PostgreSQL local** | Desarrollo propio sin tocar los datos reales. | `postgres://postgres:TU_PASSWORD@localhost:5432/literatus_db` |
| **C. SQLite** | Probar rápido sin instalar PostgreSQL. | `sqlite:///db.sqlite3` |

> ⚠️ **La opción A es la base de producción**, con cuentas de usuarios reales: lo que crees, edites o borres se ve en el sitio publicado. Para experimentar usa B o C.

Para la opción **B**, crea antes la base en pgAdmin o con `psql`:

```sql
CREATE DATABASE literatus_db;
```

### Paso 4: Migrar y crear el administrador

Con el entorno virtual activo y desde `backend/`:

```bash
python manage.py migrate
python manage.py createsuperuser
```

`migrate` crea las tablas y además carga los logros y los planes de suscripción. Con la opción A las tablas ya existen y solo aplica lo que falte.

### Paso 5: Cargar el catálogo (solo base nueva)

> Sáltate este paso si usas la **opción A**: la base del equipo ya tiene todo.

Una base nueva parte vacía. Estos comandos la llenan con los libros de `respaldos-software/books/`:

```bash
# 1. Libros, capítulos, autores y categorías desde los EPUB (unos 1.100 libros, alrededor de 15 minutos)
python manage.py import_epubs --source ../../../books --spine

# 2. Portadas locales (Django las sirve desde /media/ mientras DEBUG=True)
python manage.py link_local_covers --source ../../../books

# 3. La Senda del Lector, El Bazar y las misiones semanales
python manage.py seed_learning_path
python seed_missions.py
```

> Usa siempre `--spine` al importar: el método por índice (TOC) corta o duplica capítulos en algunos libros. Para una prueba rápida, agrega `--limit 20` al paso 1.

**Diferencias con el sitio publicado:** la base local queda con todo el catálogo de EPUB en sus 33 categorías originales. La selección curada de 200 libros en 10 categorías, los personajes con retrato y las narraciones ya generadas solo están en la base del equipo (opción A). El comando `curate_catalog` aplicó esa selección en producción y no funciona sobre una base nueva, porque necesita autores que se crearon a mano allí. Para generar portadas o subirlas a tu propio Supabase, sigue [`REBUILD.md`](respaldos-software/LiteratusNovelist-main/Producto/backend/REBUILD.md).

### Paso 6: Preparar el frontend (Angular)

Abre **otra terminal** en la raíz del repositorio:

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/frontend
npm install
```

No hace falta `--legacy-peer-deps`: el archivo `.npmrc` del frontend ya lo activa. El frontend local habla con `http://localhost:8000/api/v1/` (definido en `src/environments/environment.ts`).

### Paso 7: Levantar todo

**Opción rápida (Windows):** desde la raíz del repositorio, ejecuta `iniciar.bat` (doble clic) o:

```bash
npm start
```

Se abren dos ventanas: una con el backend y otra con el frontend.

**Opción manual (cualquier sistema):** una terminal para cada servidor.

```bash
# Terminal 1 — backend (con el .venv activo)
cd respaldos-software/LiteratusNovelist-main/Producto/backend
python manage.py runserver 127.0.0.1:8000
```

```bash
# Terminal 2 — frontend
cd respaldos-software/LiteratusNovelist-main/Producto/frontend
npm start
```

La primera compilación de Angular tarda uno o dos minutos. Cuando ambos estén arriba:

| Recurso | URL |
|---|---|
| **Aplicación** | `http://localhost:4200` |
| Comprobación del backend | `http://127.0.0.1:8000/api/health/` |
| Documentación Swagger / OpenAPI | `http://127.0.0.1:8000/api/schema/swagger-ui/` |
| Panel de administración Django | `http://127.0.0.1:8000/admin/` |
| API base | `http://127.0.0.1:8000/api/v1/` |

### Paso 8: Probar la aplicación

1. Abre `http://localhost:4200`.
2. Entra con el superusuario del paso 4, usa **"Probar sin cuenta"** (crea un invitado temporal) o regístrate.
   - En local, si no configuraste el correo, la cuenta nueva queda activa al instante, sin código de verificación.
3. Explora el catálogo, abre un libro en el lector, recorre La Senda y entra a La Taberna.
4. El chat con personajes, los resúmenes y la narración necesitan sus claves (`GOOGLE_API_KEY`, `AZURE_SPEECH_KEY`). Sin ellas esas funciones no responden, pero el resto de la aplicación funciona igual.

---

## 🔑 Variables de Entorno

Todas van en `backend/.env` (plantilla: [`.env.example`](respaldos-software/LiteratusNovelist-main/Producto/backend/.env.example)). Solo las dos primeras son obligatorias.

| Variable | ¿Obligatoria? | Qué activa |
|---|---|---|
| `SECRET_KEY` | ✅ | Firma de sesiones y tokens JWT. |
| `DATABASE_URL` | ✅ | Conexión a la base de datos (ver [Paso 3](#paso-3-elegir-la-base-de-datos)). |
| `DEBUG` | — | `True` en local: sirve `/media/` y muestra errores detallados. |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` | — | Dominios permitidos. Los valores de la plantilla sirven para local. |
| `SUPABASE_URL`, `SUPABASE_KEY` | — | Portadas, retratos y narraciones en Supabase Storage (`SUPABASE_KEY` es la *service_role*). |
| `GOOGLE_API_KEY`, `GOOGLE_API_KEY_2` | — | Chat con personajes y resúmenes con Gemini ([clave gratis](https://aistudio.google.com/apikey)). |
| `DEEPSEEK_API_KEY` | — | Respaldo del chat cuando Gemini no responde. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | — | Narración de capítulos y voces del chat. |
| `PAYPAL_*` | — | Suscripciones de `/planes` (modo `sandbox` para pruebas). |
| `WEBPAY_*` | — | Recargas con Webpay. La plantilla trae las credenciales **públicas** de integración de Transbank. |
| `APPS_SCRIPT_MAIL_URL`, `APPS_SCRIPT_MAIL_SECRET` | — | Códigos por correo desde un Gmail ([guía](respaldos-software/LiteratusNovelist-main/Producto/backend/docs/correo-gmail-apps-script/README.md)). |
| `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | — | Correo por Resend (alternativa a Apps Script). |

> ⚠️ Nunca subas tu `.env` ni claves reales al repositorio. `.env` y `azure.env` ya están en `.gitignore`.

---

## 🧪 Pruebas Automatizadas

Las pruebas del backend usan SQLite en memoria (`config/test_settings.py`), así que **nunca tocan la base del equipo** aunque tu `.env` apunte a ella:

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/backend
python manage.py test --settings=config.test_settings
```

Pruebas del frontend (Karma + Jasmine, necesitan Google Chrome):

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/frontend
npm test
```

---

## 📱 Compilación Móvil (Capacitor / Android)

Requiere **Android Studio** con el SDK de Android. Desde `Producto/frontend`:

```bash
npm run build
npx cap sync android
npx cap open android
```

Luego ejecuta el proyecto en un emulador o en un teléfono con la depuración USB activada. La app compilada usa el backend de producción (`src/environments/environment.prod.ts`).

---

## 🌐 Despliegue

| Parte | Dónde vive | Guía |
|---|---|---|
| Frontend | Vercel, se publica solo con cada push a `main` | [`DEPLOY.md`](respaldos-software/LiteratusNovelist-main/Producto/DEPLOY.md) (parte 2) |
| Backend | Máquina virtual de Azure con Docker; GitHub Actions construye la imagen y la VM se actualiza sola | [`DEPLOY-AZURE.md`](respaldos-software/LiteratusNovelist-main/Producto/DEPLOY-AZURE.md) |
| Backend (alternativa) | Render, con el blueprint `backend/render.yaml` | [`DEPLOY.md`](respaldos-software/LiteratusNovelist-main/Producto/DEPLOY.md) (parte 1) |

---

## 🤖 Automatizaciones y Scripts Adicionales

- **Comandos de Django** (`python manage.py <comando>`): `import_epubs`, `link_local_covers`, `upload_covers_supabase`, `generate_covers`, `build_vocabulary`, `narrate_book`, `seed_learning_path`, `seed_achievements`, entre otros. Ver [`REBUILD.md`](respaldos-software/LiteratusNovelist-main/Producto/backend/REBUILD.md).
- **`respaldos-software/Automatizaciones/`**: scraper de libros de dominio público (`scraper_elejandria_libros.py`) y scripts para generar portadas con IA.
- **Atajos de la raíz** (`package.json`): `npm start` (todo), `npm run backend`, `npm run frontend`, `npm run install:frontend`, `npm run build:frontend`.

---

## ❓ Solución de Problemas Comunes

<details>
<summary><b>❌ <code>ImproperlyConfigured: Set the SECRET_KEY environment variable</code></b></summary>

Falta el archivo `.env` en `backend/` o no tiene `SECRET_KEY`. Repite el [paso 2.4](#paso-2-preparar-el-backend-django). Lo mismo aplica si el error menciona `DATABASE_URL`.

</details>

<details>
<summary><b>❌ <code>psycopg2.OperationalError: could not connect to server</code></b></summary>

- Verifica que el servicio de PostgreSQL esté iniciado (`services.msc` en Windows).
- Revisa usuario, contraseña, puerto (`5432`) y nombre de la base en `DATABASE_URL`.
- Si la contraseña tiene caracteres como `@`, `:` o `/`, escríbelos codificados (`@` → `%40`).

</details>

<details>
<summary><b>❌ <code>npm WARN EBADENGINE</code> o errores raros al compilar Angular</b></summary>

El proyecto usa **Node 22**. Revisa con `node --version` e instala la versión 22 LTS. Si cambiaste de versión, borra `node_modules` y vuelve a ejecutar `npm install`.

</details>

<details>
<summary><b>❌ <code>Blocked by CORS policy</code> o el frontend no carga datos</b></summary>

- Comprueba que el backend esté corriendo: `http://127.0.0.1:8000/api/health/` debe responder `{"status": "ok"}`.
- Revisa en `.env` que `CORS_ALLOWED_ORIGINS` incluya `http://localhost:4200`.

</details>

<details>
<summary><b>❌ La ventana del backend de <code>iniciar.bat</code> dice que no encuentra <code>.venv\Scripts\python.exe</code></b></summary>

Los scripts esperan el entorno virtual en `backend/.venv`. Créalo con ese nombre exacto (paso 2.2) e instala las dependencias dentro de él.

</details>

<details>
<summary><b>❌ El catálogo aparece vacío o sin portadas</b></summary>

- Con una base nueva, corre el [paso 5](#paso-5-cargar-el-catálogo-solo-base-nueva).
- Sin Supabase, las portadas se sirven desde `/media/` solo con `DEBUG=True`; vuelve a ejecutar `link_local_covers`.

</details>

<details>
<summary><b>❌ Aviso de iconos que faltan al ejecutar <code>npm start</code></b></summary>

Es solo un aviso: esos iconos se ven como texto. Para regenerar la fuente recortada:

```bash
node scripts/icon-fonts.mjs --write
pip install fonttools brotli
python scripts/icon-fonts/subset_icons.py
```

</details>

<details>
<summary><b>❌ <code>Filename too long</code> al clonar en Windows</b></summary>

Habilita las rutas largas en Git y vuelve a clonar, o clona en una carpeta corta como `C:\dev`:

```bash
git config --global core.longpaths true
```

</details>

<details>
<summary><b>❌ PowerShell: "La ejecución de scripts está deshabilitada"</b></summary>

Ejecuta en PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

</details>

<details>
<summary><b>❌ El puerto 8000 o 4200 ya está en uso</b></summary>

Cierra la otra instancia o usa otro puerto: `python manage.py runserver 127.0.0.1:8001` y `npx ng serve --port 4201`. Si cambias el del backend, actualiza `apiUrl` en `src/environments/environment.ts`; si cambias el del frontend, agrégalo a `CORS_ALLOWED_ORIGINS`.

</details>

---

<div align="center">

**Literatus Novelist V2** · Proyecto académico desarrollado por Christopher Guerrero, Luis Faúndes, Eithan Santibáñez y Matías Morales.

</div>
