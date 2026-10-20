# Lector de Literatus: auditoría y propuesta inspirada en la Biblioteca Digital Duoc

Fecha: 2026-10-19 · Estado del código: `main` en `c1142fd` · **Solo auditoría y propuesta: no se cambió código.**

**Método:**

- **Literatus:** revisé el código del lector (`respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/library/reader/`), las capturas de la Fase 6 del e-reader y las memorias de decisiones anteriores.
- **Duoc:** revisé el visor en el panel del navegador, con la sesión que abriste tú. Probé tres tamaños emulados (375×812, 846 px de ancho y 1366×820), no un teléfono real.
- **Skills:** usé la guía de crítica de *impeccable* (heurísticas de Nielsen, carga cognitiva, personas) en un solo contexto, sin sub-agentes, más su detector automático. También usé *apple-design* (gestos, materiales, movimiento reducido) y *mobile-native* (celular).

**Capturas de Duoc:** están en `side-session-notes\local_454aaa4d-…\capturas-duoc\`, fuera del repo, porque muestran páginas de un libro con derechos de autor: no las subas a GitHub. En el repo solo queda [duoc-acceso-ezproxy.jpg](duoc-acceso-ezproxy.jpg), la pantalla de acceso.

---

## 1. Auditoría del lector de Duoc (lo comprobado)

**Acceso.**

- **Usuarios Duoc:** «Acceso a Recursos Digitales Bibliotecas Duoc UC», con la cuenta Microsoft de Duoc.
- **Invitado:** usuario y contraseña que entrega Duoc.

**Qué es.**

- **Visor:** es un visor de tipo flipbook, del producto comercial *FlippingBook*. La página define `window.FBPublication` y sus archivos están en `files/assets/…`.
- **Este recurso:** es un **extracto de 25 páginas** (Parte 1, Capítulo 1, «Los gerentes y usted en el lugar de trabajo») del libro *Administración* (2018).
- **Libro completo:** el botón «Ver libro completo» abre otra publicación en una pestaña nueva. No lo abrí.

**Carga.**

- Primero aparece una pantalla con el título, una miniatura de la portada y el logo de Duoc.
- La primera vez, sobre la página sale un aviso «Clic para leer».

**Formato de las páginas.**

- **Cada página es una imagen JPG** del PDF impreso (`page-html5-substrates/page0005_2.jpg`), en varias resoluciones. Al hacer zoom pide una imagen más grande: se ve borrosa, con un indicador de carga, hasta que llega la nítida.
- **En la página no hay texto real:**
  - no se puede seleccionar, copiar, subrayar ni anotar;
  - el lector de pantalla solo oye «Página».
- **Diseño del texto:** tipografía, columnas, recuadros («FYI», «Perspectiva del futuro», «En la práctica») y colores son los del libro impreso. El visor no cambia nada de eso.

**Ambiente.**

- Pared clara con textura, una franja de madera abajo y el logo de Duoc abajo a la derecha.
- La interfaz usa Open Sans.

**Distribución.**

- **Una página a la vez, centrada,** también a 1366×820. No vi pliego de dos páginas.
- Las páginas vecinas esperan a los lados y la página se desliza en horizontal.

**Controles.** Las barras están **siempre a la vista**. Solo se esconden con zoom en el celular.

| | Arriba | Costados | Abajo |
|---|---|---|---|
| **Celular (375)** | Título · Lupa | › sobre la página | Miniaturas · «1 / 25» · logo |
| **846 px** | Título · Lupa | ‹ › grandes y translúcidos | Miniaturas · «5 / 25» · logo |
| **Escritorio (1366)** | «Administración \| páginas: [ 4 ] / 25» · «Ver libro completo» · Lupa | ‹ › grandes, con \|‹ ›\| (primera y última) debajo | Miniaturas · Acercar zoom · Pantalla completa |

**Navegación probada:**

- **Funciona:**
  - flechas en pantalla;
  - **campo de página**: escribí 12 y saltó;
  - **rueda del mouse**: pasa una página;
  - **una URL por página** (`…/12/`): el botón **Atrás del navegador vuelve a la página anterior** (13 → 12);
  - el zoom queda en la URL (`#zoom=true`).
