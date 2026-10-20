# Plan: vista «Libro» en el lector de Literatus

Fecha: 2026-10-19 · Estado del código: `main` en `c1142fd` · **Solo plan: no se cambió código.**

La referencia son tus capturas del libro *Juegos para actores y no actores* en la Biblioteca Digital Duoc:

- **Tapa sola:** la tapa al abrir y la contratapa al final, cada una sola, con el libro cerrado.
- **Libro abierto:** dos páginas, con la tapa dura asomando alrededor, el lomo al centro y los cantos de hojas a los costados.
- **Folio:** el número de cada página, centrado abajo.
- **Flechas:** ‹ › fuera del libro, más |‹ ›| para ir al principio y al final.

La idea es inspirarse en esa experiencia sin copiar código ni recursos.

## Lo que decidiste (2026-10-19)

1. **Tres vistas:** **Libro** (nueva, por defecto), **Páginas** (la limpia de hoy) y **Desplazamiento**. Esto revierte en parte lo del 14 de octubre: la vista con tapa vuelve, pero como una opción más y no como la única.
2. **Paso de página en el escritorio:** una **hoja que se dobla** en 3D sobre el lomo, que sigue al mouse o al dedo. En el celular y con movimiento reducido, la página desliza o funde.
3. **Celular:** un **libro delgado**, de una página, con borde fino de tapa, canto de hojas a la derecha y sombra del lomo a la izquierda.

---

## 1. Anatomía de la vista Libro

```
ESCRITORIO (2 páginas)                                    fondo: superficie suave del tema
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                                                                          │
 │      ╔════════════════════════════════╤═════════════════════════════════╗│ ← tapa dura (borde 8–12 px)
 │      ║ DON QUIJOTE II                 │ CAP. 3 · DEL RIDÍCULO…         ▐║│ ← cabecera por página / cinta
 │   ‹  ║║ texto texto texto texto texto ░│░ texto texto texto texto texto ║║│  ›
 │      ║║ texto texto texto texto texto ░│░ texto texto texto texto texto ║║│
 │      ║║ texto texto texto texto texto ░│░ texto texto texto texto texto ║║│ ← cantos de hojas
 │      ║║               34              ░│░              35               ║║│ ← folio de cada página
 │  |‹  ╚════════════════════════════════╧═════════════════════════════════╝│ ›|
 │                                        ↑ lomo: sombra hundida + banda de tapa arriba y abajo
 └──────────────────────────────────────────────────────────────────────────┘
   Las barras ocultas (arriba: ← título 🔍 ☰ Aa ⋯; abajo: ▶ línea del libro) aparecen al
   tocar el centro y caen sobre el FONDO, no sobre el texto: el libro deja ese aire libre.

CELULAR (1 página, libro delgado)          TAPA (libro cerrado)        CONTRATAPA
 ┌───────────────────────┐▌                 ┌──────────────┐            ┌──────────────┐
 │░ DON QUIJOTE II       │▌                 │   portada    │            │  Sinopsis…   │
 │░ texto texto texto    │▌ ← canto         │    real      │     ›      │  Autor       │
 │░ texto texto texto    │▌                 │   del libro  │            │  Editorial   │
 │░         23           │▌                 │              │      ‹     │  ✦ Literatus │
 └───────────────────────┘▌                 └──────────────┘            └──────────────┘
 ↑ sombra del lomo
```

**Partes y de dónde sale cada dato.** No hace falta backend nuevo: todo llega ya en `GET library/inventory/<id>/`.

