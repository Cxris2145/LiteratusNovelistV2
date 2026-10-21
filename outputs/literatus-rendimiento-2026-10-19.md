# Revisión de rendimiento de Literatus

Fecha: 19 de octubre de 2026, America/Santiago.

## Resultado

La prioridad es reducir las consultas de la interfaz y la dependencia del backend para mostrar contenido público. Conviene conservar Vercel y Supabase inicialmente. Una migración de base de datos, por sí sola, no resuelve la suspensión de un backend gratuito ni las solicitudes duplicadas.

Se revisó el código local y se hicieron lecturas HTTP públicas del sitio y la API. No se ingresó a cuentas ni se consultó la configuración privada de Render/Supabase; los valores del panel pueden diferir de los predeterminados del repositorio. No se modificó la aplicación ni el despliegue.

## Evidencia del despliegue

- `https://www.novelatus.tech/` y `https://literatus-novelist-v2.vercel.app/` respondieron HTTP 200 con `Server: Vercel` y `X-Vercel-Cache: HIT`.
- Ambas direcciones entregan archivos principales distintos. Las mediciones del HTML no equivalen a medir la aplicación completamente cargada.
- En el JavaScript público de `literatus-novelist-v2.vercel.app`, `main-LF4VKAXV.js` importa `chunk-AOYHBXTD.js`, donde `apiUrl` apunta a `https://literatusnovelistv2.onrender.com/api/v1/`. Coincide con `frontend/src/environments/environment.prod.ts:3`.
- El blueprint local `backend/render.yaml:18` declara `plan: free`. Esto no confirma el plan efectivo del servicio actual.

## Mediciones públicas

Tiempos totales de solicitudes HTTP individuales desde el entorno de revisión, sin sesión de usuario. Cada solicitud fue independiente; no representan percentiles ni tiempos garantizados desde Chile. Las consultas de API de esta tabla se hicieron secuencialmente.

| Recurso | HTTP | Tiempo | Tamaño recibido |
| --- | --- | --- | --- |
| HTML de Vercel, dominio `literatus-novelist-v2.vercel.app` | 200 | 0,55 s | 121.367 bytes |
| HTML de `www.novelatus.tech` | 200 | 1,15 s | 82.645 bytes |
| `/api/health/`, servidor activo | 200 | 0,23 s | 47 bytes |
| `/api/v1/catalog/stats/` | 200 | 1,73 s | 157 bytes |
| `/api/v1/catalog/books/?page_size=12`, primera consulta de la serie | 200 | 1,60 s | 14.167 bytes |
| La misma consulta de libros, inmediatamente repetida | 200 | 0,26 s | 14.167 bytes |
| `/api/v1/catalog/genres/` | 200 | 1,09 s | 2.948 bytes |
| `/api/health/`, al terminar la serie | 200 | 0,24 s | 47 bytes |

La primera comprobación de salud previa a esta serie tardó 0,64 s. No se reprodujo ni midió un arranque tras suspensión. La diferencia al repetir el catálogo es consistente con la caché existente; los tiempos HTTP no permiten separar por sí solos SQL, conexiones, serialización y red.

