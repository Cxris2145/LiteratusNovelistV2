# Guia completa para defensa ante comision - Literatus Novelist

Fecha de preparacion: 29-06-2026

Fuentes auditadas: repositorio `LiteratusNovelist`, `README.md`, backend Django, frontend Angular, documentacion de requisitos/arquitectura/QA/manuales, presentacion `Literatus Novelist_ppt_fin.pptx` y guion `guion_literatus.pdf`.

## 1. Idea central para memorizar

Literatus Novelist es una plataforma web de lectura interactiva que transforma obras literarias de dominio publico en experiencias inmersivas. Combina un catalogo digital, biblioteca personal, lector por capitulos, chat contextual con personajes mediante IA, narracion por voz, sistema de moneda virtual Tinta, pagos Webpay y panel administrativo.

La tesis de defensa es esta:

- No intentamos reemplazar la lectura, al profesor ni el analisis literario humano.
- Buscamos reducir la friccion de entrada a la lectura profunda mediante interaccion, contexto y acompañamiento.
- La IA funciona como mediador narrativo: permite preguntar dentro de la experiencia sin abandonar el libro.
- El valor diferencial no es "tener IA", sino integrar lectura, personaje, audio, progreso, biblioteca y economia en una sola plataforma.
- El estado real del proyecto es un MVP funcional con backend, frontend, autenticacion, catalogo, biblioteca, IA, pagos y dashboard; todavia requiere hardening antes de produccion plena.

Respuesta de 30 segundos:

Literatus Novelist nace del problema de la baja comprension y motivacion lectora. En vez de entregar solo PDFs, construimos una plataforma donde el usuario puede leer obras clasicas, guardar progreso, escuchar narracion y conversar con personajes o autores mediante IA contextual. La arquitectura separa un frontend Angular de una API Django REST con PostgreSQL; el backend concentra autenticacion, catalogo, biblioteca, pagos Webpay, economia Tinta y orquestacion de IA con Gemini y DeepSeek como respaldo. Es un MVP funcional orientado a demostrar que la IA puede enriquecer la lectura sin reemplazarla.

## 2. Orden recomendado para responder a la comision

Cuando una pregunta sea amplia, responde en este orden:

- Problema: lectura pasiva, baja motivacion, falta de contexto durante la lectura.
- Solucion: experiencia integrada de lectura, chat, audio y progreso.
- Implementacion: Angular consume una API Django REST; PostgreSQL guarda usuarios, libros, inventario, progreso, chat y transacciones.
- Control: permisos, JWT, transacciones atomicas, ownership de biblioteca, Webpay, Tinta.
- Limite honesto: es un MVP; seguridad, observabilidad y cobertura de pruebas se deben fortalecer para produccion.

Frase puente:

"Lo puedo explicar desde la experiencia del usuario y despues bajar a la arquitectura tecnica."

## 3. Mapa de la presentacion

| Slide | Mensaje que debes defender | Si preguntan, profundiza en |
|---|---|---|
| 1 | Presentacion del equipo y proyecto | Proyecto academico con foco educativo y tecnologico. |
| 2 | Problema de comprension lectora | La motivacion no se basa solo en acceso, sino en interaccion y contexto. |
| 3 | Status quo: lectura pasiva | Bibliotecas digitales entregan contenido, pero no acompañan el proceso. |
| 4 | Gran idea | Preguntar a protagonistas/personajes convierte lectura en experiencia activa. |
| 5 | Objetivos | Leer, escuchar, preguntar, comprender y sentirse dentro de la novela. |
| 6-7 | Mercado | ChatGPT, Emochi/Character.AI y lectores digitales cubren partes, no la combinacion completa. |
| 8 | Solucion | Tres pilares: lectura personalizada, narracion y chat contextual. |
| 9 | Arquitectura | Angular, Django REST, PostgreSQL, Gemini/DeepSeek, Kokoro/TTS, Webpay. |
| 10 | Obstaculos | Latencia IA/TTS, limites de API, sincronizacion audio-texto, carga reactiva. |
| 11 | Demo | Debe mostrar flujo real, no solo pantallas aisladas. |
| 12 | Proyeccion | App movil nativa, marketplace de autores, poblamiento masivo. |
| 13-15 | Cierre | IA como herramienta para curiosidad y comprension, no sustituto del libro. |

## 4. Estado auditado del proyecto

El repositorio muestra una aplicacion full-stack operativa:

- Frontend web: Angular 17.3, TypeScript 5.4, RxJS, Angular Material/CDK, Lucide, Lottie.
- PWA/mobile: service worker, manifest web y proyecto Android con Capacitor.
- Backend: Django 6.0.4, Django REST Framework 3.17.1, Simple JWT, drf-spectacular.
- Base de datos: PostgreSQL mediante `DATABASE_URL`; modelos con UUID, timestamps y soft delete.
- IA: servicio multi-provider con Gemini como principal, segunda llave Gemini y DeepSeek como respaldo.
- Voz: codigo de Kokoro TTS remoto, servicio alternativo ElevenLabs, assets/modelos para TTS local y datos de alineacion por capitulo.
- Pagos: Transbank Webpay Plus SDK, transacciones locales, confirmacion y entrega de libros/Tinta.
- Administracion: dashboard para contenido, usuarios, libros, autores, avatares y estadisticas.
- Documentacion: requisitos, arquitectura, QA, manual de usuario e implementacion.