| Parte | Cómo se ve | Dato |
|---|---|---|
| **Fondo** | Superficie suave según el tema: lino cálido en claro, tela azul tinta en oscuro, negro en OLED. Solo con degradados CSS, sin fotos de pared ni de madera. | Tema del lector |
| **Tapa dura** | Borde de 8–12 px alrededor de las páginas, con una sombra bajo el libro. **Su color sale del color dominante de la portada** (se calcula una vez y se guarda); si no se puede leer la imagen, usa un tono de la marca. | `book_cover` |
| **Lomo** | Una sombra hundida en el borde interior de cada página y una banda de tapa arriba y abajo, al centro. | — |
| **Cantos** | Líneas finas a cada lado. El grosor del izquierdo crece con lo leído y el del derecho con lo que falta (hasta ~14 px cada uno). Al tocarlos se pasa página, como antes. | Posición en el libro |
| **Cabecera por página** | Título del libro en la página izquierda y capítulo en la derecha, en versalitas. | `bookTitle`, `chapterTitle` |
| **Folio** | El número de cada página, centrado abajo: **numeración continua del libro** (sección 4). | Páginas medidas o estimadas |
| **Marcador** | Una **cinta** colgando desde arriba de la página derecha, en vez de la esquina doblada. La tecla **B** sigue sirviendo. | Marcadores actuales |
| **Flechas** | ‹ › y \|‹ ›\| quedan en el fondo, **fuera del libro**, así que se pueden ver siempre en el escritorio sin tapar texto. \|‹ ›\| llevan al inicio y al fin del capítulo. | — |
| **Tapa (libro cerrado)** | La portada real sola, con un leve relieve de tapa dura. | `book_cover` |
| **Portadilla** | La primera página antes del capítulo 1: título, autor, editorial y año, más un *ex libris*: «Este libro pertenece a ‹tu nombre›». | `edition.publisher`, `published_date`, usuario |
| **Contratapa** | Sinopsis, autor y el logo «Literatus Novelist» en Cinzel. | `edition.book.synopsis` |

**Tamaño.**

- **Escritorio:** el libro abierto tiene la proporción de un libro (cada página ≈ 2:3). Se ajusta al alto disponible, con un margen de ~56 px arriba y abajo para las barras, y no pasa de un ancho de lectura cómodo.
- **Celular:** el libro delgado ocupa toda la pantalla, menos unos 10 px de canto y lomo.

**Temas.** Cada uno de los 5 temas (claro, sepia, gris, oscuro y OLED) tiene su tapa, su fondo y su sombra del lomo:

- **OLED:** la tapa casi no se ve (solo filos), para no encender píxeles.
- **Alto contraste:** bordes sólidos y sin degradados.
- **Transparencias reducidas** (`prefers-reduced-transparency`): todo sólido.

---

## 2. Cómo se arma, sin romper lo que ya funciona

**Lo que se aprende del libro abierto de septiembre (`2cb54d4`, `reader-book.component.css`):**

- Sus fallas no venían del aspecto de libro, sino de que el libro tenía **su propia maquetación y sus propias barras de íconos encima de las páginas**.
- Por eso, en el celular los botones se montaban unos sobre otros, y el avance automático, el brillo o el ancho de columna no funcionaban en esa vista.

**Regla del nuevo plan:** la vista Libro es **solo un marco** alrededor del mismo paginador de hoy (`reader-pager.ts`: columnas CSS dentro de una ventana fija).

- **El paginador:** el texto, las palabras `word-N`, la narración, los subrayados, los post-its, la búsqueda y la regla siguen usando el mismo lienzo.
- **Lo que cambia:**
  - la ventana de lectura pasa a ser el **bloque de texto de las dos páginas**;
  - la separación entre columnas pasa a ser los dos márgenes interiores más el lomo;
  - el marco (tapa, cantos, papel y folios) se dibuja detrás y no recibe toques, salvo los cantos y la cinta.
- **Los controles:** siguen siendo los de hoy (`app-reader-chrome`, Más, Aa, Índice). No vuelven las barras de íconos sobre las páginas.

**Piezas nuevas,** para que `reader.component.ts` (hoy 2.763 líneas) no crezca:

