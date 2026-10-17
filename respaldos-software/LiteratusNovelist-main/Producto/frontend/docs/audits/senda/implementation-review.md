# La Senda: mapa, premios y ajuste de paisajes

Revisión final: 2026-10-17.

## Resultado

La Senda contiene seis reinos de cinco unidades, 150 niveles, 30 castillos y 36 cofres adicionales. Cada reino tiene un único paisaje continuo detrás de sus cinco unidades. Se eliminaron la repetición por unidad, los cambios de zoom y las uniones con fundidos que recortaban las ilustraciones.

Los paisajes de escritorio usan un encuadre superior sin estiramiento. Los teléfonos cargan composiciones verticales propias de 1024 × 1536 mediante `picture`, en vez de ampliar una franja de una ilustración horizontal. Las versiones horizontales son de 1536 × 1024. Las doce imágenes WebP están en `src/assets/images/senda/`: `realm-{forest,lake,library,ruins,aurora,citadel}.webp` y `realm-{forest,lake,library,ruins,aurora,citadel}-mobile.webp`.

Arte creado con la herramienta integrada `image_gen.imagegen`. Los PNG originales se conservaron en su ubicación de generación. Los prompts completos, las referencias originales y los destinos del proyecto están en [art-prompts.json](art-prompts.json) y [mobile-art-prompts.json](mobile-art-prompts.json). La conversión a WebP no modifica el contenido de las ilustraciones.

## Movimiento y accesibilidad

- Bosque: 18 luciérnagas y dos mariposas con alas animadas.
- Lago: reflejos, ondas y estrellas plateadas.
- Biblioteca: tres libros abiertos flotantes y partículas.
- Ruinas: cristales, destellos y círculos rúnicos giratorios.
- Aurora: dos cortinas de luz y nieve.
- Ciudadela: tres faroles, luces y motas doradas.

Los efectos son SVG/CSS independientes de la foto. La franja central del sendero permanece despejada. Solo la escena que cruza el centro de la ventana mantiene su ambientación activa; las demás quedan pausadas. Se respeta la pestaña oculta y la preferencia de movimiento reducido. Las unidades conservan su pausa independiente para Maguito, banderas y cofres.

La barra de estado se coloca debajo del encabezado global usando sus medidas publicadas. Los enlaces a unidades alinean su encabezado al inicio del área disponible; los enlaces a cofres conservan el centrado. Los modales admiten teclado, Escape y restauración del foco.

## Premios y datos

Los cofres pequeños entregan 10 de Tinta tras superar con estrellas la sala de minijuegos. Los grandes entregan 30 de Tinta y una de seis prendas exclusivas tras superar realmente los 25 niveles de su reino. Los avances anteriores con estrellas cuentan; los niveles saltados con cero estrellas no habilitan sus premios.

`POST /api/v1/learning/chests/{code}/claim/` valida los requisitos en el servidor. La entrega bloquea el perfil y guarda Tinta, inventario y registro único por usuario/cofre en una sola transacción. Los reintentos no duplican premios, y la animación de apertura comienza después de confirmar la entrega. No modifica XP, racha, corazones ni ropa equipada.

La migración `learning.0007_path_chests_and_rewards` se probó en SQLite aislado y se aplicó después a la base configurada. La base contenía 100 niveles; el comando aditivo `seed_missing_path_units` creó solo las 10 unidades, 50 niveles y 50 ejercicios que faltaban. Una comparación de todos los campos e identificadores de las filas previas de unidades, niveles, ejercicios y progreso confirmó que permanecieron idénticos dentro de la misma transacción. Resultado real verificado: 30 unidades, 150 niveles, 150 ejercicios y seis premios exclusivos correctamente configurados.

## Verificación

- Backend: 63 pruebas aprobadas de aprendizaje, cofres, Bazar y logros; una prueba concurrente requiere PostgreSQL aislado y se omitió en SQLite. Otras tres pruebas aprobaron la ampliación aditiva, idempotencia y rollback.
- Frontend: 13 pruebas de Maguito/Bazar y 14 del mapa aprobadas; compilación estricta de Angular correcta.
- `npm run build`: correcto tras el ajuste final. Persisten los avisos previos de CommonJS y selectores de View Transitions.
- Navegador: escritorio y teléfono de 390 × 844, sin desbordamiento horizontal. Se verificaron seis escenas, 30 castillos, 36 cofres, una sola ambientación activa, partículas en ejecución y cambios reales en las transformaciones de los libros.
- Cuenta ficticia en SQLite local: cofre bloqueado, apertura de un cofre grande con 30 de Tinta y broche, premio visible en el Bazar y equipamiento mediante su botón normal. No se reclamaron premios ni se gastó Tinta de cuentas reales.
- Consola del mapa sin errores durante la revisión final.

Capturas en `scratch/` de la raíz: `senda-fit-desktop.png`, `senda-fit-mobile.png` y `senda-chest-mobile.png`. Registros: `senda-layout-tests.log`, `senda-cosmetics-tests-final.log`, `senda-backend-tests.log`, `senda-missing-path-tests.log` y `senda-final-build.log`.

La validación de solicitudes simultáneas con bloqueo real de filas queda preparada en `PathChestConcurrencyTests`; exige una conexión PostgreSQL de prueba explícita cuyo nombre empiece por `literatus_test`. No se usó la base compartida para ejecutar ese test.