Punto importante: la slide 9 dice Angular 18, pero el codigo y README verificables usan Angular 17.3. Si la comision pregunta, responde: "La version verificable del repositorio es Angular 17.3. La slide debe corregirse verbalmente a Angular 17.3; la arquitectura no cambia por esa diferencia."

## 5. Propuesta de valor y diferenciacion

El proyecto no compite como un lector EPUB tradicional ni como un chatbot general. La diferenciacion esta en la integracion:

- Lector de obras: el usuario puede acceder a obras por catalogo, ficha, biblioteca y lector.
- Contexto literario: el chat no es generalista; cada avatar tiene `system_prompt`, contexto conductual, dialogos de muestra y relacion con una edicion.
- Inmersion: avatares, TTS, progreso, narracion y UI orientada a experiencia.
- Sostenibilidad: moneda Tinta y Webpay permiten modelo economico, no solo prototipo gratuito.
- Administracion: el panel permite poblar/editar contenido sin tocar directamente la base de datos.

Respuesta si preguntan "por que no usar ChatGPT directamente":

ChatGPT puede responder sobre literatura, pero no esta integrado al flujo de lectura, no sabe automaticamente que libro posee el usuario, que capitulo lee, que avatar corresponde ni conserva la experiencia dentro del lector. Literatus empaqueta IA, obra, personaje, progreso, biblioteca y reglas de negocio en un producto especifico.

## 6. Arquitectura tecnica

Arquitectura general:

- Cliente: Angular SPA/PWA. Renderiza catalogo, fichas, biblioteca, lector, chat, checkout y dashboard.
- API: Django REST Framework. Expone endpoints versionados bajo `/api/v1/`.
- Persistencia: PostgreSQL. Guarda usuarios, perfiles, catalogo, ediciones, capitulos, inventario, progreso, marcadores, avatares, sesiones, mensajes y transacciones.
- Servicios externos: Gemini/DeepSeek para IA, Kokoro/ElevenLabs o pipeline TTS para voz, Webpay Plus para pagos, Supabase Storage opcional para media.
- Despliegue documentado: frontend en Vercel, backend en Render, base/storage en Supabase.

Flujo tecnico resumido:

- El usuario interactua con Angular.
- Angular llama a la API con JWT en `Authorization: Bearer`.
- Django valida permisos, ejecuta reglas de negocio y consulta PostgreSQL.
- Si se requiere IA, Django llama al proveedor configurado y guarda mensajes.
- Si se requiere pago, Django crea una transaccion local, llama a Webpay y confirma al retorno.
- Angular actualiza la UI con observables/servicios.

## 7. Backend por dominios

| App | Responsabilidad | Puntos defendibles |
|---|---|---|
| `core` | modelo base, soft delete, timestamps, paginacion, configuracion global | UUID evita enumeracion; soft delete preserva auditoria. |
| `users` | usuario custom, perfil, JWT, Tinta, recuperacion/verificacion | separa identidad de preferencias; perfil guarda saldo y tema. |
| `catalog` | autores, generos, tags, libros, ediciones, capitulos, reseñas, audios | normalizacion 3NF; Book separado de Edition; slug para URLs. |
| `library` | inventario, progreso, marcadores, descarga y capitulos | ownership filtra por usuario; progreso 1:1 con inventario. |
| `ai_engine` | avatares, sesiones, mensajes, servicios LLM/TTS | prompt por avatar, historial y failover multi-provider. |
| `finance` | Webpay, transacciones, entrega de libros/Tinta | transaccion local, token Webpay, confirmacion atomica. |
| `dashboard` | administracion y metricas | protegido con `IsAdminUser`; gestiona contenido y usuarios. |

## 8. Modelo de datos esencial

Entidades que debes poder explicar:

- `User`: usuario custom con email unico, rol y flags de Django.
- `Profile`: datos extendidos, idioma, tema, color/avatar y saldo `ink_balance`.
- `Author`: autor normalizado con slug, bio, nacionalidad, años y foto.
- `Genre` y `Tag`: clasificacion y recomendacion.
- `Book`: obra abstracta; no contiene precio principal ni formato.
- `BookAuthor`: tabla intermedia con rol de autor/traductor/editor.
- `Edition`: publicacion concreta de un libro, con formato, idioma, archivo y precio.
- `Chapter`: capitulo HTML ordenado por libro.
- `ChapterAudio`: audio por capitulo con voz y datos de alineacion.
- `Review`: reseña 1 a 5 con restriccion de una reseña activa por usuario/libro.
- `UserInventory`: propiedad digital de una edicion por usuario.
- `ReadingProgress`: avance de lectura asociado a inventario.
- `UserBookmark`: marcador o nota asociado al inventario.
- `AIAvatar`: personaje/autor asociado a una edicion, con prompt, temperatura, imagenes y voz.
- `ChatSession`: conversacion usuario-avatar.
- `ChatMessage`: mensaje individual user/assistant/system.
- `Transaction`: registro de pago o recarga con Webpay o compra gratuita.

