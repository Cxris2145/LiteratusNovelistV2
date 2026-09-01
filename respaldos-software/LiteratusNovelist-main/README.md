<div align="center">

# Literatus Novelist

**Plataforma de lectura interactiva que combina literatura digital, biblioteca personal, economia virtual e inteligencia artificial conversacional para transformar obras clasicas en experiencias inmersivas.**

[![Angular](https://img.shields.io/badge/Angular-17.3-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Django](https://img.shields.io/badge/Django-6.0.4-092E20?style=for-the-badge&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![DRF](https://img.shields.io/badge/DRF-3.17.1-A30000?style=for-the-badge)](https://www.django-rest-framework.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.4-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

</div>

---

## Demo en Vivo 🚀
Puedes probar la aplicación funcionando en el siguiente enlace: **[https://www.novelatus.tech/](https://www.novelatus.tech/)**

---

## Estado del Proyecto

**MVP funcional en desarrollo.** El repositorio contiene una aplicacion full-stack operativa con API REST, frontend Angular, flujo de autenticacion JWT, catalogo de libros, biblioteca personal, lector con capitulos HTML, chat con personajes IA, TTS, pagos Webpay y dashboard administrativo. Aun requiere hardening de seguridad, normalizacion de configuracion y mejoras de producto antes de considerarse listo para produccion.

## Que Problema Resuelve

Literatus Novelist busca reducir la friccion de entrada a la lectura profunda, especialmente en publicos acostumbrados a experiencias digitales dinamicas. Para ello convierte obras literarias en una plataforma interactiva donde el usuario puede:

- descubrir libros, autores, generos y personajes;
- adquirir obras o paquetes de "Tinta";
- leer capitulos desde una biblioteca personal;
- conversar con personajes o autores representados por avatares de IA;
- desbloquear narracion premium y experiencias de voz;
- administrar contenido editorial desde un panel privado.

La solucion separa claramente la experiencia de usuario en Angular de una API Django REST que concentra reglas de negocio, persistencia, seguridad, pagos y orquestacion de IA.

## Stack Tecnologico

| Capa | Tecnologias |
| --- | --- |
| Frontend web | Angular 17.3, TypeScript 5.4, RxJS 7.8, Angular Material/CDK, Lucide Icons, Lottie |
| PWA / Mobile | Angular Service Worker, Web Manifest, Capacitor 8.4, Android Gradle project |
| Backend | Python 3.12+, Django 6.0.4, Django REST Framework 3.17.1, Simple JWT, drf-spectacular |
| Base de datos | PostgreSQL via `DATABASE_URL`, modelos con UUID, auditoria temporal y soft delete |
| IA conversacional | Google GenAI/Gemini, DeepSeek como proveedor de respaldo, system prompts por avatar |
| Voz / audio | Kokoro TTS via API externa, ElevenLabs como servicio alternativo, ONNX Runtime Web, faster-whisper para flujos de alineacion |
| Pagos | Transbank Webpay Plus SDK 6.1.0 |
| Storage / media | Media local en desarrollo; soporte para URL publica de Supabase Storage |
| Deploy | Frontend preparado para Vercel; backend preparado para Render/Gunicorn |

## Caracteristicas Principales

- **Catalogo editorial normalizado:** libros, autores, generos, tags, ediciones, capitulos, resenas y archivos protegidos.
- **Biblioteca personal:** inventario por usuario, control de propiedad digital, progreso de lectura EPUB CFI/pagina y marcadores.
- **Lector inmersivo:** lectura por capitulos HTML, descarga segura desde inventario, audios por capitulo y datos de alineacion.
- **Personajes IA:** avatares asociados a ediciones, desbloqueo por progreso, sesiones de chat, historial y contador de popularidad.
- **Motor multi-provider:** Gemini con failover por segunda API key y respaldo DeepSeek; consumo dinamico de Tinta segun proveedor.
- **Economia virtual:** perfiles con saldo de Tinta, compra de libros con Tinta y paquetes de recarga.
- **Pagos Webpay Plus:** creacion y confirmacion de transacciones, entrega atomica de libros o Tinta y soporte para compras gratuitas.
- **Personalizacion de UI:** soporte para temas (Oscuro, Claro, Sepia) modificables desde el perfil del usuario.
- **Dashboard administrativo:** metricas, gestion de libros, parseo EPUB, alta/edicion de autores, categorias y avatares.
- **API documentada:** esquema OpenAPI y Swagger UI via drf-spectacular.
- **PWA y Android:** service worker para cache de assets/inventario y proyecto Android generado con Capacitor.

## Arquitectura

```mermaid
flowchart LR
    A["Angular SPA / PWA"] -->|JWT + REST| B["Django REST API"]
    B --> C["PostgreSQL"]
    B --> D["Webpay Plus"]
    B --> E["Gemini / DeepSeek"]
    B --> F["Kokoro / ElevenLabs TTS"]
    B --> G["Media local o Supabase Storage"]
    A --> H["Capacitor Android"]
```

El backend esta organizado por dominios:

- `users`: identidad, perfiles, roles y saldo de Tinta.
- `catalog`: catalogo publico, autores, libros, ediciones, capitulos y resenas.
- `library`: inventario del usuario, progreso, marcadores y descargas.
- `ai_engine`: avatares, sesiones, mensajes, providers LLM y TTS.
- `finance`: transacciones Webpay y entrega atomica de compras.
- `dashboard`: administracion de contenido y analiticas.

## Guia de Instalacion

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd LiteratusNovelist
```

### 2. Requisitos previos

- Python 3.12 o superior.
- Node.js 20.x y npm.
- PostgreSQL 14 o superior.
- Una base de datos local, por ejemplo `literatus_db`.
- Opcional: credenciales de Google GenAI, DeepSeek, Kokoro, ElevenLabs, Supabase y Transbank.

### 3. Configurar backend

```bash
cd Producto/backend
python -m venv .venv
```

Activar entorno virtual:

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate
```

Instalar dependencias:

```bash
pip install -r requirements.txt
```

Crear el archivo de entorno:

```bash
copy .env.example .env
```

En macOS/Linux:

```bash
cp .env.example .env
```

Variables principales:

```env
DEBUG=True
SECRET_KEY=django-insecure-cambia-esta-clave
DATABASE_URL=postgres://postgres:password@localhost:5432/literatus_db
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:4200

# Opcionales para IA y voz
GOOGLE_API_KEY=
GOOGLE_API_KEY_2=
DEEPSEEK_API_KEY=
KOKORO_API_URL=
ELEVENLABS_API_KEY=

# Opcionales para media/storage
SUPABASE_URL=

# Webpay / Transbank
WEBPAY_COMMERCE_CODE=597055555532
WEBPAY_API_KEY=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
WEBPAY_ENVIRONMENT=INTEGRACION
WEBPAY_RETURN_URL=http://localhost:8000/api/v1/finance/confirm/
FRONTEND_URL=http://localhost:4200
```

Migrar base de datos y crear usuario administrador:

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend local:

- API: `http://localhost:8000/api/v1/`
- Health check: `http://localhost:8000/api/health/`
- Swagger UI: `http://localhost:8000/api/schema/swagger-ui/`
- Django Admin: `http://localhost:8000/admin/`

### 4. Configurar frontend

```bash
cd ../frontend
npm install
npm start
```

Frontend local:

- App Angular: `http://localhost:4200/`

La URL base de API local esta definida en:

```ts
// Producto/frontend/src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api/v1/'
};
```

### 5. Build y PWA

```bash
npm run build
```

El build de produccion genera la salida en `Producto/frontend/dist/frontend/` y activa service worker mediante `ngsw-config.json`.

### 6. Android con Capacitor

```bash
npm run build
npx cap sync android
npx cap open android
```

La configuracion de Capacitor esta en `Producto/frontend/capacitor.config.ts`.

## Uso / Documentacion Rapida

### Registro y login

```bash
curl -X POST http://localhost:8000/api/v1/users/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo",
    "email": "demo@example.com",
    "password": "Password123!"
  }'
```

```bash
curl -X POST http://localhost:8000/api/v1/users/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo",
    "password": "Password123!"
  }'
```

El login devuelve `access`, `refresh` y datos basicos del usuario. Para endpoints privados:

```bash
Authorization: Bearer <ACCESS_TOKEN>
```

### Consultar catalogo

```bash
curl http://localhost:8000/api/v1/catalog/books/
curl "http://localhost:8000/api/v1/catalog/books/?search=poe"
curl http://localhost:8000/api/v1/catalog/books/<book-slug>/details/
curl http://localhost:8000/api/v1/catalog/books/recommendations/
```

### Comprar una obra con Tinta

```bash
curl -X POST http://localhost:8000/api/v1/catalog/books/<book-slug>/purchase/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

La compra usa una transaccion atomica y bloquea el perfil con `select_for_update()` para evitar condiciones de carrera sobre `ink_balance`.

### Iniciar pago Webpay

```bash
curl -X POST http://localhost:8000/api/v1/finance/pay/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "item_type": "ink",
    "item_reference": "500"
  }'
```

Paquetes de Tinta soportados por el backend:

```python
INK_PACKAGES = {
    "200":  990,
    "500":  1990,
    "1200": 3990,
}
```

### Biblioteca y lector

```bash
curl http://localhost:8000/api/v1/library/inventory/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

curl http://localhost:8000/api/v1/library/inventory/check/?slug=<book-slug> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

curl http://localhost:8000/api/v1/library/inventory/<inventory_uuid>/chapters/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Chat con personajes

```bash
curl "http://localhost:8000/api/v1/ai/hub/avatars/?q=principito"
```

Crear o recuperar una sesion:

```bash
curl "http://localhost:8000/api/v1/ai/sessions/?avatar_id=<avatar_id>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Enviar mensaje:

```bash
curl -X POST http://localhost:8000/api/v1/ai/chat/ \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "<session_uuid>",
    "message": "Que deberia aprender de este capitulo?"
  }'
```

Respuesta esperada:

```json
{
  "reply": "...",
  "ink_balance": 148,
  "ai_provider": "gemini",
  "ai_status": "ok",
  "cost": 2
}
```

## Estructura del Proyecto

```text
LiteratusNovelist/
|-- Documentacion/                         # Informes, manuales, QA, requerimientos y arquitectura
|-- Gestion/                               # Actas, integrantes y documentos de gestion academica
|-- Producto/
|   |-- backend/
|   |   |-- config/                        # Settings, urls, ASGI/WSGI
|   |   |-- core/                          # Modelo base, paginacion, decoradores
|   |   |-- users/                         # Usuario custom, perfiles, JWT, Tinta
|   |   |-- catalog/                       # Libros, autores, generos, ediciones, capitulos
|   |   |-- library/                       # Inventario, progreso, bookmarks, descargas
|   |   |-- ai_engine/                     # Avatares, chat, providers LLM, TTS
|   |   |-- finance/                       # Webpay Plus y transacciones
|   |   |-- dashboard/                     # Admin API y metricas
|   |   |-- scripts/                       # Seeds, scraping, sync de assets y utilidades
|   |   |-- json_data/                     # Datos auxiliares para importacion/generacion
|   |   |-- manage.py
|   |   |-- requirements.txt
|   |   `-- .env.example
|   `-- frontend/
|       |-- src/app/
|       |   |-- auth/                      # Login y registro
|       |   |-- catalog/                   # Listado, detalle, checkout y pagos
|       |   |-- library/                   # Biblioteca, lector, taberna y chat
|       |   |-- characters/                # Hub global de personajes IA
|       |   |-- dashboard/                 # Panel administrativo lazy-loaded
|       |   |-- core/                      # Servicios, guards, interceptor y componentes base
|       |   `-- users/                     # Perfil de usuario
|       |-- android/                       # Proyecto Android generado por Capacitor
|       |-- angular.json
|       |-- capacitor.config.ts
|       |-- ngsw-config.json
|       |-- package.json
|       `-- vercel.json
|-- prompt-mejoras-literatus.md            # Auditoria y backlog de mejoras
`-- README.md
```

## Roadmap / Tareas Pendientes

- **Hardening de produccion:** validar `DEBUG=False`, `ALLOWED_HOSTS`, CORS estricto, CSP, rotacion de claves y separacion de secretos por ambiente.
- **Configuracion de entorno:** ampliar `.env.example` con todas las variables que el backend lee (`GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `KOKORO_API_URL`, `CORS_ALLOWED_ORIGINS`, `SUPABASE_URL`, etc.).
- **Supabase y media:** revisar uso de `supabase-js` desde frontend, asegurar RLS/buckets y mover operaciones sensibles al backend cuando corresponda.
- **Dashboard financiero:** corregir la consulta de metricas que filtra transacciones por `AUTHORIZED`, ya que el modelo usa estados como `exitosa`, `fallida`, `iniciada` y `reversada`.
- **Flujos de cuenta:** agregar recuperacion de contrasena, verificacion de email y politicas de bloqueo/rate limit para login.
- **Refuerzo de lógica de negocio:** restringir permisos de escritura (POST/PUT/DELETE) en endpoints como `GenreViewSet` exclusivamente a administradores, y corregir rutas que esperan `<int:pk>` en modelos que usan UUID (ej. `AIAvatar`).
- **Idempotencia de Pagos:** reforzar la confirmacion de Webpay (especialmente recarga de Tinta) para evitar doble entrega si el token se confirma mas de una vez.
- **SEO:** implementar meta tags dinamicos, `robots.txt`, `sitemap.xml` y evaluar SSR/SSG para fichas de libros/autores.
- **Testing:** ampliar pruebas backend para compras, Webpay, consumo de Tinta, permisos de biblioteca y chat; agregar pruebas frontend de rutas criticas.
- **Observabilidad:** incorporar logging estructurado, captura de errores y metricas de latencia para IA/TTS/pagos.
- **Datos iniciales:** formalizar comandos de seed/importacion para que un nuevo entorno pueda poblar catalogo, autores, ediciones y avatares de forma reproducible.

## Autoria y Contacto

Proyecto academico desarrollado por:

- Josue Jheymi Ticona Ortiz
- Benjamin Patricio Norambuena Guzman

Para detalles de gestion, roles y documentos asociados, revisar `Gestion/Integrantes.txt` y la carpeta `Documentacion/`.

## Licencia

Proyecto academico Duoc UC. Definir una licencia Open Source formal antes de publicar o aceptar contribuciones externas.