- **No funcionó en mis pruebas:** las flechas del teclado, Av Pág, Inicio y Fin.
- **No lo confirmé:** el arrastre con el mouse ni el gesto con el dedo (para eso hace falta un teléfono).

**Miniaturas.**

- **En el celular:** una hoja a pantalla completa, con una cuadrícula de 2 columnas.
- **En el escritorio:** una columna a la izquierda, que corre la página hacia la derecha.
- **En ambos:** la página actual tiene borde azul y el número va debajo.

**Búsqueda.**

- **Hoja:** «Buscar», con un campo y un botón «Filtros», cuyas opciones no logré ver.
- **Resultados:** sale «12 páginas encontradas», **agrupados por página**. Por ejemplo, «p. 5 — …durante mucho **tiempo**, ahora…» y «…y 11 resultados más en esta página».
- **Al tocar un resultado:** salta a la página y **pinta la palabra en amarillo**. Las marcas quedan en todas las páginas mientras dura la búsqueda.
- **Calidad:** el texto buscable sale de un OCR y tiene errores a la vista («s.^-», «inteiT»).

**Zoom.**

- **Cómo se activa:** con doble clic, doble toque o el botón.
- **Cómo funciona:** tiene **un solo nivel** (≈2× en escritorio) y el mismo botón lo quita.
- **En el celular:** esconde las barras.
- **Desplazamiento:** la rueda no movió la página ampliada.

**Numeración.**

- **Dos numeraciones:** el visor dice «12 / 25», pero el folio impreso de esa página dice 13.
- **No recuerda dónde quedaste:** al volver a abrir el libro, parte en la página 1.

**No vi:**

- índice o tabla de contenidos;
- marcadores, notas ni subrayado;
- ajustes de letra o tema, ni modo noche;
- narración;
- descarga ni impresión.

---

## 2. El lector actual de Literatus

| Área | Hoy |
|---|---|
| **Vistas** | Páginas (1 en celular o vertical; 2 si el ancho es ≥ 1000 px y la proporción ≥ 1,25) y Desplazamiento. La vista con tapa se quitó el 2026-10-14, por decisión tuya. |
| **Pasar página** | Tocar un costado, flechas, Espacio, Re Pág/Av Pág y deslizar con el dedo (la página sigue al dedo y resiste en los bordes). Animación «Deslizar» o «Sin animación»; con movimiento reducido, fundido. **La rueda del mouse no hace nada en Páginas** (no hay código para ella). |
| **Controles** | Ocultos. Aparecen al tocar el centro. Arriba: ←, título, Buscar, Índice, Aa, Más. Abajo: Escuchar, voz, línea del libro y posición. |
| **Posición** | Se guarda en el servidor y se retoma al abrir. **La URL no cambia al pasar página**, así que «Atrás» sale del lector. |
| **Índice** | Pestañas Contenido y Marcadores, aviso de «Resumen hasta donde voy», Buscar y Vocabulario. |
| **Marcadores** | Esquina doblada, tecla **B** y lista con fragmento y página. |
| **Subrayado y notas** | 4 colores. Post-its en el margen (máximo 30 por libro), fuera del menú de selección por decisión tuya. |
| **Búsqueda** | Ctrl+F y una lista de fragmentos sueltos (hasta 500). Pinta solo el resultado activo. Barra ‹ › con «volver a donde estaba». |
| **Aa** | Hoja de ajustes de lectura, con 3 pestañas y 13 grupos: 12 tipografías, 5 temas, tamaño de 14 a 32, interlineado, márgenes, alineación, espaciados, atenuar, alto contraste, biónica, foco, regla, sin distracciones, avance automático, ritmo, tiempo restante y pausas. |
| **Narración** | Azure, 6 voces, velocidad 0,5–2×, resaltado de la palabra y controles en la pantalla bloqueada. |
| **IA y estudio** | Personajes (ventana rápida), «Preguntar a personaje» con lo seleccionado, Resumen hasta donde voy, diccionario, flashcards, Vocabulario y Cuaderno flotante (con PDF). |
| **Accesibilidad** | Texto real con `aria-live` («Páginas N y N+1 de M»), foco atrapado en las hojas, Escape, controles de ≥ 44 px y movimiento reducido. |