Respuesta si preguntan por 3NF:

Se separa `Book` de `Edition` porque una obra puede tener varios formatos, idiomas y precios. Se separa `User` de `Profile` para no cargar datos de preferencia en cada autenticacion. `BookAuthor` permite que el rol dependa de la relacion libro-autor, no de una sola tabla. `ReadingProgress` depende del par usuario-edicion, por eso vive sobre `UserInventory`.

## 9. UUID y soft delete

El modelo base `TimeStampedModel` aporta:

- `id` UUID como primary key.
- `created_at` y `updated_at`.
- `is_active` y `deleted_at`.
- manager `objects` que excluye eliminados.
- manager `all_objects` para administracion.
- `delete()` sobreescrito como borrado logico.

Defensa:

- UUID: reduce enumeracion de recursos y ayuda si el sistema crece o importa datos desde distintas fuentes.
- Soft delete: conserva trazabilidad, evita romper relaciones y permite recuperacion. Es especialmente importante para inventario, reseñas y transacciones.

Matiz:

Soft delete no reemplaza politicas de privacidad/GDPR. Para eliminacion legal total existe `hard_delete`, pero debe usarse con criterios administrativos.

## 10. Frontend y experiencia de usuario

Rutas principales:

- `/home`: inicio.
- `/catalog`: catalogo.
- `/book/:slug`: detalle de libro.
- `/authors` y `/author/:slug`: autores.
- `/characters`: hub de personajes.
- `/demo-chat`: chat publico limitado.
- `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`: autenticacion.
- `/profile`: perfil protegido.
- `/checkout/:type/:reference`: inicio de pago protegido.
- `/payment/success` y `/payment/failure`: resultado de Webpay.
- `/library`: biblioteca protegida.
- `/reader/:id`: lector protegido.
- `/dashboard`: modulo lazy-loaded protegido por `adminGuard`.

Servicios clave:

- `ApiService`: wrapper de HTTP.
- `AuthService`: tokens, usuario actual, estado de login/admin.
- `authInterceptor`: agrega JWT y refresca token ante 401.
- `ChatService`: sesiones y mensajes con IA.
- `AudioService`, `KokoroTtsService`, `NativeTtsService`, `WasmTtsService`: audio/TTS.
- `SettingsService`: tema/preferencias.
- `DashboardBooksService`: CRUD administrativo de libros, autores y avatares.

Respuesta si preguntan por reactividad:

Angular usa servicios singleton y observables/signals para centralizar estado. El interceptor agrega el JWT, maneja expiracion y reintenta la peticion tras refresh. En el lector y audio, los eventos de progreso se sincronizan con estado local y servicios.

## 11. Autenticacion y permisos

Backend:

- Simple JWT entrega `access` y `refresh`.
- DRF usa `JWTAuthentication` y tambien `SessionAuthentication`.
- Permiso global: `IsAuthenticatedOrReadOnly`.
- Endpoints privados usan `IsAuthenticated`.
- Dashboard usa `IsAdminUser`.

Frontend:

- `authInterceptor` agrega `Authorization: Bearer <token>`.
- Si recibe 401, usa `refresh_token` para renovar access.
- `authGuard` protege rutas de usuario.
- `adminGuard` verifica `is_staff` o `is_superuser` desde el perfil guardado.

Riesgo honesto:

Los tokens se guardan en `localStorage`. Es comun en MVPs SPA, pero ante XSS puede exponer tokens. Para produccion conviene evaluar cookies `HttpOnly`/`Secure`, CSP estricta, sanitizacion de HTML y rotacion de refresh tokens.

## 12. Flujos de negocio

### Compra con Tinta

- Usuario autenticado solicita compra de libro.
- Backend obtiene la primera edicion disponible.
- Calcula costo desde `edition.price`.
- En una transaccion atomica bloquea `Profile` con `select_for_update`.
- Verifica saldo y ownership.
- Descuenta Tinta y crea `UserInventory`.

Respuesta breve:

"La compra con Tinta esta protegida contra carreras sobre el saldo porque el perfil se bloquea dentro de `transaction.atomic()`."

### Compra de narracion premium

- Requiere poseer el libro.
- Costo fijo actual: 200 Tinta.
- Bloquea perfil, verifica saldo y marca `has_premium_narration`.

### Webpay

- `initiate_payment` valida item `book` o `ink`.
- Resuelve monto en backend, no desde el cliente.
- Crea `buy_order`, `session_id` y transaccion local.
- Llama al SDK Webpay para obtener URL/token.
- `confirm_payment` recibe `token_ws`, confirma con Transbank y entrega item.
- Entrega libro con `UserInventory.get_or_create`; entrega Tinta sumando al perfil.

Punto fuerte:

El monto se resuelve del lado servidor. El frontend no puede inventar un precio.

Punto a mejorar:

