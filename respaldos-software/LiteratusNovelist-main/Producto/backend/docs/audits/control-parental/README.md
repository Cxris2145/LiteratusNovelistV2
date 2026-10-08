# Control parental

Se revisaron los metadatos del catálogo real: 1.046 obras. El informe
`catalogo-edades.csv` registra la clasificación anterior, la clasificación propuesta
y el motivo para cada libro. Es una auditoría de categorías y metadatos, no una
lectura íntegra de los 1.046 textos ni una certificación editorial de cada obra.

Se aplicó +18 a cinco obras que estaban clasificadas como ficción erótica pero
tenían `min_age=0`:

- Historia de Aline y Valcour.
- Historia Secreta de Isabel de Baviera.
- Juliette o las prosperidades del vicio.
- Justine, o los infortunios de la virtud.
- Los 120 días de Sodoma.

Se conserva la restricción +18 que ya tenía Frankenstein. Las menciones a
sexualidad, religión o violencia en una sinopsis no provocan automáticamente una
clasificación +18. El administrador puede revisar la edad mínima de cada obra
en Django Admin y filtrar el catálogo por `min_age`.

## Comportamiento

- El registro exige una fecha de nacimiento válida en el formulario y en la API.
- Las cuentas antiguas sin fecha y las visitas sin sesión solo ven obras con edad
  mínima 0. La fecha puede completarse una vez desde el perfil.
- La edad se calcula al consultar; una cuenta obtiene acceso al cumplir la edad
  mínima, incluido el día de su cumpleaños número 18.
- Los listados, búsquedas, recomendaciones, fichas de autores, favoritos,
  biblioteca y personajes filtran las obras restringidas antes de paginar.
- La API también bloquea las fichas, capítulos, descargas, resúmenes e
  interacciones con personajes restringidos solicitados directamente por URL.
- Las cachés del catálogo se separan por edad en el servidor y por sesión en
  el navegador. Se elimina la copia persistente de la primera página y el
  almacenamiento compartido de la API de inventario en el service worker.
- Crear una obra conocida del catálogo +18 o asignarle una categoría erótica
  establece automáticamente una edad mínima de 18 sin reducir restricciones
  anteriores más altas.

Los archivos publicados anteriormente en buckets públicos conservan su política
de almacenamiento. Esta tarea controla su aparición y acceso mediante la API;
no cambia los permisos de Supabase Storage ni retira archivos ya descargados.

## Despliegue y revisiones posteriores

Las cinco clasificaciones están guardadas en la base de datos. Para activar el
registro y los filtros en la web publicada se debe desplegar el backend y el
frontend de este proyecto y ejecutar `python manage.py migrate`. La migración
`0027_classify_adult_books` conserva los mismos criterios para otras instalaciones.

Para repetir la auditoría sin modificar datos:

```powershell
python manage.py classify_book_ages --report docs/audits/control-parental/catalogo-edades.csv
```

Para aplicar las clasificaciones detectadas, añadir `--apply`. El comando es
idempotente y nunca reduce la edad mínima existente.

## Verificación

- 26 pruebas del backend de control parental y registro: correctas.
- 4 pruebas del formulario y aislamiento de caché en el navegador: correctas.
- Compilación de producción de Angular y comprobación de TypeScript: correctas.
- API local consultando el catálogo real en modo de solo lectura: 1.040 obras
  para menores o cuentas sin fecha; 1.046 obras para una cuenta adulta.
- Suite ampliada: 199 pruebas, 195 correctas, 2 omitidas que requieren PostgreSQL
  y 2 fallos en pruebas de aprendizaje ajenas a estas reglas de edad:
  `test_wearables_are_seeded_by_migration` (17 accesorios frente a 14 esperados)
  y `test_passing_completes_skipped_units_and_opens_the_target` (60 XP frente
  a 80 esperados). Los servicios, migraciones y pruebas que calculan esos
  valores no se modificaron en esta tarea.
