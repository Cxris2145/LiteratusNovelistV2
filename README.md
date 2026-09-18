<div align="center">

# 📚 Literatus Novelist V2

**Plataforma de lectura interactiva que combina literatura digital, biblioteca personal, economía virtual e inteligencia artificial conversacional para transformar obras clásicas en experiencias inmersivas.**

[![Demo](https://img.shields.io/badge/Demo-novelatus.tech-6C4AB6?style=for-the-badge)](https://www.novelatus.tech/)
[![Django](https://img.shields.io/badge/Django-REST_API-092E20?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![Angular](https://img.shields.io/badge/Angular-17-DD0031?style=for-the-badge&logo=angular)](https://angular.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

🌐 **Demo en vivo:** [https://www.novelatus.tech/](https://www.novelatus.tech/)

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
- [Guía de Instalación y Ejecución](#-guía-de-instalación-y-ejecución)
  - [Paso 1: Clonar el repositorio](#paso-1-clonar-el-repositorio)
  - [Paso 2: Configurar la base de datos (PostgreSQL)](#paso-2-configurar-la-base-de-datos-postgresql)
  - [Paso 3: Configurar y ejecutar el backend (Django)](#paso-3-configurar-y-ejecutar-el-backend-django)
  - [Paso 4: Configurar y ejecutar el frontend (Angular)](#paso-4-configurar-y-ejecutar-el-frontend-angular)
  - [Paso 5: Probar la aplicación](#paso-5-probar-la-aplicación)
- [Compilación Móvil (Capacitor / Android)](#-compilación-móvil-capacitor--android)
- [Automatizaciones y Scripts Adicionales](#-automatizaciones-y-scripts-adicionales)
- [Solución de Problemas Comunes](#-solución-de-problemas-comunes)

---

## 📖 Descripción del Proyecto

**Literatus Novelist** es una aplicación full-stack diseñada para enriquecer la experiencia de lectura de obras clásicas de dominio público:

| Módulo | Qué hace |
|---|---|
| 📚 **Catálogo y Biblioteca Personal** | Adquisición de obras, control de propiedad digital, progreso de lectura y marcadores. |
| 📖 **Lector Inmersivo** | Lectura por capítulos HTML, audios asociados y temas visuales (Claro, Sepia, Oscuro). |
| 🤖 **Personajes con IA** | Conversación en tiempo real con avatares de personajes y autores clásicos impulsados por LLMs (Google Gemini / DeepSeek). |
| 🪙 **Economía Virtual** | Saldo de "Tinta" para desbloquear libros e interacciones con IA. |
| 💳 **Pasarela de Pago** | Integración con Transbank Webpay Plus para recargas de Tinta. |
| 📊 **Panel Administrativo** | Dashboard para gestión de autores, libros, géneros, métricas y avatares IA. |

---

## 🧰 Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Backend** | Django + Django REST Framework, autenticación JWT, drf-spectacular (OpenAPI/Swagger) |
| **Frontend** | Angular 17 (SPA / PWA), TypeScript |
| **Base de Datos** | PostgreSQL 14+ |
| **IA** | Google Gemini · DeepSeek |
| **Pagos** | Transbank Webpay Plus |
| **Móvil** | Capacitor (build Android nativo) |
| **Automatización** | Python (scraping de libros y generación de portadas) |

---

## 📁 Estructura del Repositorio

```text
LiteratusNovelist/
├── .gitignore                      # Exclusiones de Git (node_modules, venv, .env, etc.)
├── README.md                       # Guía principal de instalación y ejecución
└── respaldos-software/
    ├── Automatizaciones/           # Scripts de scraping de libros y generación de portadas
    │   ├── Creacion de Portadas_basicas/
    │   └── scraper_elejandria_libros.py
    ├── books/                      # Biblioteca de libros y portadas descargadas
    └── LiteratusNovelist-main/
        ├── Documentacion/          # Arquitectura, manuales, actas, QA y casos de prueba
        ├── Gestion/                # Documentos de gestión e integrantes
        └── Producto/
            ├── backend/            # API REST Django (Python)
            │   ├── ai_engine/      # Módulo de IA y chat con personajes
            │   ├── catalog/        # Catálogo de libros, autores y capítulos
            │   ├── config/         # Configuración de Django (settings, urls, wsgi)
            │   ├── core/           # Modelos base, utilidades y paginación
            │   ├── dashboard/      # Métricas y administración
            │   ├── finance/        # Integración Webpay Plus y transacciones
            │   ├── json_data/      # Datos auxiliares e importaciones
            │   ├── library/        # Inventario y progreso de usuario
            │   ├── media/          # Archivos estáticos de medios
            │   ├── scripts/        # Scripts de seed y utilidades
            │   ├── users/          # Autenticación JWT y perfiles
            │   ├── manage.py       # CLI de Django
            │   ├── requirements.txt
            │   └── .env.example    # Plantilla de variables de entorno
            └── frontend/           # Aplicación SPA / PWA (Angular 17)
                ├── android/        # Proyecto nativo Android (Capacitor)
                ├── src/            # Código fuente Angular
                ├── angular.json
                ├── capacitor.config.ts
                └── package.json
```

---

## 🛠 Requisitos Previos

Asegúrate de tener instalados los siguientes programas:

| Herramienta | Versión recomendada | Enlace oficial |
|---|---|---|
| Git | 2.40+ | [Descargar Git](https://git-scm.com/downloads) |
| Python | 3.12+ | [Descargar Python](https://www.python.org/downloads/) |
| Node.js | 20.x LTS (incluye npm) | [Descargar Node.js](https://nodejs.org/) |
| PostgreSQL | 14 o superior (con pgAdmin) | [Descargar PostgreSQL](https://www.postgresql.org/download/) |

---

## 🚀 Guía de Instalación y Ejecución

### Paso 1: Clonar el repositorio

```bash
git clone https://github.com/Cxris2145/LiteratusNovelistV2.git
cd LiteratusNovelistV2
```

### Paso 2: Configurar la base de datos (PostgreSQL)

1. Abre **pgAdmin** o conéctate mediante `psql`.
2. Crea una base de datos llamada `literatus_db`:

   ```sql
   CREATE DATABASE literatus_db;
   ```

3. Anota tu usuario y contraseña de PostgreSQL (en local suele ser el usuario `postgres` con la contraseña que definiste en la instalación).

### Paso 3: Configurar y ejecutar el backend (Django)

**3.1. Navegar a la carpeta del backend**

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/backend
```

**3.2. Crear y activar el entorno virtual**

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> Si PowerShell bloquea la ejecución de scripts, ejecuta antes:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

</details>

<details>
<summary><b>macOS / Linux</b></summary>

```bash
python3 -m venv .venv
source .venv/bin/activate
```

</details>

**3.3. Instalar las dependencias**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**3.4. Configurar las variables de entorno (`.env`)**

Copia la plantilla para crear tu `.env` local:

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Luego ajusta los valores con tus credenciales locales:

```env
DEBUG=True
SECRET_KEY=django-insecure-clave-secreta-de-desarrollo-local
DATABASE_URL=postgres://postgres:TU_PASSWORD_AQUI@localhost:5432/literatus_db
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:4200

# Opcionales para IA (puedes dejarlas vacías para desarrollo general)
GOOGLE_API_KEY=
DEEPSEEK_API_KEY=

# Configuración Webpay (ambiente de Integración / Pruebas)
WEBPAY_COMMERCE_CODE=597055555532
WEBPAY_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
WEBPAY_ENVIRONMENT=INTEGRACION
WEBPAY_RETURN_URL=http://localhost:8000/api/v1/finance/confirm/
FRONTEND_URL=http://localhost:4200
```

> ⚠️ **Importante:** las credenciales Webpay anteriores son públicas y corresponden **solo al ambiente de integración** de Transbank. Nunca subas credenciales de producción ni tu archivo `.env` al repositorio.

**3.5. Aplicar migraciones**

```bash
python manage.py migrate
```

**3.6. Crear un usuario administrador**

```bash
python manage.py createsuperuser
```

**3.7. Iniciar el servidor backend**

```bash
python manage.py runserver
```

✅ El backend quedará corriendo en `http://localhost:8000`

| Recurso | URL |
|---|---|
| Documentación Swagger / OpenAPI | `http://localhost:8000/api/schema/swagger-ui/` |
| Panel de administración Django | `http://localhost:8000/admin/` |
| API base | `http://localhost:8000/api/v1/` |

### Paso 4: Configurar y ejecutar el frontend (Angular)

Abre **otra terminal independiente**.

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/frontend
npm install
npm start          # alternativa: npx ng serve
```

✅ El frontend quedará corriendo en `http://localhost:4200`

### Paso 5: Probar la aplicación

1. Abre tu navegador en `http://localhost:4200`.
2. Regístrate con una cuenta nueva o inicia sesión con tu usuario administrador.
3. Explora el catálogo, lee capítulos, conversa con los avatares IA y prueba la recarga de Tinta.

---

## 📱 Compilación Móvil (Capacitor / Android)

Requiere **Android Studio** y el **SDK de Android** instalados. Desde `Producto/frontend`:

```bash
npm run build
npx cap sync android
npx cap open android
```

Luego ejecuta el proyecto en un emulador o en un dispositivo físico con depuración USB activada.

---

## 🤖 Automatizaciones y Scripts Adicionales

Dentro de `respaldos-software/Automatizaciones/` encontrarás herramientas auxiliares:

- **`scraper_elejandria_libros.py`** — Script en Python para extraer metadatos, textos y portadas de libros clásicos de dominio público.
- **`Creacion de Portadas_basicas/`** — Cuaderno Jupyter y scripts para generar portadas de libros de forma automatizada mediante modelos de IA.

---

## ❓ Solución de Problemas Comunes

<details>
<summary><b>❌ <code>psycopg2.OperationalError: could not connect to server</code></b></summary>

- Verifica que el servicio de PostgreSQL esté iniciado (`services.msc` en Windows).
- Revisa que usuario, contraseña, puerto (`5432`) y nombre de la base de datos en `.env` sean correctos.

</details>

<details>
<summary><b>❌ <code>Blocked by CORS policy</code></b></summary>

Asegúrate de tener en el `.env` del backend:

```env
CORS_ALLOWED_ORIGINS=http://localhost:4200
```

</details>

<details>
<summary><b>❌ PowerShell: "La ejecución de scripts está deshabilitada"</b></summary>

Ejecuta en PowerShell como administrador:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

</details>

<details>
<summary><b>❌ Conflictos de dependencias al hacer <code>npm install</code></b></summary>

Si hay conflictos entre versiones de Angular y Capacitor:

```bash
npm install --legacy-peer-deps
```

</details>

---

<div align="center">

**Literatus Novelist V2** · Proyecto académico desarrollado por Christopher Guerrero, Luis Faúndes, Eithan Santibáñez y Matías Morales.

</div>