La confirmacion de Webpay debe reforzarse con idempotencia explicita. Para libros, `get_or_create` evita duplicar inventario; para recargas de Tinta, una confirmacion repetida podria sumar de nuevo si no se verifica que la transaccion ya estaba `exitosa`. La mejora es retornar inmediatamente si `local_txn.status == 'exitosa'`.

### Biblioteca y descarga

- `UserInventoryViewSet` filtra siempre por `request.user`.
- `download_edition` solo opera sobre un inventario que pertenece al usuario.
- Si existe PDF de libro, lo prioriza; si no, usa archivo de edicion.
- Incrementa `download_count` de forma atomica.

### Chat con IA

- Se crea o recupera sesion por usuario-avatar.
- Se valida que la sesion pertenece al usuario.
- Se guarda mensaje del usuario.
- `AIService` arma prompt e historial.
- Prueba Gemini key 1, Gemini key 2 y DeepSeek.
- Se descuenta costo dinamico: Gemini 2 Tinta, DeepSeek 1 Tinta, error 0.
- Se guarda respuesta del asistente.

Punto a mejorar:

El descuento de Tinta en chat/TTS deberia estar dentro de una transaccion atomica con `select_for_update`, igual que compra de libros. Hoy hay validacion, pero no el mismo nivel de proteccion ante concurrencia.

## 13. IA, prompts y TTS

IA conversacional:

- `AIAvatar` guarda nombre, descripcion, `system_prompt`, temperatura, contexto conductual, dialogos de muestra y greeting.
- `AIService` construye una instruccion de sistema: "Eres [avatar]" + directrices + contexto emocional + regla de inmersion.
- El historial se limita a los ultimos mensajes para controlar costo y latencia.
- Gemini es principal; DeepSeek es respaldo.

Respuesta si preguntan por alucinaciones:

El MVP reduce alucinaciones mediante prompts de personaje, contexto conductual y ejemplos de dialogo, pero no elimina el riesgo. Para produccion se agregaria RAG por capitulos, citas internas, filtros de seguridad y evaluacion automatica de coherencia.

TTS:

- La presentacion habla de Kokoro-82M.
- El codigo actual tiene `KokoroTTSService` para generar audio base64 remoto.
- Tambien existe un servicio ElevenLabs alternativo y assets/scripts vinculados a Piper/Whisper/alineacion.
- `ChapterAudio` permite audios pregrabados con `alignment_data`.

Respuesta si preguntan "Kokoro o Piper/Whisper":

"En la documentacion aparecen dos lineas de trabajo. Para el MVP presentado, la narracion runtime esta soportada por Kokoro TTS, y el sistema tambien contempla audios por capitulo con datos de alineacion. Los documentos tecnicos mencionan Piper/Whisper como pipeline de narracion grabada y sincronizacion; por eso conviene hablar de TTS y alineacion como capacidades del sistema, aclarando cual se esta demostrando."

## 14. Seguridad, privacidad y cumplimiento

Fortalezas:

- JWT para endpoints privados.
- Dashboard con `IsAdminUser`.
- Biblioteca filtrada por usuario.
- Descarga protegida desde inventario.
- Webpay resuelve montos en backend.
- Transacciones atomicas en compras con Tinta y confirmacion Webpay.
- Password hashing via `create_user`/Django.
- Reset de contraseña no revela si el correo existe.
- Soft delete y timestamps ayudan a auditoria.

Riesgos y mejoras:

| Riesgo | Estado | Respuesta defendible |
|---|---|---|
| `ALLOWED_HOSTS` default `*` si no se configura | Hardening pendiente | En produccion debe definirse dominio exacto y `DEBUG=False`. |
| Secretos/sandbox keys visibles en README/settings defaults | Riesgo de configuracion | Se deben mover a variables de entorno, rotar y documentar `.env.example` completo. |
| Supabase anon key en frontend | Aceptable solo con RLS | La anon key no es equivalente a service role, pero exige buckets/RLS correctos. |
| JWT en `localStorage` | Riesgo XSS | Mejorar con CSP, sanitizacion, cookies HttpOnly o estrategia hibrida. |
| Endpoint `add_ink` acepta monto arbitrario | Dev/reward sin validacion fuerte | En produccion debe validar token de anuncio o restringirse a admin/backend. |
| `GenreViewSet` permite escritura a cualquier autenticado | Riesgo de permisos | Cambiar a permiso admin para POST/PUT/DELETE o mover escritura solo al dashboard. |
| Registro expone campo `role` | Riesgo de rol de negocio | Forzar `reader` en registro publico; no aceptar rol del cliente. |
| Dashboard revenue filtra `AUTHORIZED` | Bug funcional | Cambiar a `status='exitosa'` para coincidir con el modelo. |
| Avatar detail usa ruta `<int:pk>` pero `AIAvatar` usa UUID | Bug de ruta | Cambiar a `<uuid:pk>` y ajustar comentarios. |
| Webpay recarga Tinta no idempotente en confirmacion repetida | Riesgo financiero | Verificar estado previo antes de entregar item. |

## 15. QA y pruebas

Pruebas presentes en el repo:

- Backend users: login exitoso, credenciales invalidas, `/me/` autenticado/no autenticado.
- Backend catalog: listado publico, intento de creacion no autenticado, busqueda.
- Frontend: specs basicos de creacion de componentes.
- Documentacion QA: plan por casos de uso para registro, login, catalogo, compra, Webpay, lector, narracion, chat, avatares y dashboard.

Cobertura real a mejorar:

- Compra con Tinta: saldo insuficiente, compra duplicada, atomicidad.
- Webpay: exito, rechazo, token repetido, entrega de tinta/libro.
- Chat: ownership de sesion, consumo de Tinta, failover Gemini/DeepSeek.
- TTS: consumo de Tinta y errores de cold start.
- Dashboard: permisos admin y metricas.
- Frontend: interceptor refresh, guards, checkout y lector.

Respuesta si preguntan si esta probado:

"Hay pruebas unitarias/API iniciales y un plan QA documentado por casos de uso. Para pasar de MVP academico a produccion, la prioridad seria automatizar los flujos criticos: pagos, consumo de Tinta, permisos de biblioteca, chat y dashboard."

## 16. Despliegue e infraestructura

Despliegue documentado:

- Backend: Render con `gunicorn config.wsgi:application`.
- Frontend: Vercel con build Angular.
- Base de datos: PostgreSQL, documentada como Supabase en produccion.
- Storage/media: local en desarrollo, Supabase Storage opcional para URLs publicas.
- Swagger: `/api/schema/swagger-ui/`.
- Health check: `/api/health/`.

Variables criticas:

- `SECRET_KEY`
- `DEBUG`
- `DATABASE_URL`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `GOOGLE_API_KEY`, `GOOGLE_API_KEY_2`
- `DEEPSEEK_API_KEY`
- `KOKORO_API_URL`
- `ELEVENLABS_API_KEY`
- `SUPABASE_URL`
- `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY`, `WEBPAY_ENVIRONMENT`, `WEBPAY_RETURN_URL`
- `FRONTEND_URL`
- SMTP/Resend: `EMAIL_HOST`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`

## 17. API esencial para estudiar

| Modulo | Endpoint | Uso |
|---|---|---|
| Health | `/api/health/` | Verificar servidor. |
| Docs | `/api/schema/swagger-ui/` | API interactiva. |
| Users | `/api/v1/users/register/` | Registro. |
| Users | `/api/v1/users/login/` | JWT access/refresh. |
| Users | `/api/v1/users/login/refresh/` | Renovar token. |
| Users | `/api/v1/users/me/` | Usuario actual. |
| Users | `/api/v1/users/profile/` | Perfil y Tinta. |
| Catalog | `/api/v1/catalog/books/` | Listar/buscar libros. |
| Catalog | `/api/v1/catalog/books/{slug}/details/` | Ficha completa. |
| Catalog | `/api/v1/catalog/books/{slug}/purchase/` | Compra con Tinta. |
| Catalog | `/api/v1/catalog/books/{slug}/purchase_narration/` | Narracion premium. |
| Library | `/api/v1/library/inventory/` | Biblioteca personal. |
| Library | `/api/v1/library/inventory/check/?slug=...` | Verificar ownership. |
| Library | `/api/v1/library/inventory/{id}/chapters/` | Capitulos del libro. |
| Library | `/api/v1/library/inventory/{id}/download/` | Descargar archivo. |
| AI | `/api/v1/ai/hub/avatars/` | Hub publico de personajes. |
| AI | `/api/v1/ai/avatars/?inventory_id=...` | Avatares desbloqueados por libro. |
| AI | `/api/v1/ai/sessions/?avatar_id=...` | Crear/recuperar sesion. |
| AI | `/api/v1/ai/chat/` | Enviar mensaje. |
| AI | `/api/v1/ai/demo-chat/` | Demo publico limitado. |
| AI | `/api/v1/ai/audio/generate/` | TTS. |
| Finance | `/api/v1/finance/pay/` | Crear pago Webpay. |
| Finance | `/api/v1/finance/confirm/` | Confirmacion Webpay. |
| Dashboard | `/api/v1/dashboard/...` | Admin de contenido/metricas. |

## 18. Preguntas probables y respuestas

### Problema y valor

1. Por que eligieron este problema?
Respuesta: Porque el acceso a libros ya existe, pero la experiencia sigue siendo pasiva. La oportunidad esta en acompañar la comprension y motivacion durante la lectura.

2. Como saben que esto ayuda a comprender mejor?
Respuesta: El MVP propone mecanismos de apoyo: preguntas dentro del flujo, explicaciones de personajes, narracion y progreso. La validacion pedagogica profunda queda como trabajo futuro con usuarios/estudiantes, pre-test y post-test.

3. Reemplaza al profesor?
Respuesta: No. Actua como herramienta complementaria. El profesor sigue guiando interpretacion, evaluacion y pensamiento critico.

4. Reemplaza al libro?
Respuesta: No. El libro sigue siendo el centro. La IA es una capa de interaccion sobre la obra.

5. Que hace unica a la plataforma?
Respuesta: Integra lector, biblioteca, chat contextual, audio, progreso, economia Tinta, pagos y administracion en una experiencia unica.

6. Por que dominio publico?
Respuesta: Permite escalar catalogo sin infringir licencias, aunque se debe revisar cada edicion/fuente y jurisdiccion.

7. Que usuario objetivo tienen?
Respuesta: Lectores jovenes, estudiantes y docentes/bibliotecas que buscan una forma mas activa de acercarse a literatura clasica.

8. Que pasa si el usuario solo quiere leer?
Respuesta: Puede usar el catalogo y lector sin chat. La interaccion es valor agregado, no obligatoria.

9. Como monetizan si las obras son gratuitas?
Respuesta: Agregando valor con experiencia, TTS, chat, avatares, contenido premium y Tinta, no cobrando simplemente por el texto publico.

10. Que problema resuelve mejor que Kindle?
Respuesta: Kindle resuelve acceso/lectura; Literatus agrega interaccion contextual con personajes, tutor literario, gamificacion y narracion integrada al flujo.

### Arquitectura y stack

11. Por que Angular?
Respuesta: Permite construir SPA/PWA rica, modular, con servicios singleton, guards, interceptores y componentes para catalogo, lector, chat y dashboard.

12. Por que Django REST?
Respuesta: Django acelera modelado, ORM, admin, autenticacion, seguridad base y DRF permite exponer API REST estructurada.

13. Por que PostgreSQL?
Respuesta: Necesitamos integridad referencial, relaciones complejas, transacciones atomicas, indices y consultas robustas para catalogo, compras y chat.

14. Que significa arquitectura desacoplada?
Respuesta: Frontend y backend son proyectos independientes que se comunican por REST/JSON. Esto permite desplegarlos y escalar por separado.

15. Que rol cumple DRF?
Respuesta: Serializa modelos, aplica permisos, valida requests, pagina resultados y expone endpoints REST.

16. Que rol cumple Simple JWT?
Respuesta: Maneja access/refresh tokens para autenticacion stateless entre Angular y Django.

17. Como manejan expiracion de sesion?
Respuesta: El interceptor Angular detecta 401, llama a refresh con el refresh token y reintenta la peticion con el nuevo access token.

18. Como evitan N+1 queries?
Respuesta: En endpoints clave usan `select_related` y `prefetch_related`, por ejemplo catalogo, autores, biblioteca y avatares.

19. Que es `transaction.atomic()`?
Respuesta: Un bloque donde las operaciones de base de datos se confirman juntas o se revierten juntas; se usa en compras y confirmacion de pago.

20. Por que UUID?
Respuesta: Evita IDs secuenciales predecibles, facilita importaciones y reduce colisiones si el sistema crece.

### Datos y backend

21. Por que Book y Edition estan separados?
Respuesta: Porque una obra puede tener varios formatos, idiomas, archivos y precios. Eso pertenece a la edicion, no al concepto abstracto de libro.

22. Como saben que un usuario posee un libro?
Respuesta: Por `UserInventory`, que relaciona usuario y edicion. Las descargas y capitulos se sirven desde ese inventario.

23. Como guardan progreso?
Respuesta: En `ReadingProgress`, uno a uno con `UserInventory`, con CFI, pagina y porcentaje.

24. Como guardan marcadores?
Respuesta: `UserBookmark` referencia el inventario, por lo que no puede existir semanticamente sin ownership.

25. Como manejan reseñas duplicadas?
Respuesta: Con una constraint unica parcial: un usuario solo puede tener una reseña activa por libro.

26. Como se desbloquean personajes?
Respuesta: `AIAvatar` tiene `unlock_at_chapter`. El backend compara con el progreso del inventario.

27. Como se guarda el historial de chat?
Respuesta: `ChatSession` agrupa conversaciones y `ChatMessage` guarda mensajes ordenados por `created_at`.

28. Que pasa si falla un proveedor de IA?
Respuesta: `AIService` prueba Gemini con primera llave, luego segunda llave, luego DeepSeek. Si todo falla, responde con mensaje de error controlado y costo cero.

29. Como controlan costos de IA?
Respuesta: Limitando historial, asignando costo de Tinta por proveedor y usando DeepSeek como respaldo de menor costo.

30. Que pasa si el usuario no tiene Tinta?
Respuesta: El backend devuelve error `INSUFFICIENT_INK` o HTTP 402/400 segun flujo.

### IA y experiencia

31. Como garantizan que el personaje responda en rol?
Respuesta: Con `system_prompt`, contexto conductual, dialogos de muestra, temperatura y regla explicita de inmersion.

32. La IA puede inventar informacion?
Respuesta: Si, como todo LLM. El MVP lo mitiga con prompts y contexto; la mejora futura es RAG por capitulo y evaluacion automatica.

33. Por que usar Gemini?
Respuesta: Por latencia/capacidad multimodal y disponibilidad. El codigo tambien intenta modelos recientes y usa DeepSeek como respaldo.

34. Por que usar DeepSeek?
Respuesta: Como fallback ante limites, errores o indisponibilidad del proveedor principal.

35. Como funciona el chat demo?
Respuesta: Es publico, limitado por IP a 3 mensajes por dia, no guarda sesion en base de datos y permite probar valor antes de registrarse.

36. Como funciona TTS?
Respuesta: El endpoint recibe texto/avatar, selecciona voz, genera audio con Kokoro y descuenta Tinta. Para capitulos tambien existen audios con datos de alineacion.

37. Que es sincronizacion audio-texto?
Respuesta: Asociar tiempos del audio con palabras/capitulo para resaltar texto mientras se reproduce la narracion.

38. Por que no generar todo local?
Respuesta: Por costo computacional y latencia. El MVP combina servicios externos y assets locales; futuro puede optimizar con colas/cache.

39. Que pasa si Kokoro esta frio o tarda?
Respuesta: El endpoint maneja errores de cold start/timeout y responde 503 con mensaje para reintentar.

40. Como se podria mejorar IA en produccion?
Respuesta: RAG, cache de respuestas, moderacion, trazabilidad de prompts, metricas de latencia/costo y evaluaciones de calidad.

### Seguridad y pagos

41. Como protegen archivos de libros?
Respuesta: Los archivos de edicion estan pensados como protegidos y se sirven mediante endpoint autenticado que verifica `UserInventory`.

42. Como evitan que el frontend manipule precios?
Respuesta: El backend resuelve precio desde `Edition` o paquetes fijos de Tinta. El cliente solo pide un item.

43. Que pasa si Webpay rechaza?
Respuesta: `confirm_payment` marca la transaccion como `fallida` y redirige al frontend de failure.

44. Que pasa si Webpay aprueba?
Respuesta: Se confirma con Transbank, se entrega libro/Tinta, se marca `exitosa` y se redirige a success.

45. Que es idempotencia y por que importa?
Respuesta: Que repetir una confirmacion no duplique efectos. En libros ya hay `get_or_create`; en recargas Tinta falta reforzar estado previo.

46. Es seguro guardar anon key de Supabase en frontend?
Respuesta: La anon key esta diseñada para cliente si RLS esta bien configurado. Nunca debe exponerse service role.

47. Que riesgos ven para produccion?
Respuesta: Endurecer CORS/hosts/secretos, permisos finos, idempotencia de Webpay, atomicidad de Tinta en IA/TTS, observabilidad y pruebas.

48. Que harian primero para hardening?
Respuesta: Rotar secretos, completar `.env.example`, `DEBUG=False`, `ALLOWED_HOSTS` estricto, permisos admin, idempotencia Webpay y pruebas de pagos.

49. Como manejan roles?
Respuesta: Django mantiene `is_staff`/`is_superuser` para admin. El modelo tambien tiene `role`, pero registro publico debe forzarse a lector en produccion.

50. Como evitan enumeracion de recursos?
Respuesta: UUID reduce IDs predecibles y los endpoints privados filtran por usuario.

### QA, demo y futuro

51. Que mostraria la demo ideal?
Respuesta: Catalogo, ficha de libro, adquisicion o ownership, lector, chat con personaje, TTS/narracion y dashboard/admin si hay tiempo.

52. Que harian si falla la IA durante la demo?
Respuesta: Explicar failover, mostrar chat demo o historial guardado y pasar a arquitectura. No quedarse pegado al error externo.

53. Que harian si falla Webpay?
Respuesta: Mostrar el flujo hasta crear transaccion y explicar sandbox/confirmacion; si hay compra gratuita o Tinta, demostrar entrega local.

54. Que pruebas faltan?
Respuesta: Flujos criticos: Webpay, Tinta, permisos, chat, TTS, dashboard y refresh de token.

55. Como mediran exito del proyecto?
Respuesta: Retencion de lectura, tiempo en lector, preguntas por capitulo, finalizacion de libros, uso de chat/TTS y pruebas de comprension antes/despues.

56. Como escalarian el catalogo?
Respuesta: Con scripts de importacion EPUB, enriquecimiento de metadatos, sincronizacion de media y validacion editorial.

57. Como escalarian IA?
Respuesta: Colas, cache, limites por usuario, metricas de costo, fallback multi-provider y eventualmente RAG/caching por obra.

58. Como escalarian mobile?
Respuesta: La base ya usa PWA/Capacitor; siguiente paso es pulir app nativa, storage offline y sincronizacion.

59. Que rol tendria marketplace de autores?
Respuesta: Permitir a autores publicar obras y configurar avatares/personajes propios, manteniendo reglas de derechos y monetizacion.

60. Cual es la mayor debilidad actual?
Respuesta: Como MVP, la mayor debilidad no es una funcion aislada sino el hardening de produccion: permisos, pruebas, idempotencia, observabilidad y consistencia entre documentacion y codigo.

## 19. Preguntas incomodas: respuestas preparadas

### "La slide dice Angular 18, pero el proyecto usa Angular 17.3."

Respuesta:

"Correcto, el repositorio verificable usa Angular 17.3. La slide debe corregirse a Angular 17.3. La decision arquitectonica sigue siendo la misma: SPA Angular con servicios, guards e interceptor JWT."

### "La documentacion dice Piper/Whisper, pero la presentacion dice Kokoro."

Respuesta:

"El proyecto tuvo dos lineas de audio: narracion por TTS runtime con Kokoro y pipeline/activos de narracion grabada con alineacion. En la demo actual se debe hablar de la capacidad concreta que se muestra, y presentar Piper/Whisper como parte del pipeline documentado o proyeccion tecnica."

### "Tienen hardcoded keys de Webpay en settings/README."

Respuesta:

"Son valores de integracion/sandbox para desarrollo, pero no es aceptable para produccion. En produccion deben estar solo en variables de entorno y rotarse. El propio README ya lista hardening de secretos como pendiente."

### "Cualquier usuario autenticado puede crear generos por `GenreViewSet`."

Respuesta:

"Es un hallazgo de permisos. Lectura publica esta bien, pero escritura de catalogo debe restringirse a admin o al dashboard. Es una correccion prioritaria de bajo costo."

### "El endpoint `add_ink` permite sumar tinta arbitraria."

Respuesta:

"Debe tratarse como flujo de desarrollo o recompensa pendiente de validacion. Para produccion debe validar un token de anuncio/proveedor o quedar restringido a backend/admin."

### "El dashboard financiero puede mostrar revenue cero."

Respuesta:

"Si, porque filtra `AUTHORIZED`, pero el modelo usa `exitosa`. La correccion es cambiar el filtro a `status='exitosa'` y agregar prueba automatica."

### "La ruta de detalle de avatar usa `<int:pk>` y el modelo usa UUID."

Respuesta:

"Es una inconsistencia concreta. Las sesiones por query aceptan el UUID como string, pero el endpoint de detalle debe cambiarse a `<uuid:pk>` para ser consistente."

### "La IA puede cobrar 2 Tinta aunque el usuario tenga solo 1?"

Respuesta:

"El flujo valida minimo 1 y luego descuenta el costo real con `max(0)`. Para produccion lo correcto es validar el costo antes de confirmar o escoger proveedor segun saldo, y bloquear perfil en transaccion."

## 20. Resumen por persona/rol para estudiar

Si te toca explicar negocio:

- Problema: baja comprension/motivacion y lectura pasiva.
- Solucion: lectura aumentada con IA, audio, progreso y personajes.
- Diferenciacion: integracion completa, no chatbot suelto.
- Mercado: lectores jovenes, estudiantes, docentes e instituciones.
- Futuro: app movil, marketplace, catalogo masivo, medicion pedagogica.

Si te toca explicar frontend:

- Angular 17.3 SPA/PWA.
- Rutas por experiencia: home, catalogo, ficha, biblioteca, lector, chat, checkout, dashboard.
- Servicios: API, auth, chat, audio, settings, dashboard.
- JWT interceptor y refresh.
- PWA/Capacitor para expansion movil.

Si te toca explicar backend:

- Django REST por dominios.
- Modelos con UUID, timestamps y soft delete.
- DRF serializers/viewsets/APIView.
- Transacciones atomicas en compra y Webpay.
- Permissions por usuario/admin.
- OpenAPI/Swagger.

Si te toca explicar IA:

- Avatar tiene prompt, contexto, temperatura, dialogos y voz.
- AIService arma system prompt + historial.
- Gemini principal, segunda llave, DeepSeek fallback.
- Costo dinamico con Tinta.
- Riesgo de alucinacion mitigado parcialmente; RAG futuro.

Si te toca explicar datos:

- Book vs Edition.
- User vs Profile.
- UserInventory como ownership.
- ReadingProgress separado.
- ChatSession/ChatMessage para historial.
- Transaction para auditoria financiera.

## 21. Checklist de estudio antes de la defensa

- Memoriza la respuesta de 30 segundos.
- Corrige verbalmente Angular 17.3 si aparece Angular 18 en la slide.
- Decide como explicar Kokoro/Piper/Whisper sin contradecirte.
- Practica el flujo usuario: catalogo -> detalle -> biblioteca/lector -> chat -> TTS.
- Practica el flujo tecnico: Angular -> API -> DB -> IA/Webpay -> respuesta.
- Aprende 5 modelos de memoria: Book, Edition, UserInventory, AIAvatar, Transaction.
- Aprende 5 riesgos honestos: secretos, permisos, idempotencia, pruebas, XSS/localStorage.
- Ten una respuesta para "que falta para produccion".
- No prometas impacto educativo demostrado si aun no hicieron estudio con usuarios.
- Usa "MVP funcional" como marco: demuestra valor, pero reconoce hardening pendiente.

## 22. Cierre sugerido

Literatus Novelist demuestra que la IA puede usarse para acercar la literatura, no para reemplazarla. El valor no esta en automatizar la lectura, sino en devolverle dialogo, contexto y curiosidad. Tecnologicamente, el proyecto integra un frontend moderno, una API robusta por dominios, persistencia relacional, pagos, Tinta, chat y narracion. Como siguiente paso, el foco debe estar en pruebas, seguridad, consistencia de documentacion y validacion con usuarios reales.
