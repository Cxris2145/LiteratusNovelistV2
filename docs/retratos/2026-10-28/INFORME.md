# Auditoría de cuentos y aventuras clásicas

Fecha: 2026-10-28T01:31:10.289445-03:00

Se revisaron los **200 libros vigentes** y sus **697 personajes**, excluyendo autores. La selección curatorial abarca **40 obras y 147 personajes**.

Al iniciar, **46 personajes seleccionados tenían foto** y deben reemplazarse; **101 no tenían imagen** y requieren creación. La existencia de una foto no fue un filtro para excluir personajes.

## Cambios aplicados y pendientes

- Retratos existentes reemplazados: **38**.
- Retratos nuevos publicados: **2**.
- Reemplazos pendientes: **8**.
- Personajes sin foto pendientes de creación: **99**.
- Entre los pendientes, generación bloqueada: **8**.

Los reemplazos usan archivos nuevos. Los archivos anteriores se conservan, y su correspondencia queda registrada por UUID en `auditoria-completa.json`. Cada publicación verifica el contenido público antes de enlazarlo al personaje.

## Criterio aplicado

- Cuentos maravillosos, fábulas narrativas y clásicos infantiles o juveniles de personajes reconocibles.
- Aventuras clásicas incluidas por confirmación expresa del usuario.
- Romeo y Julieta, Nuestra señora de París y Viaje al Centro de la Tierra se incluyen por referencia expresa, sin afirmar que sean cuentos infantiles.
- Tener retrato existente nunca excluye al personaje: requiere reemplazo; no tener imagen requiere creación.
- Se excluyen autores reales y se conservan identidades separadas por obra y edición.
- Los 846 libros retirados no se reintroducen ni se usan como catálogo vigente.

La categoría del catálogo no basta: `Cuentos e infantil` contiene obras de otros tonos, por ejemplo Sub Terra y La sala número seis. Se revisó cada título. Los candidatos fronterizos quedan separados y no se cambian automáticamente.

## Obras seleccionadas

| Obra | Personajes | Con foto al auditar | Sin foto al auditar |
|---|---:|---:|---:|
| Fábulas | 4 | 1 | 3 |
| Gato con botas | 5 | 0 | 5 |
| Hansel y Gretel | 5 | 3 | 2 |
| Heidi | 5 | 1 | 4 |
| Ivanhoe | 6 | 2 | 4 |
| Kim | 4 | 0 | 4 |
| La bella y la bestia | 3 | 0 | 3 |
| La flecha negra | 5 | 0 | 5 |
| La historia de Keesh | 3 | 2 | 1 |
| La isla del tesoro | 3 | 3 | 0 |
| La isla misteriosa | 5 | 0 | 5 |
| La leyenda de Sleepy Hollow | 3 | 0 | 3 |
| La llamada de lo salvaje | 3 | 0 | 3 |
| La maravillosa tierra de Oz | 4 | 0 | 4 |
| La Reina de las Nieves | 4 | 0 | 4 |
| La Reina de los Caribes | 3 | 0 | 3 |
| La Sirenita | 4 | 2 | 2 |
| La tempestad | 4 | 0 | 4 |
| La vuelta al mundo en ochenta días | 4 | 4 | 0 |
| Las Aventuras de Alicia en el País de las Maravillas | 3 | 1 | 2 |
| Las aventuras de Huckleberry Finn | 3 | 1 | 2 |
| Las Aventuras de Pinocho | 4 | 2 | 2 |
| Las aventuras de Tom Sawyer | 4 | 2 | 2 |
| Los tres mosqueteros | 3 | 3 | 0 |
| Los viajes de Gulliver | 3 | 0 | 3 |
| Nuestra señora de París | 3 | 3 | 0 |
| Oliver Twist | 3 | 1 | 2 |
| Ozma de Oz | 4 | 0 | 4 |
| Peter Pan y Wendy | 4 | 4 | 0 |
| Ratón Pérez | 3 | 0 | 3 |
| Robinson Crusoe | 3 | 1 | 2 |
| Romeo y Julieta | 3 | 2 | 1 |
| Sandokán: El Rey del Mar | 3 | 0 | 3 |
| Simbad el marino | 3 | 1 | 2 |
| Tristán e Isolda | 4 | 0 | 4 |
| Una casa de granadas | 4 | 0 | 4 |
| Veinte años después | 3 | 0 | 3 |
| Veinte mil leguas de viaje submarino | 4 | 4 | 0 |
| Viaje al Centro de la Tierra | 3 | 3 | 0 |
| Viaje alrededor de la luna | 3 | 0 | 3 |

## Imágenes que no pudieron completarse

- **Dr. Livesey**, La isla del tesoro: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **La Bruja del Mar**, La Sirenita: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **Alicia**, Las Aventuras de Alicia en el País de las Maravillas: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **El Hada Azul**, Las Aventuras de Pinocho: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **Pinocho**, Las Aventuras de Pinocho: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **Capitán Garfio**, Peter Pan y Wendy: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **Peter Pan**, Peter Pan y Wendy: el generador no produjo una salida aprobada; su imagen anterior se conserva.
- **Wendy Darling**, Peter Pan y Wendy: el generador no produjo una salida aprobada; su imagen anterior se conserva.

## Obras para revisar antes de ampliar el alcance

- Aventuras de Arthur Gordon Pym
- Frankenstein
- Hans Pfaall
- Herland
- Kappa
- La búsqueda en sueños de la ignota Kadath
- La Ilíada
- La Odisea
- La peste escarlata
- La reina Margot
- La Torre del Elefante
- La vida es sueño
- Las aventuras de Sherlock Holmes
- Las Fuerzas Extrañas
- Las indias negras
- Las Memorias de Sherlock Holmes
- Las siete tragedias
- Leyendas
- Metamorfosis
- Micromegas
- Moby Dick
- Mujercitas
- Prometeo encadenado
- Rima del anciano marinero
- Rob Roy
- Segunda parte del ingenioso caballero don Quijote de la Mancha
- Solomon Kane
- Viaje a la luna

## Verificación posterior

Se comprobaron de nuevo los 200 libros y los 697 personajes en una transacción de solo lectura: 40 retratos publicados coinciden con sus enlaces; los otros 657 personajes conservan sus imágenes anteriores. Errores: 0.

Los retratos iniciales y los fondos se generaron con la herramienta integrada `image_gen`. Los cuatro personajes adjuntos por el usuario se conservaron y montaron localmente con Python, con autorización explícita. Los prompts y las rutas de los PNG finales se reúnen en `prompts-y-procedencia.json`.

## Referencias fuera del catálogo

Cenicienta, Rapunzel, La bella durmiente y otras obras de cuentos figuran entre las retiradas. No se incorporan a esta selección ni se restauran. El inventario vigente coincide exactamente con los 200 títulos conservados por la auditoría anterior.

## Archivos versionados

- [Retratos y correspondencia de personajes](manifest.json).
- [Vista navegable](auditoria.html).
- [Decisiones de la auditoría](auditoria-completa.json).
- [Prompts y procedencia](prompts-y-procedencia.json).
- [Verificación de publicación](verificacion-publicacion.json).