### Puntaje de diseño (heurísticas de Nielsen, 0–4)

| # | Heurística | Nota | Lo principal |
|---|---|---|---|
| 1 | Estado visible | 3 | Con dos páginas, la barra dice «Pág. 1 de 17» (debería decir «Págs. 1–2»). Las páginas se reinician en cada capítulo. |
| 2 | Parecido al mundo real | 3 | Cabecera viva, capitular y folio, como un libro. Pero un libro no reinicia la numeración en cada capítulo. |
| 3 | Control y libertad | 3 | Tras saltar por el Índice, la línea del libro o un marcador **a otro capítulo**, no hay forma de volver: «Volver a mi lectura» solo busca dentro del capítulo abierto y «Atrás» del navegador sale del lector. Duoc sí lo resuelve, con una URL por página. |
| 4 | Consistencia | 2 | Ver el detalle bajo la tabla. |
| 5 | Prevención de errores | 3 | Confirmación para reiniciar el audio y «Deshacer» al restablecer. |
| 6 | Reconocer antes que recordar | 2 | Nada enseña a tocar el centro. Los subrayados y post-its no se pueden listar dentro del lector. Los atajos no aparecen en ninguna parte. |
| 7 | Flexibilidad y eficiencia | 3 | Hay muchos atajos, pero falta «ir a la página N» (Duoc lo tiene siempre a la vista). Ctrl + / − hace zoom del navegador y la rueda no pasa página. |
| 8 | Estética y sobriedad | 3 | La página es limpia. Aa es pesada (13 grupos, ~45 controles) para quien solo quiere agrandar la letra. |
| 9 | Recuperarse de errores | 3 | «Reintentar» en el resumen y avisos en la narración. |
| 10 | Ayuda | 1 | No hay guía de gestos ni hoja de atajos. |
| | **Total** | **26/40** | Lo habitual en interfaces reales es 20–32. |

**Detalle de la heurística 4 (consistencia):**

- El menú de selección usa emojis (📖 🗂️ ▶️ 🎭 ⚠️); el resto usa íconos Material.
- Hasta cuatro pastillas flotantes compiten abajo: búsqueda, «Volver a mi lectura», «Quitar marca» y temporizador.

**Detector automático (35 avisos):**

- **Rebotes:** 7 curvas con rebote, en el menú de selección y en los avisos.
- **Contraste en la hoja de Narración:** 6 casos. «Gratis» en `#fbbf24` sobre papel claro da 1,7:1, y las insignias «HD», «WASM» y «Nativo» quedan entre 3,7 y 4,47:1. Esos nombres además son jerga.
- **Texto:** 1 texto de 11,2 px, 1 interlineado de 1,2, 3 textos con degradado y 4 usos de Open Sans en Aa.
- **Animaciones:** 3 transiciones de ancho o relleno.
- **Falsos positivos:** las 5 «imagen sin src» (usan `[src]`) y la cinta del marcador.

---

## 3. Comparación Duoc ↔ Literatus

