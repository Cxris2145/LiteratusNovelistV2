# Optimización de Literatus aplicada

Inicio: 19 de octubre de 2026. Publicación y comprobaciones: 20 de octubre de 2026 (America/Santiago).

Commit publicado: [9671e31](https://github.com/Cxris2145/LiteratusNovelistV2/commit/9671e317e0d1960f6f3fe61dff1f4c0cd388c9e6).

Compatibilidad de nombres de personajes: [8916304](https://github.com/Cxris2145/LiteratusNovelistV2/commit/8916304a4709130b5984293de0c8e3a89ba1960d).

## Cambios

- La portada dejó de solicitar estadísticas, libros, detalles y personajes por separado. Consume un único DTO público compartido.
- Vercel dispone de `/api/public-home`, con reescritura al nuevo endpoint agregado de Django y caché CDN de cinco minutos.
- Si esa respuesta tarda más de 1,5 segundos, la portada puede usar un snapshot público generado al compilar. El snapshot vence a las 24 horas; el siguiente fallback es la API agregada anónima.
- El perfil se comparte entre solicitudes simultáneas, sin guardar saldos y progreso con un TTL.
- La renovación de JWT se comparte entre solicitudes concurrentes y no repite los eventos de inicio de sesión.
- Los cambios de cuenta cancelan respuestas anteriores. Las escrituras invalidan una lectura de perfil todavía pendiente.
- La ficha del libro conserva sus relaciones precargadas y evita recuperar capítulos completos cuando ya tiene el conteo de palabras almacenado.
- Los datos públicos conservan filtros de edad y publicación. El JSON público no contiene perfiles, saldos, capítulos ni instrucciones privadas de personajes.

## Validación

- 37 pruebas Django de catálogo, edad, audiencias y nuevo endpoint: exitosas, SQLite local aislado.
- Una prueba adicional de nombres completos de personajes y prioridad de coincidencias: exitosa dentro de las 9 pruebas focalizadas del endpoint.
- 24 pruebas Angular/Karma/Edge sobre portada, caché por cuenta, solicitudes compartidas y renovación de sesión: exitosas.
- 8 pruebas Node del exportador y validador público: exitosas.
- Compilación de producción y comprobación de tipos: exitosas.
- Revisión independiente del contrato entre frontend, backend y snapshot: completada.

El build conserva advertencias previas de dependencias CommonJS y selectores de transiciones CSS; no impidieron compilar.

## Publicación y verificación

Vercel publicó el commit con éxito. El HTML entrega `main-VWREKUPT.js`, que contiene el nuevo circuito agregado y ya no contiene las consultas anteriores de portada.

El snapshot desplegado tiene 54.167 bytes, 50 libros para el muro, 11 clásicos y 7 personajes. Se verificaron esas secciones en el navegador, con cifras visibles y sin errores de consola.

![Portada publicada](/C:/Users/Cxris/Documents/LiteratusNovelist/outputs/literatus-portada-optimizada.png)

Vercel y el panel de Render confirmaron el despliegue de `8916304`. La API agregada y el proxy de Vercel respondieron HTTP 200 con el DTO público validado por el mismo módulo del navegador: 50 libros, 11 clásicos y 7 personajes.

Mediciones de `/api/public-home` después de llenar la caché, desde el entorno de revisión:

| Solicitud | Estado | Caché Vercel | Tiempo total |
| --- | --- | --- | --- |
| 1 | 200 | HIT | 330 ms |
| 2 | 200 | HIT | 334 ms |
| 3 | 200 | HIT | 332 ms |

Son tiempos del endpoint de datos, no de la página completa ni percentiles desde Chile. La primera respuesta de CDN sin caché tardó aproximadamente 2,48 s.

Se detectó y corrigió que el nombre almacenado «Julieta Capuleto» no coincidía exactamente con «Julieta». La selección nueva requiere coincidencia de nombre y libro y evita elegir otro personaje del mismo libro. El despliegue final y la tarjeta correcta de Julieta se verificaron en la API y en el navegador.

## Límites

El cambio reduce solicitudes y hace posible servir la portada pública desde la CDN. La lectura, el perfil y otras operaciones privadas siguen dependiendo de Render. El arranque de un servicio gratuito suspendido puede seguir afectando esas operaciones. Una CDN vacía sin snapshot vigente también necesita esperar al backend.

Documentación técnica: [HOME_PUBLICA_RENDIMIENTO.md](/C:/Users/Cxris/Documents/LiteratusNovelist/respaldos-software/LiteratusNovelist-main/Producto/docs/HOME_PUBLICA_RENDIMIENTO.md).