| Pieza | Qué hace |
|---|---|
| `reader-book/reader-book-frame.component` | Dibuja el marco: tapa, lomo, cantos, papeles, cabeceras, folios y cinta. Recibe columnas, avance, tema y portada; no tiene lógica de lectura. |
| `reader-book/reader-book-covers.component` | Tapa, portadilla con ex libris y contratapa. |
| `reader-book/reader-book.css` | Estilos de la vista Libro por tema (reemplaza lo que en `reader-paged.css` es del modo Páginas). |
| `reader-book-geometry.ts` (funciones puras, con spec) | Tamaño del libro según la ventana, grosor de los cantos, color de la tapa y folios. |
| `reader-page-flip.ts` (con spec) | Ángulo de la hoja según el arrastre, decisión de terminar o volver (por velocidad y posición) y el resorte. |
| `reader-page-snapshot.ts` (con spec) | Arma las «fotocopias» de páginas para la animación (sección 3). |

**Ajustes:**

- `layoutMode: 'book' | 'paged' | 'scroll'` y `pageTurn: 'flip' | 'slide' | 'none'`, migrados en `reader-settings.ts` (la clave `reader-settings-v2` ya migra los formatos viejos).
- `'paged'` era el valor de fábrica, así que no se sabe quién lo eligió a propósito. Por eso, **una sola vez**, `'paged'` pasa a `'book'`; `'scroll'` se queda como está.
- En Aa, «Vista» queda así: Libro · Páginas · Desplazamiento. «Paso de página» queda así: Hoja · Deslizar · Sin animación. Si la vista es Libro de una página o hay movimiento reducido, «Hoja» se comporta como Deslizar o Fundido.

---

## 3. La hoja que se dobla (escritorio, dos páginas)

**El problema.** Hoy el capítulo es un solo lienzo de columnas que se traslada, así que solo puede mostrar **un pliego seguido**. Mientras una hoja gira hacia adelante, se ven a la vez cuatro páginas que no son seguidas:

```
 antes:   [ 34 | 35 ]
 durante: izquierda = 34 (hasta que la hoja la tape) · hoja: frente = 35, reverso = 36 · derecha = 37
 después: [ 36 | 37 ]
```

**La solución (recomendada): fotocopias de páginas solo durante el giro.**

1. Para cada página que hace falta, `reader-page-snapshot.ts` copia **solo los párrafos de esa página** en una caja de una columna del mismo ancho. Así el texto corta las líneas igual que en el lienzo.
2. Luego sube la copia hasta la primera línea de la página y la recorta en su última línea. Las palabras copiadas pierden su `id`, para no duplicarlo.
3. Las copias se preparan mientras no pasa nada (`requestIdleCallback`), para la página siguiente y la anterior. Son ~300 palabras cada una, unos pocos milisegundos.
4. Durante el giro:
   - el lienzo real salta sin animación al pliego nuevo;
   - encima, una **hoja** con dos caras (`transform-style: preserve-3d`) gira `rotateY` sobre el lomo, con perspectiva;
   - una copia fija de la página que se va mantiene la vista anterior hasta que la hoja la tapa.
5. Se agrega luz y sombra: un degradado en las caras que se oscurece cerca de los 90° y una sombra que la hoja proyecta sobre la página de abajo.
6. Al terminar, se quitan las copias y solo queda el texto real. La hoja no recibe toques y es `aria-hidden`: lectores de pantalla, selección y narración solo ven el texto real.

**Cómo se mueve** (según *apple-design*):

- **Clic, flecha, Espacio o costado:** un giro completo de ~500 ms con un resorte sin rebote.
- **Arrastrar desde un costado o una esquina:**
  - la hoja sigue al mouse o al dedo 1:1;
  - al soltar, el giro termina o vuelve según **la velocidad** y la posición;
  - el giro sale desde el ángulo en que estaba, con la misma velocidad, sin saltos.
- **Se puede interrumpir:** agarrar la hoja a mitad de camino la detiene; pasar varias páginas rápido encadena los giros sin esperar.
- **Esquina:** al acercar el mouse a la esquina inferior, esta se levanta 10–15°, como una pista de que se puede tirar.
- **Bordes:** en la primera y la última página del libro, la hoja se resiste (efecto elástico) en vez de girar.
- **Movimiento reducido:** fundido de 120 ms, como hoy.

