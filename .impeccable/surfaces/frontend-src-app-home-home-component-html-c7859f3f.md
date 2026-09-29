---
version: 1
slug: "frontend-src-app-home-home-component-html-c7859f3f"
primary_target: "respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.html"
related_targets: []
---

# Portada (home)

**Modo:** Persuade. Visitante principal: estudiante del plan lector que llega por primera vez o vuelve a seguir leyendo.
**Trabajo de la página:** que en 5 segundos entienda que aquí hay clásicos completos, gratis y en español que puede leer, escuchar y conversar con sus personajes, y que pulse "Leer".
**Prueba disponible:** catálogo real (cifras vivas de la API), portadas reales, personajes reales por obra, demo de modos de lectura con voz.
**Restricciones:** no prometer venta de libros por autores; respetar los 5 `data-theme`; nombre y logo Cinzel obligatorios; header y nav del shell quedan fuera hasta la Fase 4.
**Decisiones abiertas:** clip de voz neuronal (Azure) para la demo; guía de bienvenida que se abre sobre la portada en la primera visita.
**Hecho en Fase 4:** header y pie en azul tinta solo en la portada (tema por defecto); navegación en pestañas compactas en toda la app. Aventura usa #3A66CC en vez de #4F7CE0 por contraste con texto blanco.

## Direction contract

THESIS: La portada es el catálogo de una colección de bolsillo del plan lector: cada género tiene su color de tela y ese color vive en lomos, bandas y en el campo detrás de la portada. Rechaza la "biblioteca mágica" oscura con dorado, brillos y 3D, y también la réplica de papel crema con serif.

OWN-WORLD: Fondo azul tinta #15233B con superficie #1E3050; texto color papel #F1EBDD y secundario #B9B3A6. Cinco telas de colección como campos planos, nunca como acentos sueltos: narrativa #C8402E, teatro y poesía #E8B321, pensamiento #2E7D5B, aventura #4F7CE0, misterio #7B4FB8. Archivo (eje de ancho) para titulares, interfaz y lomos condensados; Alegreya para texto literario. Bordes de 2px en lomos y portadas, 10px en paneles; sin vidrio, sin degradados, sin brillos.

STORY: El visitante ve la promesa y un libro real en su color de colección, prueba otro lomo y ve cómo cambia, recorre géneros por color, conoce el reparto de personajes, prueba la lectura asistida con voz, y termina sabiendo que leer es gratis y cómo empezar.

FIRST VIEWPORT: Izquierda (7/12): titular de dos líneas en Archivo ancho, bajada de una línea, botón papel "Leer {libro}" y enlace "Ver catálogo", y tres datos en una fila. Derecha (5/12): campo plano del color de la colección a sangre hasta el borde, con la portada real a 2px de radio y su ficha (título, autor, colección, páginas) pegada al costado, alineada a la base de la portada (decisión de build: a 1440 el campo es más ancho que alto y la ficha debajo empujaba la fila de lomos fuera del primer viewport; en móvil sigue al costado a 150px). Abajo, a todo el ancho: fila de lomos verticales de colores, con ancho y alto según la extensión del libro; el activo sobresale y muestra el título completo.

FORM: Colección de bolsillo del plan lector (Austral, Zig-Zag); candidato 1 de 7 de la lista ordenada, elegido por el usuario como IMPECCABLE'S PICK frente al asignado. Seed 54b107cf. Firma: "sacar un lomo" (sube 8px al foco o hover; al elegirlo cambia libro y campo de color en 240ms ease-out; inmediato con movimiento reducido).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