| Aspecto | Duoc (comprobado) | Literatus hoy | ¿Quién gana? |
|---|---|---|---|
| Formato | Imagen de página impresa; el diseño original se mantiene | Texto real que se adapta a la pantalla | Literatus para leer; Duoc para «ver el libro tal cual» |
| Seleccionar y copiar | No se puede | Sí | Literatus |
| Accesibilidad | La página es una imagen sin texto | Texto real, temas, foco y narración | Literatus |
| Una o dos páginas | Siempre una, que se desliza | 1 o 2 según la pantalla | Literatus |
| Controles | Siempre visibles | Ocultos; se tocan al centro | Depende: Duoc se descubre solo, Literatus da más espacio |
| Flechas en pantalla | Grandes, a los costados, con primera y última | Zonas de toque invisibles | **Duoc** (se descubre) |
| Ir a página | Campo «páginas: [ N ] / 25» siempre a la vista | Solo el deslizador | **Duoc** |
| Atrás del navegador | Vuelve a la página anterior (una URL por página) | Sale del lector | **Duoc** |
| Rueda del mouse | Pasa página | No hace nada en Páginas | **Duoc** |
| Teclado | No funcionó en mis pruebas | Flechas, Espacio, Re Pág/Av Pág, B y Ctrl+F | Literatus |
| Índice | No hay | Contenido + Marcadores | Literatus |
| Miniaturas | Cuadrícula (celular) o columna (escritorio), con la actual marcada | No hay | Duoc (aunque en texto adaptable tienen menos sentido) |
| Búsqueda | Agrupada por página, con conteo, y todas las coincidencias pintadas | Fragmentos sueltos; pinta solo el activo; con «volver» | Empate: Duoc ordena mejor, Literatus vuelve atrás |
| Zoom | Doble toque o botón, 1 nivel, imagen nítida | Tamaño de letra en Aa | Literatus para leer; Duoc para imágenes |
| Numeración | Dos numeraciones (visor 12, folio 13) | Por capítulo + % del libro | Ninguno: los dos confunden |
| Retomar lectura | No: vuelve a la página 1 | Sí: «Sigues en la pág. N» | Literatus |
| Marcadores, notas y subrayado | No hay | Sí | Literatus |
| Ajustes, temas y modo noche | No hay | Muy completos | Literatus |
| Narración e IA | No hay | Azure, personajes, resumen y diccionario | Literatus |

**Conclusión:** Literatus ya supera al visor de Duoc en casi todo lo que importa para leer. Lo que vale la pena tomar de Duoc es **cómo se ubica y se mueve uno dentro del libro**: la página en la URL con «Atrás», el campo de página a la vista, la rueda, las flechas que se ven, la búsqueda agrupada y el zoom de imágenes. Su aspecto (pared, madera, barras fijas, páginas como imagen) no conviene copiarlo, y además choca con lo que elegiste el 14 de octubre.

---

## 4. Funciones que faltan

**Tomadas de Duoc, adaptadas a texto real:**

1. **La posición en la URL.**
   - Al pasar página, la URL cambia sin crear historial (`replaceState`).
   - Al saltar por el Índice, la línea del libro, un marcador, la búsqueda o el Vocabulario, se agrega una entrada (`pushState`). Así **«Atrás» vuelve a donde estabas**, también entre capítulos.
   - De paso, cada pasaje tiene un enlace. El Cuaderno ya usa `?ir=<capítulo>:<palabra>`, así que se reutiliza ese formato.
   - Se complementa con un botón visible «← Volver a la pág. X» tras cada salto.
2. **Campo «Ir a…» a la vista.**
   - En el escritorio, la posición de la barra inferior se vuelve editable: «Pág. [ 12 ] de 17».
   - Acepta página, porcentaje («50 %») o capítulo («cap 7»).
3. **Rueda del mouse en Páginas.** Un giro pasa una página, con una pausa breve para no saltarse varias. Es solo para mouse (`pointer: fine`).
4. **Flechas que se ven en el escritorio.** Unas ‹ › tenues aparecen al acercar el mouse a un costado (`hover: hover`). En el celular no aparecen: ahí basta tocar el costado.
5. **Búsqueda agrupada por capítulo.**
   - Cada grupo dice «Cap. 3 · 7 resultados».
   - En la página se pintan tenues todas las coincidencias, y fuerte la activa.
6. **Avance por capítulo en el Índice, en vez de miniaturas.** Las miniaturas de páginas no sirven si el texto se re-maqueta. Su equivalente útil es que cada capítulo muestre su barra de avance, sus páginas y cuántas notas tiene, con el capítulo actual marcado (como la miniatura azul de Duoc).
7. **Zoom de imágenes de escena:** con doble toque o pellizco dentro de la imagen ampliada.

**Propias de Literatus (de la auditoría):**

8. **Numeración clara:**
   - con dos páginas, «Págs. 12–13 de 17 · cap. 3»;
   - **opción a decidir:** una *página de referencia* fija por libro (por ejemplo, cada 250 palabras), que no cambie con la letra ni con la pantalla, para citar en trabajos. Así se evita el problema de Duoc, con dos numeraciones distintas.