**Entre capítulos.** El reverso de la última hoja de un capítulo es la primera página del siguiente, que todavía no está en el lienzo. El siguiente capítulo ya se prepara por adelantado (`ChapterCache(3)`), así que su primera página se copia desde ahí, con su título grande de capítulo. **Si esa copia no está lista, ese giro desliza en vez de doblar,** y nunca hay que esperar.

**Lo que se descartó:**

| Opción | Por qué no |
|---|---|
| Bibliotecas de flipbook (StPageFlip y similares) | Necesitan cada página como un elemento propio desde el comienzo. Eso obliga a rehacer la paginación y arriesga la narración, los subrayados, los post-its y la búsqueda, que dependen del lienzo único. |
| Fotos de la página (html2canvas y similares) | Son lentas en el celular, pierden calidad en las fuentes y no siguen el tema. |
| Doblez curvo realista, tipo *turn.js* | Necesita geometría de recortes y es más frágil. Queda como pulido opcional, después de tener la hoja rígida con luz y sombra. |

---

## 4. Numeración y avance

- **Folio continuo:** la página 34 del libro, no la página 2 del capítulo. Así se calcula:
  - cada capítulo empieza donde terminó el anterior;
  - los capítulos ya visitados con la **misma letra y pantalla** usan su conteo medido, guardado por diseño;
  - los demás se estiman con las palabras por página del capítulo actual.
  - Así el número no salta mientras lees. Solo se recalcula si cambias la letra, el tamaño o la pantalla.
- **Capítulos nuevos:** cada uno empieza en un pliego nuevo, a la izquierda, como hoy. Si el anterior terminó en una página izquierda, la derecha queda **en blanco** (los libros también las tienen).
- **Barra inferior:** muestra «Págs. 34–35 de 612 · cap. 3 · 6 %». Arregla el «Pág. 1» actual con dos páginas.
- **Cantos:** el grosor sale de la misma cuenta.
- **Para citar:** la ficha ya trae `page_count` (palabras ÷ 230). Se puede mostrar como «pág. de referencia» en «Copiar cita» más adelante, sin mezclarla con el folio.

---

## 5. Tapa, portadilla y contratapa

- **Libro nuevo** (sin avance): abre **cerrado, en la tapa**, con una pista «Toca para abrir». Al tocar o pasar página, la tapa gira y aparece la portadilla y el capítulo 1.
- **Libro empezado:** abre directo en tu página, como hoy («Sigues en la pág. 34 · cap. 3»). La tapa queda a un «‹» de la primera página.
- **Final del libro:** pasar la última página muestra la contratapa (libro cerrado). Todo lo que pasa hoy al terminar un libro (progreso, logros) se mantiene.
- **Una página (celular):** la tapa y la contratapa son una página cada una.
- **Accesibilidad:** la tapa tiene texto alternativo («Tapa de *‹título›*, de ‹autor›»). La portadilla y la contratapa son texto real, legible por lectores de pantalla.

---

## 6. Cómo convive con cada función

| Función | En la vista Libro |
|---|---|
| Barras ocultas, Más, Aa, Índice, Buscar | Iguales. Las barras caen sobre el fondo. |
| Narración (Azure) y pestaña en el margen | Igual. La pestaña se ubica en el margen exterior de la página, dentro del papel. Si la narración llega al fin del pliego, la página pasa con la hoja (o deslizando con movimiento reducido). |
| Subrayados, menú de selección, diccionario | Iguales: viven en el lienzo. Mientras gira la hoja, la selección se cierra. |
| Post-its | Siguen en el margen de cada página. `layoutMarginPostIts` debe medir los márgenes del papel y no los de la ventana. Se arrastran igual. |
| Búsqueda y saltos | Saltar a otra página no hace girar 20 hojas: el cambio es directo, con un fundido corto. |
| Regla de lectura, foco, biónica | Iguales. La regla se ajusta al bloque de texto de cada página. |
| Atenuar | Cubre el papel y la tapa. El fondo se oscurece algo más. |
| Avance automático | Pasa la página con la hoja, al ritmo de lectura. |
| Personajes y Cuaderno | Sin cambios. |