Render documenta suspensión después de 15 minutos sin tráfico y reactivación de aproximadamente un minuto en su servicio web gratuito. Es una explicación posible para esperas largas tras inactividad, pendiente de correlacionar con logs del servicio: [Render Free](https://render.com/docs/free).

## Cambios gratuitos prioritarios

Las rutas siguientes parten de `respaldos-software/LiteratusNovelist-main/Producto/`. Estos hallazgos proceden del código local, que puede contener cambios aún no desplegados.

1. **Una respuesta liviana para portada.** `frontend/src/app/home/home.component.ts:227-229` inicia estadísticas, libros y géneros; `:288` pide 50 libros; `:300-304` pide detalles adicionales y espera el conjunto con `forkJoin`; `:353-377` agrega búsquedas de personajes y más detalles. Un recorrido completo por la portada puede sumar hasta 24 GET distintos como visitante, descontando los detalles compartidos por la caché. Preparar un JSON de portada con solo los campos y obras necesarios reduce consultas y permite publicar la versión pública en la CDN de Vercel. Actualizarlo al publicar, retirar o reclasificar libros.

2. **Compartir perfil e inventario por cuenta.** Al abrir portada con sesión, configuración, chat, aplicación, gamificación y portada solicitan independientemente `users/profile/`. Referencias: `frontend/src/app/app.component.ts:240-241,268-271,369-370`; servicios `settings.service.ts:106-107`, `chat.service.ts:70-81`, `gamification.service.ts:51-52`; `home/home.component.ts:385-386`. Crear una solicitud compartida e invalidarla tras cambios relevantes. Coordinar también el refresh del token, actualmente independiente por cada 401 en `core/interceptors/auth.interceptor.ts:38-49`.

3. **Medir y reutilizar conexiones a PostgreSQL.** `backend/config/settings.py:130-131` usa `CONN_MAX_AGE=0` por defecto y ya habilita `CONN_HEALTH_CHECKS`. Verificar primero el valor efectivo, modo del pooler y regiones de backend/base. Para este despliegue WSGI, evaluar 60 segundos de reutilización y comprobar errores/límites; no cambiar indiscriminadamente los parámetros del pooler. Referencias: [Django, conexiones persistentes](https://docs.djangoproject.com/en/6.0/ref/databases/) y [Supabase, pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).

4. **Reducir trabajo de SQL y serialización.** En `backend/catalog/views.py:129-130`, la ficha precarga capítulos completos; la acción `details` ejecuta luego `refresh_from_db()` en `:272`, descartando relaciones precargadas. Evitar recuperar todo el texto para una ficha e invalidar las precargas. `backend/catalog/serializers.py:16-18` hace un conteo adicional por autor; resolverlo mediante anotación del queryset. Evaluar índices con el plan real de consultas, no añadirlos a ciegas.

5. **Portadas pequeñas como archivos.** El cliente utiliza transformaciones de Supabase en `frontend/src/app/core/utils/cover-thumb.util.ts:18-20`. El plan Free no incluye esas transformaciones: [precios de Supabase](https://supabase.com/pricing). Comprobar el comportamiento del proyecto activo; generar WebP/AVIF pequeños al cargar las imágenes ofrece una alternativa gratuita.

Ya existen caché de catálogo de 300 segundos en backend y caché con deduplicación en memoria del frontend. El caché local desaparece al recargar/reiniciar y no equivale a un catálogo distribuido por CDN. Las respuestas actuales son privadas por sus filtros de edad (`backend/catalog/views.py:36-40`): el snapshot público debe tener una selección apta para visitantes, mientras perfil, biblioteca, saldos y respuestas personalizadas conservan autorización y privacidad.

## Opciones gratuitas

| Opción | Beneficio esperado para Literatus | Límite o trabajo necesario |
| --- | --- | --- |
| Conservar Vercel + Supabase y publicar portada pública estática | Evita despertar Django para mostrar la primera vista pública y reduce consultas | Implementar generación/actualización del JSON y respetar audiencia y edad; los datos personales siguen dependiendo del backend |
| Backend Django en Oracle Cloud Always Free | Permite mantener un proceso disponible y conservar la arquitectura Python | A1 actualmente incluye el equivalente a 2 OCPU y 12 GB RAM; requiere administrar el servidor, conseguir capacidad y atender posibles recuperaciones de instancias inactivas |
| PostgreSQL en Neon Free | Alternativa compatible con PostgreSQL si posteriormente se identifica la base como cuello de botella | Actualmente 1 GB y 100 CU-h/mes por proyecto; escala a cero tras 5 minutos inactivo. Cambiar solo la base conserva las limitaciones de Render |
| API pública en Cloudflare Workers + D1 | Permite servir consultas pequeñas sin un servidor Django dedicado para esa parte | Workers Free: 100.000 solicitudes/día; D1: 5 GB totales, 5 millones de filas leídas/día y 100.000 escritas/día. D1 usa semántica SQLite: requiere adaptar esa parte de la API y los datos, no es sustitución directa de PostgreSQL |

Fuentes de límites: [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Neon](https://neon.com/pricing), [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/). Consultadas durante esta revisión; no se midió el rendimiento de estos proveedores con Literatus.

Koyeb Free es otra posibilidad para alojar Django con pocos cambios, pero también se suspende, tras una hora sin tráfico, y ofrece 0,1 vCPU/512 MB: no garantiza una mejora de rendimiento. [Límites de instancias](https://www.koyeb.com/docs/reference/instances).

## Orden recomendado

Primero, JSON público de portada + deduplicación de perfil/inventario. Después, comprobar reutilización de conexiones, regiones y consultas de ficha/autores. Medir antes/después desde el mismo lugar, con sesión y como visitante. Si la espera importante ocurre exclusivamente al reactivar Render, evaluar Oracle para conservar Django o extraer las lecturas públicas a Workers. Neon queda como alternativa si las métricas de PostgreSQL justifican migrar.

Objetivos de validación: primera vista pública sin depender de Render; una petición de perfil por arranque de sesión; ausencia de acceso cruzado entre cuentas/edades; comparación de tiempos HTTP y número de consultas con caché vacía y con caché existente.
