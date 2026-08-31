# COVER_GENERATION_LOG — Portadas ilustradas (literatus-covers)

Bitácora del comando `python manage.py generate_ai_covers`.
Ilustración: Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell` (nivel gratuito).
Composición: `catalog/covers/` (marco Literatus + título/autor con Pillow). La IA no genera texto.

| Fecha (local) | Flags | Procesados | Generadas | Fallidas | Omitidas | Tiempo medio | Último libro | Nota |
|---|---|---|---|---|---|---|---|---|
| 2026-08-31 17:40 | `--book-id x5 --regenerate --no-backup` | 5 | 5 | 0 | 0 | 3.3 s | rimas-gustavo-adolfo-becquer | Piloto aprobado por el usuario (Metamorfosis, Frankenstein, Isla del tesoro, Reina de las Nieves, Rimas) |
| 2026-08-31 17:43 | `--batch-size 20 --sleep 0.6` | 70 | 69 | 0 | 0 | 3.4 s | historia-de-un-buen-brahmin-voltaire | 429 cuota Cloudflare agotada en `historia-de-una-anguila...`. Total acumulado 74/1046. Reanudar tras 00:00 UTC. |

## Estado

- **Acumulado:** 74 / 1046 portadas ilustradas.
- **Pendientes:** 972.
- **NEXT_ACTION:** relanzar `python manage.py generate_ai_covers --batch-size 20` cada día (cuota Cloudflare se renueva a 00:00 UTC) hasta `completed_slugs == 1046`. Con `--steps 4` (nuevo valor por defecto) se esperan ~120–150 portadas por tanda diaria → ~7–9 días.
- **failed_slugs:** ninguno.
- **Fix de prompt (2026-08-31):** `scene_prompt.build_scene_prompt` ya no incrusta el título/autor en el prompt de la imagen. Antes, títulos icónicos ("Hamlet") o corruptos hacían que flux-schnell escribiera letras en la ilustración. Regenerar con `--regenerate --book-id` las portadas de la primera tanda afectadas.
- **Dependencia de datos:** ~11 libros con `title` corrupto (ver `AGENT_LOG.md`). Corregir el título (tarea de `literatus-synopsis` / `literatus-library`) antes de regenerar su portada.
