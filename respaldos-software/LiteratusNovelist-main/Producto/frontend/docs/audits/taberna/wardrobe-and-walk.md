# Revisión del vestuario y la caminata de Maguito

Fecha: 2026-10-16.

## Caminata de fondo

Los dos paseantes y la mesera usan el SVG original en 2D. Los pies alternan apoyo y recuperación; el torso, los brazos, la capa y el sombrero acompañan cada paso. Los recorridos vuelven al inicio sin desaparecer, con pausas para girar. La mesera se detiene al servir y mantiene la bandeja junto a su mano.

La animación se pausa fuera de pantalla y con la pestaña oculta. La preferencia de movimiento reducido deja a los personajes quietos.

## Ajuste de prendas

Se revisaron las 40 variantes del componente, en cuerpo completo y en sus miniaturas de detalle, además de las combinaciones de todos los accesorios con barba y de todos los lentes con el gorro de aviador. Esto no equivale a probar todas las combinaciones posibles del ropero.

- La capa de medianoche ahora colorea también las mangas.
- El corbatín se eleva al llevar barba; el broche de pluma, la medalla y el amuleto quedan visibles sobre la solapa.
- Los encuadres de sombreros, lentes y accesorios muestran las prendas completas y con un tamaño legible.
- Los filtros usan «Rostro» y «Accesorios» para incluir las nuevas opciones.

## Colección nueva

| Variante | Prenda | Tinta |
| --- | --- | ---: |
| `head:hood` | Capucha del viajero | 150 |
| `head:newsboy` | Gorra del cronista | 110 |
| `head:nightcap` | Gorro de lectura | 100 |
| `eyes:rectangular` | Lentes ámbar | 90 |
| `face:freckles` | Pecas de aventurero | 60 |
| `neck:satchel` | Bandolera de pergaminos | 160 |
| `neck:moon-pendant` | Amuleto de luna | 180 |
| `cape:teal` | Capa del bibliotecario | 140 |
| `cape:ivory` | Capa marfil | 160 |
| `cape:starry` | Capa de constelaciones | 220 |

La migración `learning.0006_seed_wardrobe_collection` agrega las piezas faltantes sin alterar inventarios ni ajustes de prendas existentes. Se aplicó a la base configurada. La consulta posterior confirmó 35 prendas activas y una coincidencia exacta entre los 35 valores del catálogo y las variantes del frontend, excluyendo los cinco valores por defecto. No se realizaron compras sobre esa base.

## Verificación

- Angular: 9 pruebas aprobadas de Maguito y Bazar.
- Django: 8 pruebas aprobadas de prendas, compra, equipamiento, exclusivas e idempotencia; SQLite efímero.
- `makemigrations --check --dry-run`: sin cambios pendientes.
- `npm run build`: correcto. Persisten los avisos existentes de CommonJS y de selectores de View Transitions.
- Navegador: tres instancias caminando, dos pies por instancia, transformaciones alternadas y sin errores de consola.
- La galería de auditoría fue temporal y se eliminó del código y de las rutas.

Capturas guardadas en la carpeta `scratch` de la raíz del repositorio: `wardrobe-all-final.png`, `wardrobe-new-looks.png` y `tavern-walking-final.png`.