9. **Pestaña «Notas» en el Índice:** subrayados y post-its, con filtro por color y capítulo, «Ir al pasaje» y «Ver en el Cuaderno». Los datos ya están en `ReaderAnnotationsService`.
10. **Copiar cita** (con título, autor y capítulo) y **Buscar lo seleccionado** en el menú de selección. Los post-its siguen fuera de ese menú.
11. **Letra con el teclado:**
    - Ctrl + / Ctrl − / Ctrl + rueda cambian la letra del lector, y hay botones A− / A+ a un toque;
    - el zoom del navegador **no se bloquea**, porque bloquearlo es una falla de accesibilidad.
12. **Marcas en la línea del libro:** rayitas de capítulo, marcadores y subrayados.
13. **Ayuda:** una guía de gestos que sale una sola vez y una hoja de atajos con la tecla **?**.
14. **Mini reproductor con las barras ocultas:** una pastilla ⏸ mientras se narra. *Hay que confirmarlo en el navegador.*

---

## 5. Mejoras visuales recomendadas

La dirección es **«Tinta y oro» en la lectura**: el papel manda y los controles son de la misma familia que el menú del avatar (Cinzel en los títulos, oro como acento). Nada de pared ni madera como en Duoc, ni cristal oscuro sobre papel claro.

- **Barras y hojas:**
  - el fondo es el tono del papel con un leve desenfoque;
  - con `prefers-reduced-transparency`, se vuelven sólidas;
  - una sombra suave reemplaza las líneas.
- **Flechas al pasar el mouse:** ‹ › finas, del color de la tinta al 40 %, que aparecen al acercarse al costado. Es la versión discreta de las flechas de Duoc.
- **Una sola bandeja inferior para los avisos:** búsqueda, «Volver a…», «Quitar marca», temporizador y avisos de voz se apilan en un mismo lugar, sin taparse.
- **Menú de selección:**
  - íconos Material en vez de emojis;
  - colores de subrayado como círculos;
  - fila de acciones: Definir · Copiar cita · Buscar · Narrar desde aquí · Preguntar a personaje;
  - «Reportar error» pasa al menú «⋯».
- **Pliego de dos páginas más de libro, sin tapa:**
  - una sombra muy sutil en el lomo y el folio en cada página;
  - si el capítulo termina en página impar, la de al lado queda en blanco.
- **Cabecera viva:** de 10 px a 11–12 px, en versalitas con algo de espacio entre letras.
- **Justificado en el celular:** por defecto, alineado a la izquierda bajo 480 px; o revisar que los guiones automáticos funcionen con cada palabra en su `<span>`. *Hay que verificarlo en el navegador.*
- **Movimiento:**
  - al soltar el dedo, la página termina el giro a la velocidad del gesto, con un resorte sin rebote;
  - se quitan las curvas con rebote;
  - con movimiento reducido, fundido.
- **Narración en lenguaje llano:** «Voz natural (Azure)», «Voz del navegador» y «Voz del teléfono», con contraste ≥ 4,5:1 en los 5 temas.
- **Aa en dos niveles:**
  - un panel rápido con A− / A+, tema, Páginas/Desplazamiento y tipografía;
  - el botón «Todos los ajustes» abre la hoja actual.

### Esquemas