---

## 7. Plan por etapas

Todo se prueba en la copia aislada (frontend 4310 + backend SQLite 8013), sin tocar tus 4200/8000 ni Supabase. Ninguna etapa necesita migraciones.

| Etapa | Qué | Cómo se prueba | Tamaño |
|---|---|---|---|
| **0. Prototipo** | Una página HTML suelta (artifact privado) con un pliego de *Don Quijote* (dominio público), tapa, lomo, cantos y **la hoja que se dobla con el mouse**. Sirve para que apruebes el aspecto y el giro antes de tocar Angular. | Tú lo pruebas en el navegador y en el celular. | S |
| **1. Marco del libro** | `layoutMode: 'book'` y la migración, el marco (fondo, tapa, lomo, cantos, papel, cabecera por página, folio), el tamaño en 2 y 1 páginas, los 5 temas, el alto contraste, la cinta del marcador y las flechas fuera del libro. Se pasa página deslizando, como hoy. | Specs de la geometría y los ajustes. Capturas a 1366×820, 1440×900, 375×812 y 844×390. `elementFromPoint` sobre los controles. | M |
| **2. Tapa, portadilla y contratapa** | Libro cerrado al empezar y al terminar, color de tapa desde la portada, ex libris y sinopsis. | Specs de los bordes virtuales del paginador: anterior desde la pág. 1 lleva a la tapa; siguiente desde la última lleva a la contratapa. | S |
| **3. Folio continuo** | Numeración del libro, «Págs. 34–35 de 612» y cantos proporcionales. | Specs: el número no salta al pasar capítulos; se recalcula al cambiar la letra. | S |
| **4. Hoja que se dobla** | Fotocopias de páginas, hoja 3D con luz y sombra, clic y teclado, arrastre con velocidad y resorte, esquina que se levanta, efecto elástico en los bordes, giro entre capítulos, y Deslizar o Fundido de respaldo. | Specs de `reader-page-flip` y `reader-page-snapshot` (la copia calza línea a línea con el lienzo). Medición en el panel visible: sin tareas largas al girar y fotocopia en menos de 8 ms. | L |
| **5. Integración** | Post-its, pestaña de narración, regla, atenuar, avance automático, búsqueda y OLED en la vista Libro. | Specs de interacciones con la vista Libro, más capturas en los 5 temas. | M |
| **6. Verificación** | Build de producción, detector de *impeccable*, Safari (el 3D de WebKit pide prefijos) y un **teléfono real**. | Lista de chequeo y capturas. | S |

**Orden:** 0 → 1 → 2 → 3 → 4 → 5 → 6.

- La etapa 1 ya deja la vista Libro usable, porque pasa página deslizando.
- La 4 es la más difícil, y se hace con el marco ya probado.
- Las mejoras de la propuesta anterior (la página en la URL y «Atrás», «Ir a…», la rueda, la búsqueda agrupada, las Notas en el Índice) siguen vigentes. Se pueden hacer después de esta etapa 6, o intercalar «Ir a…» y la rueda en la etapa 1 si quieres.

**Riesgos y cómo se cubren:**

- **La fotocopia no calza 1:1 con la página** (viudas y huérfanas). Se recorta por la primera y la última palabra reales de la página, no por la cantidad de renglones, y un spec lo compara con el lienzo.
- **Celulares lentos:** ahí no hay hoja 3D (desliza), y las fotocopias solo se arman en el escritorio.
- **Safari:** necesita `-webkit-backface-visibility` y un manejo cuidadoso de `preserve-3d`. Se prueba en la etapa 6.
- **Las fuentes cargan tarde:** las copias se preparan después de `document.fonts.ready`.
