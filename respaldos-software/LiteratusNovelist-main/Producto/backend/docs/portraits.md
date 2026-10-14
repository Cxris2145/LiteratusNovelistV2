# Retratos de personajes por lotes

Este flujo exporta el catálogo real y enlaza imágenes generadas fuera del servidor.
No llama a proveedores de generación ni cobra por API. El coste o los límites del
generador elegido se resuelven antes de producir el lote. Una imagen ausente sigue
pendiente: ningún avatar genérico se contabiliza como retrato generado.

## Exportar y preparar

Desde `Producto/backend`, con el entorno habitual del proyecto:

```powershell
.venv/Scripts/python.exe manage.py export_portraits --output docs/portraits/manifest.json
```

El manifiesto versión 1 guarda la huella no secreta de la base y, para cada avatar,
su UUID, nombre, edición, libro, autor real enlazado cuando existe, estado de imagen,
capítulo de desbloqueo, perfil visual, prompt y `output_image: null`. Incluye
`description` y `behavioral_context` únicamente para revisión privada; **no publiques
este archivo ni envíes esos campos narrativos al generador**. `system_prompt` nunca
se exporta. El campo `prompt` no incorpora descripciones, secretos ni acontecimientos.

Para especificar apariencia fiel sin inventar rasgos ni revelar sucesos, prepara un
JSON privado por UUID de avatar o `identity_key` y pásalo con `--profiles`:

```json
{
  "UUID-REAL-DEL-AVATAR": {
    "appearance": "joven guerrero griego",
    "clothing": "armadura de bronce",
    "expression": "orgulloso y decidido"
  }
}
```

Se admiten `appearance`, `age`, `species`, `facial_features`, `hair`, `eyes`,
`clothing`, `era`, `expression`, `pose` y `props`. Sin perfil aprobado, queda
`profile_status: needs_appearance_review`; el prompt conserva únicamente identidad
y estilo semirrealista, busto centrado, fondo azul oscuro y luz cálida de bronce.
Los gustos solo deben reflejarse mediante objetos y poses visuales ya revisados.

`--avatar UUID` puede repetirse para exportar una selección. Por defecto salen
todos los avatares activos, incluidas las imágenes existentes, que se conservan
durante la importación. Los personajes de igual nombre solo comparten identidad
cuando pertenecen al mismo libro. Un autor real comparte retrato entre libros
únicamente si coincide con un `Author` inequívoco enlazado a cada libro; personas
sin enlace confirmado quedan separadas por UUID.

## Mapear y comprobar

Guarda las imágenes en una carpeta local. En cada registro del manifiesto, establece
`output_image` a su ruta relativa a esa carpeta, por ejemplo `aquiles-iliada.png`.
Se puede asignar una sola salida a uno de los registros de una identidad compartida;
el importador la reutiliza para los demás. Si hay varias salidas distintas para la
misma identidad, asigna explícitamente la correspondiente a cada avatar; los
registros sin decisión quedan pendientes. Nunca reutiliza por nombre entre libros.

```powershell
.venv/Scripts/python.exe manage.py import_portraits docs/portraits/manifest.json --images-root docs/portraits/images --dry-run --report docs/portraits/dry-run.json
```

El modo por defecto también es `dry-run`: valida los UUID y su contexto actual,
abre y verifica las imágenes, prepara la conversión en memoria y muestra estados,
sin escribir imágenes, cambiar la base ni llamar a la red. Rechaza rutas absolutas,
`..`, escapes mediante enlaces, imágenes dañadas o animadas y retratos menores de
64×64 o mayores de 25 millones de píxeles. Convierte realmente a WebP y limita el
tamaño a 768×1024 conservando proporción y transparencia.

## Aplicar y reanudar

Usa la huella que mostró la exportación en lugar de `HUELLA-EXPORTADA`:

```powershell
.venv/Scripts/python.exe manage.py import_portraits docs/portraits/manifest.json --images-root docs/portraits/images --apply --upload --expected-database-fingerprint HUELLA-EXPORTADA --report docs/portraits/import-report.json
```

`--apply` exige que la huella del manifiesto, la configuración actual y el argumento
coincidan. Evita aplicar a otra base por accidente. La huella SHA-256 identifica
motor, host, puerto, nombre y usuario de la conexión; nunca exporta la contraseña.
El importador vuelve a comprobar UUID, nombre, edición, libro y autor antes de enlazar.

`--upload` es una decisión explícita: requiere `SUPABASE_URL` y
`SUPABASE_SERVICE_KEY` o `SUPABASE_KEY` del servidor. La copia utiliza el helper
existente y verifica que los bytes públicos de Supabase coincidan con la imagen
WebP antes de modificar la base. Con `MEDIA_URL` remoto es obligatorio; con media
local se puede omitir. No sobrescribe objetos remotos: usa nombres derivados de
identidad y contenido en `ai_avatars/portraits/`.

Cada fila del informe separa `local`, `upload` y `database`, además de `status`.
Los estados incluyen `pending`, `ready` (dry-run), `linked`, `already_linked`,
`preserved_existing` y `failed`. Una copia local correcta no implica una subida
ni un enlace correcto. Las filas fallidas no se enlazan y el comando devuelve
error; los éxitos anteriores permanecen utilizables. Repite el mismo comando
para reanudar: reutiliza copias y objetos idénticos y omite enlaces ya aplicados.

Los retratos existentes se preservan incluso si su ruta local está ausente;
`--replace` permite cambiar únicamente el enlace a una nueva copia con nombre
propio. No borra el archivo anterior. Nunca modifica capítulos de desbloqueo,
relaciones, descripciones ni permisos de lectura. Las superficies de lectura
deben seguir respetando su política vigente contra spoilers.

## Verificar cambios de código

```powershell
.venv/Scripts/python.exe manage.py test ai_engine.tests_portraits --settings=config.test_settings --noinput
```

Las pruebas usan SQLite aislado, media temporal y red simulada. Cubren identidad
por obra y autor, exclusión de secretos del prompt, rutas, conversión, preservación,
base incorrecta, dry-run, fallos de subida, verificación pública y reanudación.

## Recoger lotes generados y revisados

`scripts/publish_portrait_batches.py` recoge los índices privados
`.tmp-portraits/generation-*.json` junto al `catalog-manifest.json` exportado.
Cada entrada requiere `identity_key`, `avatar_ids`, `source`, `sha256` y
`status: generated_reviewed`. Las rutas son relativas a `media/portrait_sources`
(también admite el prefijo `portrait_sources/` relativo a media). Antes de importar
verifica la carpeta autorizada, el contenido SHA-256 y la identidad exacta de cada
UUID contra el manifiesto. No interpreta nombres para elegir destinatarios.

```powershell
.venv/Scripts/python.exe scripts/publish_portrait_batches.py --apply --expected-database-fingerprint HUELLA-EXPORTADA
```

Publica cuando hay al menos tres identidades nuevas revisadas; `--flush` permite
publicar las últimas una o dos. Guarda manifiestos derivados e informes por lote,
`publisher-state.json` y `published-summary.json` en la carpeta privada. Conserva
los índices de los generadores y todos los retratos ya enlazados; no usa `--replace`.
El resumen cuenta imágenes efectivamente publicadas, UUID enlazados y filas que
todavía carecen de imagen, sin afirmar que todo el catálogo terminó. Una imagen
compartida se sube y verifica una sola vez por lote.