```
ESCRITORIO (barras visibles; las flechas ‹ › salen solo al acercar el mouse)
┌──────────────────────────────────────────────────────────────────────┐
│ ← Biblioteca   Don Quijote II · Cap. 3            🔍  ☰  Aa  ⋯      │
├──────────────────────────────────────────────────────────────────────┤
│‹ DON QUIJOTE II            ┊            CAP. 3 · DE LO QUE…         ›│
│  texto texto texto texto   ┊   texto texto texto texto texto          │
│                     12     ┊     13                                   │  ┊ = lomo sutil
├──────────────────────────────────────────────────────────────────────┤
│ ▶ Escuchar ˅  ──┬───┬──●──┬────┬──  Págs. [12]–13 de 17 · cap. 3 · 34 % │
└──────────────────────────────────────────────────────────────────────┘
        ↑ marcas de capítulo/marcador/subrayado     ↑ campo editable (Ir a…)

TRAS UN SALTO (Índice, línea, búsqueda, marcador)        ATRÁS del navegador = lo mismo
                 ┌──────────────────────────────┐
                 │ ← Volver a la pág. 12 · cap. 3│
                 └──────────────────────────────┘

ÍNDICE (hoja lateral; en el celular, hoja inferior)
┌──────────────────────────────────┐
│ Índice                         ✕ │
│ [Contenido] [Marcadores] [Notas 12]│
│ 1  De lo que el cura…   ████ 100 %│
│ 3  Del ridículo…  ●     ██░░  45 %│  ← capítulo actual
│ 4  Donde Sancho…        ░░░░   0 %│
└──────────────────────────────────┘

BUSCAR «tiempo» — 12 resultados en 4 capítulos
  Cap. 1 · 5 resultados   «…administrar el tiempo. Los fundamentos…»  ›
  Cap. 3 · 4 resultados   «…durante mucho tiempo, ahora…»              ›
```

---

## 6. Plan de implementación por etapas

Cada etapa se prueba en la copia aislada (frontend 4310 + backend SQLite 8013), sin tocar tus 4200/8000 ni Supabase. No hacen falta migraciones, salvo que la página de referencia se guarde en el servidor (también se puede calcular en el navegador).

| Etapa | Qué | Tamaño |
|---|---|---|
| ~~0. Referencia Duoc~~ | Hecha (sección 1). | — |
| **1. Ubicarse y moverse** | Posición en la URL (`replaceState` al pasar, `pushState` al saltar), «Atrás» del navegador y botón «← Volver a…», campo «Ir a…» editable, rueda en Páginas, flechas al pasar el mouse en el escritorio y «Págs. 12–13». Specs en `reader-pager.spec`, `reader-progress.util.spec` y `reader-interactions.spec`. | M |
| **2. Índice y notas** | Avance por capítulo en Contenido, pestaña Notas (subrayados + post-its, filtros, «Ir al pasaje», enlace al Cuaderno) y marcas en la línea del libro. | M |
| **3. Búsqueda y selección** | Resultados agrupados por capítulo, coincidencias tenues en la página, menú de selección con íconos, Copiar cita y Buscar lo seleccionado. Sin post-its. | M |
| **4. Letra y zoom** | Ctrl + / − / rueda → letra, A− / A+, panel rápido de Aa, zoom de imágenes (doble toque o pellizco) y justificado en el celular. | M |
| **5. Pulido visual** | Material papel, bandeja única de avisos, sin rebotes, Narración con contraste y rótulos llanos, cabecera viva legible, lomo sutil (si lo apruebas) y giro con la velocidad del dedo. Detector de *impeccable* al final. | M |
| **6. Ayuda y primer uso** | Guía de gestos de una vez, hoja de atajos (?) y mini reproductor. | S |
| **7. Verificación** | Specs en Edge sin ventana, capturas a 1366×820 y 375×812 en los 5 temas, y la prueba en un teléfono real y en Safari, pendiente desde el 15 de octubre. | S |

**Orden recomendado:** 1 → 2 → 3 → 4 → 5 → 6 → 7. La 1 trae lo mejor de Duoc y arregla el «no hay cómo volver».

---

## 7. Decisiones que necesito de ti

1. **«Vista de libro abierto»:** el 14 de octubre elegiste quitar la vista con tapa. ¿Mejoro el pliego actual con lomo y folios (recomendado), o quieres de vuelta una vista con tapa como opción aparte?
2. **Flechas visibles en el escritorio:** ¿las muestro solo al acercar el mouse (recomendado; respeta los «controles ocultos») o siempre, como Duoc?
3. **Página de referencia para citar:** ¿la agrego (número fijo por libro) o basta con «Págs. 12–13 de 17 · 34 %»?
4. **Alcance:** ¿todas las etapas, o de la 1 a la 3 primero?
