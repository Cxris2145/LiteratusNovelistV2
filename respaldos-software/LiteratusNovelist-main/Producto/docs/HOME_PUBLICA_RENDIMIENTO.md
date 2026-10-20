# Carga pública de la portada

La portada usa una respuesta pública agregada con estadísticas, portadas, clásicos,
géneros y personajes. El navegador hace una sola solicitud compartida entre los
consumidores de `HomeDataService`. Perfil y biblioteca siguen usando sus propias
API autenticadas; nunca se exportan a este JSON.

## Producción en Vercel

1. `GET /api/public-home` consulta el endpoint agregado a través de una reescritura
   de Vercel. Los encabezados del backend permiten almacenarlo durante cinco
   minutos en la CDN y revalidarlo después. El proxy se consulta sin JWT.
2. Si esa solicitud falla o supera 1,5 segundos, se carga
   `/assets/data/home-public.json`, servido por Vercel. Ese archivo permite mostrar
   contenido mientras Render despierta y solo se acepta durante 24 horas desde su
   generación. La solicitud omite la caché del service worker para obtener el
   archivo del despliegue actual.
3. Si el archivo falta, vence, es inválido o supera dos segundos, se consulta el
   endpoint agregado del backend directamente. Esta recuperación permite esperar
   al arranque de Render; puede tardar cuando el servicio gratuito está dormido.

La caché en memoria del navegador dura como máximo cinco minutos. La CDN permite
actualizar la portada después de cambios en el catálogo sin necesitar una nueva
compilación diaria. En una CDN fría y sin snapshot vigente, sigue siendo necesario
esperar al backend. Otros flujos, como abrir un libro o iniciar sesión, también
dependen del backend.

La respuesta debe tener `version: 1`, `audience: "public"`, fecha válida y solo
metadatos públicos. El validador compartido por navegador y exportador reconstruye
el DTO con una lista de campos permitidos, rechaza URLs inseguras, impone límites
de tamaño y nunca acepta una copia vencida indefinidamente.

## Compilación

En Vercel se mantiene `npm run build`. Antes de Angular, ese comando ejecuta el
exportador, que usa `fetch` de Node 22 sin dependencias adicionales:

`vercel.json` fija ese comando y la salida `dist/frontend/browser`, de modo que el
preset de Angular no omita la generación del JSON.

```sh
npm run snapshot:home
npm run build
```

El exportador consulta `https://literatusnovelistv2.onrender.com/api/v1/catalog/home/`
sin credenciales, con dos intentos y un timeout de 80 segundos por intento, para
permitir el arranque de Render. Escribe `src/assets/data/home-public.json` de forma
atómica. El archivo se genera en cada compilación y está excluido de Git.

Variables opcionales de compilación:

| Variable | Uso |
| --- | --- |
| `PUBLIC_API_URL` | Base de la API pública, incluyendo `/api/v1/`; por defecto usa el backend de Literatus. |
| `HOME_SNAPSHOT_URL` | URL completa de un endpoint público que devuelva el mismo DTO. |

Si cambias de backend, debes actualizar además `environment.prod.ts` y el destino
de `/api/public-home` en `vercel.json`. Las variables anteriores solo configuran
el exportador; no cambian automáticamente la configuración del navegador.

Si falla la API, el exportador puede conservar una copia anterior que siga siendo
válida. Si no existe una copia vigente, falla la compilación para mantener el
despliegue anterior en Vercel. Nunca sustituye el JSON por una respuesta de error.

Durante la primera actualización, si `/catalog/home/` todavía responde 404, el
exportador puede obtener estadísticas, géneros y libros de los endpoints públicos
anteriores. Filtra cada libro y detalle curado con `min_age === 0`, omitiendo edades
mayores o ausentes. Las fichas curadas se consultan con un máximo de cuatro
peticiones simultáneas. Este puente solo se ejecuta al compilar; el navegador nunca
repite las consultas antiguas. Cuando el nuevo endpoint está disponible, se utiliza
una sola petición también en la compilación.

En desarrollo y preview, el servicio usa la API local directamente para no mezclar
datos de producción con el entorno local. Para compilar localmente sin acceder a
producción, define `PUBLIC_API_URL=http://localhost:8000/api/v1/` o utiliza
`npx ng build --configuration development`.

## Verificación

```sh
npm run test:home-snapshot
npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/core/services/home-data.service.spec.ts
```

Las pruebas cubren exclusión de campos privados, restricciones de edad del puente,
caducidad, URLs, límites, conservación atómica del archivo y la cadena CDN → archivo
→ API sin encabezados de autenticación.
