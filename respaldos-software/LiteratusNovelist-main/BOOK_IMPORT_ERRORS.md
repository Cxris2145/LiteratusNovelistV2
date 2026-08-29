# BOOK_IMPORT_ERRORS.md
## Registro de Errores de Importación — LiteratusNovelist

Este archivo registra todos los errores encontrados durante la importación de EPUBs.
El proceso de importación NO se detiene cuando un libro falla: registra el error y continúa.

---

## Formato de registro

| Archivo/Slug | Error | Fecha | Fase | Posible Solución |
|---|---|---|---|---|
| slug-del-libro | Descripción del error | YYYY-MM-DD | Fase (validación/importación/portada) | Sugerencia |

---

## Errores registrados

*(Ningún error registrado aún — Importación no iniciada)*

---

## Estadísticas de errores

| Fase | Total |
|---|---|
| Validación EPUB | 0 |
| Extracción de metadatos | 0 |
| Creación de Book/Author | 0 |
| Extracción de capítulos | 0 |
| Extracción de portada | 0 |
| Generación de portada | 0 |
| **Total** | **0** |

---

## Tipos de error comunes

- **EPUB corrupto:** El archivo no puede abrirse como ZIP válido
- **Sin OPF:** El EPUB no contiene META-INF/container.xml
- **Sin capítulos:** El EPUB no tiene contenido de texto legible (>100 chars)
- **Encoding:** Problemas de codificación UTF-8 en el contenido
- **Slug duplicado:** Ya existe un Book con ese slug en la BD
- **ISBN duplicado:** Ya existe una Edition con ese ISBN en la BD
- **Sin metadatos:** El OPF no contiene título ni autor
