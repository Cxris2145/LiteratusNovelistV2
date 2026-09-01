<div align="center">

# 📚 Literatus Novelist V2

**Plataforma de lectura interactiva que combina literatura digital, biblioteca personal, economía virtual e inteligencia artificial conversacional para transformar obras clásicas en experiencias inmersivas.**

[![Angular](https://img.shields.io/badge/Angular-17.3-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Django](https://img.shields.io/badge/Django-6.0.4-092E20?style=for-the-badge&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![DRF](https://img.shields.io/badge/DRF-3.17.1-A30000?style=for-the-badge)](https://www.django-rest-framework.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.4-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

---

### 🌐 Demo en Vivo
Puedes acceder a la versión desplegada en: **[https://www.novelatus.tech/](https://www.novelatus.tech/)**

</div>

---

## 📋 Tabla de Contenidos
1. [Descripción del Proyecto](#-descripción-del-proyecto)
2. [Estructura del Repositorio](#-estructura-del-repositorio)
3. [Requisitos Previos](#-requisitos-previos)
4. [Guía de Instalación y Ejecución Paso a Paso](#-guía-de-instalación-y-ejecución-paso-a-paso)
   - [Paso 1: Clonar el Repositorio](#paso-1-clonar-el-repositorio)
   - [Paso 2: Configurar la Base de Datos (PostgreSQL)](#paso-2-configurar-la-base-de-datos-postgresql)
   - [Paso 3: Configurar y Ejecutar el Backend (Django)](#paso-3-configurar-y-ejecutar-el-backend-django)
   - [Paso 4: Configurar y Ejecutar el Frontend (Angular)](#paso-4-configurar-y-ejecutar-el-frontend-angular)
   - [Paso 5: Probar la Aplicación](#paso-5-probar-la-aplicación)
5. [Opcional: Compilación Móvil (Capacitor / Android)](#-opcional-compilación-móvil-capacitor--android)
6. [Automatizaciones y Scripts Adicionales](#-automatizaciones-y-scripts-adicionales)
7. [Solución de Problemas Comunes](#-solución-de-problemas-comunes)
8. [Integrantes y Contacto](#-integrantes-y-contacto)

---

## 📖 Descripción del Proyecto

**Literatus Novelist** es una aplicación full-stack diseñada para enriquecer la experiencia de lectura:
- **Catálogo y Biblioteca Personal:** Adquisición de obras, control de propiedad digital, progreso de lectura y marcadores.
- **Lector Inmersivo:** Lectura por capítulos HTML, audios asociados y temas visuales (Claro, Sepia, Oscuro).
- **Personajes con IA:** Conversación en tiempo real con avatares de personajes y autores clásicos impulsados por LLMs (Google Gemini / DeepSeek).
- **Economía Virtual:** Saldo de "Tinta" para desbloquear libros e interacciones con IA.
- **Pasarela de Pago:** Integración con Transbank Webpay Plus para recargas de Tinta.
- **Panel Administrativo:** Dashboard para gestión de autores, libros, géneros, métricas y avatares IA.

---

## 📁 Estructura del Repositorio

```text
LiteratusNovelist/
├── .gitignore                                 # Exclusiones de Git (node_modules, venv, .env, etc.)
├── README.md                                  # Guía principal de instalación y ejecución
├── respaldos-software/
│   ├── Automatizaciones/                      # Scripts para scraping de libros y generación de portadas
│   │   ├── Creacion de Portadas_basicas/
│   │   └── scraper_elejandria_libros.py
│   ├── books/                                 # Biblioteca de libros y portadas descargadas
│   └── LiteratusNovelist-main/
│       ├── Documentacion/                     # Arquitectura, manuales, actas, QA y casos de prueba
│       ├── Gestion/                           # Documentos de gestión e integrantes
│       └── Producto/
│           ├── backend/                       # API REST Django (Python)
│           │   ├── ai_engine/                 # Módulo de IA y chat con personajes
│           │   ├── catalog/                   # Catálogo de libros, autores y capítulos
│           │   ├── config/                    # Configuración de Django (settings, urls, wsgi)
│           │   ├── core/                      # Modelos base, utilidades y paginación
│           │   ├── dashboard/                 # Métricas y administración
│           │   ├── finance/                   # Integración Webpay Plus y transacciones
│           │   ├── json_data/                 # Datos auxiliares e importaciones
│           │   ├── library/                   # Inventario y progreso de usuario
│           │   ├── media/                     # Archivos estáticos de medios
│           │   ├── scripts/                   # Scripts de seed y utilidades
│           │   ├── users/                     # Autenticación JWT y perfiles
│           │   ├── manage.py                  # CLI de Django
│           │   ├── requirements.txt           # Dependencias Python
│           │   └── .env.example               # Plantilla de variables de entorno
│           └── frontend/                      # Aplicación SPA / PWA (Angular 17)
│               ├── android/                   # Proyecto nativo Android (Capacitor)
│               ├── src/                       # Código fuente Angular
│               ├── angular.json               # Configuración del workspace Angular
│               ├── capacitor.config.ts        # Configuración de Capacitor
│               └── package.json               # Dependencias Node.js
```

---

## 🛠 Requisitos Previos

Asegúrate de tener instalados los siguientes programas en tu equipo:

| Herramienta | Versión Recomendada | Enlace Oficial |
| :--- | :--- | :--- |
| **Git** | 2.40+ | [Descargar Git](https://git-scm.com/) |
| **Python** | 3.12+ | [Descargar Python](https://www.python.org/downloads/) |
| **Node.js** | 20.x LTS (incluye npm) | [Descargar Node.js](https://nodejs.org/) |
| **PostgreSQL** | 14 o superior (con pgAdmin) | [Descargar PostgreSQL](https://www.postgresql.org/download/) |

---

## 🚀 Guía de Instalación y Ejecución Paso a Paso

### Paso 1: Clonar el Repositorio

Abre una terminal (PowerShell, Git Bash o CMD) y clona el proyecto:

```bash
git clone https://github.com/Cxris2145/LiteratusNovelistV2.git
cd LiteratusNovelistV2
```

---

### Paso 2: Configurar la Base de Datos (PostgreSQL)

1. Abre **pgAdmin** o conéctate mediante `psql`.
2. Crea una nueva base de datos llamada `literatus_db`:
   ```sql
   CREATE DATABASE literatus_db;
   ```
3. Toma nota de tu usuario y contraseña de PostgreSQL (por defecto en local suele ser `usuario: postgres` y la contraseña que hayas asignado en la instalación).

---

### Paso 3: Configurar y Ejecutar el Backend (Django)

#### 3.1. Navegar a la carpeta del backend
```bash
cd respaldos-software/LiteratusNovelist-main/Producto/backend
```

#### 3.2. Crear y activar el entorno virtual de Python
- **En Windows (PowerShell):**
  ```powershell
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  ```
  *(Nota: Si PowerShell bloquea scripts, ejecuta antes: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

- **En macOS / Linux:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

#### 3.3. Instalar las dependencias
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### 3.4. Configurar las variables de entorno (`.env`)
Copia el archivo `.env.example` para crear tu `.env` local:
- **Windows:**
  ```cmd
  copy .env.example .env
  ```
- **macOS / Linux:**
  ```bash
  cp .env.example .env
  ```

Abre el archivo `.env` recién creado y ajusta los valores con tus credenciales locales:
```env
DEBUG=True
SECRET_KEY=django-insecure-clave-secreta-de-desarrollo-local
DATABASE_URL=postgres://postgres:TU_PASSWORD_AQUI@localhost:5432/literatus_db
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:4200

# Opcionales para IA (puedes dejarlas vacías para desarrollo general)
GOOGLE_API_KEY=
DEEPSEEK_API_KEY=

# Configuración Webpay (Ambiente de Integración / Pruebas)
WEBPAY_COMMERCE_CODE=597055555532
WEBPAY_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
WEBPAY_ENVIRONMENT=INTEGRACION
WEBPAY_RETURN_URL=http://localhost:8000/api/v1/finance/confirm/
FRONTEND_URL=http://localhost:4200
```

#### 3.5. Aplicar migraciones a la Base de Datos
```bash
python manage.py migrate
```

#### 3.6. Crear un usuario Administrador (Superuser)
```bash
python manage.py createsuperuser
```
*(Sigue las instrucciones en consola para ingresar nombre de usuario, email y contraseña).*

#### 3.7. Iniciar el servidor backend
```bash
python manage.py runserver
```

✅ **El backend estará corriendo en:** `http://localhost:8000`
- **Documentación Swagger / OpenAPI:** `http://localhost:8000/api/schema/swagger-ui/`
- **Panel de Administración Django:** `http://localhost:8000/admin/`
- **API Base:** `http://localhost:8000/api/v1/`

---

### Paso 4: Configurar y Ejecutar el Frontend (Angular)

Abre **otra ventana de terminal** independiente.

#### 4.1. Navegar a la carpeta del frontend
```bash
cd respaldos-software/LiteratusNovelist-main/Producto/frontend
```

#### 4.2. Instalar las dependencias de Node.js
```bash
npm install
```

#### 4.3. Iniciar el servidor de desarrollo
```bash
npm start
```
*(o alternativamente: `npx ng serve`)*

✅ **El frontend estará corriendo en:** `http://localhost:4200`

---

### Paso 5: Probar la Aplicación

1. Abre tu navegador web en **`http://localhost:4200`**.
2. Regístrate con una cuenta nueva o inicia sesión con tu usuario administrador.
3. Explora el catálogo de obras, lee capítulos, interactúa con avatares IA y prueba la recarga de Tinta.

---

## 📱 Opcional: Compilación Móvil (Capacitor / Android)

Si deseas probar o compilar la aplicación para Android:

1. Asegúrate de tener instalado **Android Studio** y el SDK de Android.
2. Desde la carpeta `Producto/frontend`:
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```
3. En Android Studio, ejecuta el proyecto en un emulador o en un dispositivo físico conectado con depuración USB.

---

## 🤖 Automatizaciones y Scripts Adicionales

Dentro de `respaldos-software/Automatizaciones/` encontrarás herramientas auxiliares:
- **`scraper_elejandria_libros.py`**: Script en Python para extraer metadatos, textos y portadas de libros clásicos desde dominio público.
- **`Creacion de Portadas_basicas/`**: Cuaderno Jupyter y scripts para generar portadas de libros de forma automatizada mediante modelos de IA.

---

## ❓ Solución de Problemas Comunes

### 1. Error: `psycopg2.OperationalError: could not connect to server`
- Verifica que el servicio de PostgreSQL esté iniciado en tu sistema operativo (`services.msc` en Windows).
- Revisa que el nombre de usuario, contraseña, puerto (5432) y nombre de base de datos en `.env` sean correctos.

### 2. Error: `Blocked by CORS policy`
- Asegúrate de que en el archivo `.env` del backend tengas: `CORS_ALLOWED_ORIGINS=http://localhost:4200`.

### 3. Error en PowerShell: `La ejecución de scripts está deshabilitada`
- Ejecuta en tu terminal de PowerShell como administrador:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```

### 4. Error al hacer `npm install` en frontend
- Si tienes conflictos de dependencias con versiones de Angular/Capacitor, prueba:
  ```bash
  npm install --legacy-peer-deps
  ```

---

## 👥 Integrantes y Contacto

- **Josue Jheymi Ticona Ortiz**
- **Benjamin Patricio Norambuena Guzman**

Para mayor detalle sobre arquitectura, diseño y actas de proyecto, consulta la carpeta `Documentacion/` y `Gestion/`.
