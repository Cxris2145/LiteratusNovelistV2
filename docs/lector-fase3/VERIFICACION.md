# Fase 3 del lector: formato e-reader

Implementación del 14 al 15 de octubre de 2026. Implementación en `feat/lector-ereader`, sin commit.

## Cambios

- Papel a pantalla completa, cabecera viva, título en versalitas rojas, capitular y números dentro del capítulo. Se retiró `reader-book.component.css`.
- Una página en móvil y vertical; dos si el ancho es al menos 1000 px y la relación ancho/alto es al menos 1,25. Por esta regla, 1366 × 820 también muestra dos páginas.
- Barras compartidas por Páginas y Desplazamiento, visibles al tocar el centro. Se ocultan al pasar página. La esquina doblada guarda o quita un marcador.
- Navegación con los costados, flechas, Espacio y gesto táctil con seguimiento del dedo. Deslizar o Sin animación; fundido con movimiento reducido.
- Hoja Más: Personajes, Cuaderno, Vocabulario, Resumen, Post-it, Favorito y Libros abiertos, con cierre de pestañas.
- Migración de ajustes anteriores a `layoutMode`, `margins` y `pageTurn`. Atenuar funciona con una capa sobre el papel y la tinta; Márgenes cambia ambos modos.
- Avance automático por palabras y ritmo en Páginas; desplazamiento continuo con acumulación de píxeles fraccionarios, también a velocidades bajas.
- Paginación pura en `reader-pager.ts` y regla extraída a `reader-ruler.ts`. Visibilidad, saltos, narración y post-its usan el visor inmóvil y las coordenadas del lienzo trasladado.
- El progreso guarda la primera palabra del destino incluso durante la animación. Los rótulos muestran páginas exactas del capítulo abierto y porcentaje del libro; los pasajes de otros capítulos se identifican por capítulo.

## Verificación

Se usó exclusivamente el frontend aislado de `localhost:4310` y el backend de `localhost:8013`, cuya configuración utiliza SQLite. No se controlaron los servidores 4200/8000 ni se hicieron escrituras en Supabase.

Angular y sus plantillas compilan con `ngc -p tsconfig.app.json --noEmit`. La suite aislada de Edge Headless pasa **46/46**: ajustes (17), paginador (11), progreso (2), interacciones (16).

Las interacciones incluyen PointerEvent sobre DOM real, umbrales y cancelación de arrastre, selección de texto, cambio de modo, una/dos columnas CSS, cambios rápidos de tipografía, avance automático, fin del libro, pausa, cancelación al cambiar de capítulo, velocidades de 10/40 px/s, seguimiento de la palabra narrada y guardado durante el giro animado.

Comprobaciones en navegador:

- Una página a 375 × 812 y 844 × 390; dos a 1366 × 820 y 1440 × 900.
- Los siete controles principales del móvil tienen al menos 44 × 44 px y `elementFromPoint` identifica el control correcto en su centro.
- El toque central muestra/oculta las barras; flecha derecha y toque sobre texto del costado avanzan página.
- La esquina crea un marcador, éste aparece en Índice → Marcadores y se puede quitar.
- Búsqueda de «reprehensor»: salto desde el capítulo 1 al capítulo 32 de Don Quijote II.
- Márgenes amplios reduce el ancho disponible; Atenuar al 60 % aplica una capa negra de opacidad 0,4 sobre el papel.
- Cambio Páginas → Desplazamiento → Páginas conserva el pasaje; confirmado con la palabra 321 en móvil.
- Más presenta las acciones acordadas; el control de voz abre la hoja de narración.

Las capturas adjuntas documentan el resultado. La compilación de producción y la comparación de rendimiento pertenecen a las fases posteriores.

## Continuación

Las fases 4, 5 y 6 requieren su aprobación individual. Sigue pendiente la meta heredada de reducir `reader.component.ts` a 2000 líneas, aunque ya se extrajeron la regla y las funciones puras de paginación. No se verificaron Safari, un teléfono físico ni una voz Azure real.

Los scripts auxiliares y una copia del CSS de libro anterior se conservaron en `C:\Users\Cxris\AppData\Local\Temp\literatus-reader-phase3-01a13d63`.
