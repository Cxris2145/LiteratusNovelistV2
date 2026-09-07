"""
ai_engine/management/commands/generate_avatars.py

Genera el retrato de cada personaje (AIAvatar) con IA (pollinations.ai — gratis,
sin API key). Es el gemelo de catalog/management/commands/generate_covers.py,
pero trabaja sobre filas de la base en vez de sobre carpetas de libros, pide un
retrato vertical estilo manga/anime en lugar de una portada realista cuadrada, y
le quita el fondo (rembg, CPU) para que quede transparente y sin recuadro.

Estilo: el equipo anterior generaba estos retratos con Animagine XL (SDXL) en
Google Colab —requiere GPU, ver json_data/manga_frames_generation.json para sus
prompts—. Aquí se llega al mismo estilo manga sin GPU, con pollinations.ai.

El prompt se arma SIEMPRE desde los campos que ya tiene la base (`name`, el
libro, `description`, `is_author`), nunca desde json_data/characters_to_generate.json:
ese JSON quedó desfasado (el catálogo se reconstruyó con otras PK, y muchos ni
siquiera calzan por nombre+libro) y además sus prompts están redactados para un
resultado fotorrealista ("early 1900s photography", etc.); anteponerles la
etiqueta de estilo manga no bastaba para ganarle a ese texto y el resultado
salía semirrealista o de plano en blanco y negro. Por eso la etiqueta de estilo
va SIEMPRE primero en el prompt final, como hacía manga_frames_generation.json
con Animagine XL, y la descripción del personaje va después.

Escribe en MEDIA_ROOT/ai_avatars/<uuid>.webp (WEBP con canal alfa). Para subir a
Supabase y enlazar en la base:
    python manage.py upload_avatars_supabase

Es reanudable: salta los <uuid>.webp que ya existan en disco. El orden es el
mismo que usa el hub (?sort=popularity), así lo primero que se llena es lo
primero que el usuario ve.

Uso:
    python manage.py generate_avatars --limit 20
    python manage.py generate_avatars --workers 3
    python manage.py generate_avatars --no-remove-bg   # más rápido, deja el fondo
    python manage.py generate_avatars --include-existing --overwrite
"""

import io
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from ai_engine.models import AIAvatar

GEN_URL = "https://image.pollinations.ai/prompt/{prompt}?width=512&height=768&nologo=true&seed={seed}"

# Va SIEMPRE al frente del prompt (ver docstring): es lo que de verdad domina
# el resultado con este backend. "Manga art style" a secas no bastaba —el único
# modelo que sirve pollinations.ai (comprobado: GET /models -> ["sana"]) lo
# interpretaba como pintura digital semirrealista—; con vocabulario más
# explícito de ilustración plana sí se acerca al estilo anime.
STYLE_PREFIX = (
    "2D flat vector illustration, thick black outlines, cel shaded, anime manga art style, "
    "vibrant flat colors, no gradients, no photorealism, no 3D render, masterpiece. "
    "Solo, upper body portrait, looking at viewer, calm neutral expression, closed mouth. "
    "Simple plain solid-color background, no scenery. "
)

STYLE_SUFFIX = (
    " Edge-to-edge illustration: NO PICTURE FRAME, NO BORDER, NO MATTING. "
    "STRICTLY NO TEXT, NO LETTERS, NO SIGNATURES, NO WATERMARK, NO WORDS."
)

# La base no tiene un campo de género; estos títulos en el propio nombre son la
# única señal barata y confiable que hay (arreglan p. ej. "Abate Prévost", que
# sin esto el modelo dibujaba como mujer). Es una heurística, no exhaustiva.
MALE_TITLES = (
    "abate", "abad", "padre", "monsieur", "sir", "lord", "don ", "rey", "príncipe",
    "duque", "conde", "barón", "caballero", "señor ", "monje", "fray", "obispo",
)
FEMALE_TITLES = (
    "doña", "madame", "lady", "reina", "princesa", "duquesa", "condesa", "baronesa",
    "dama", "señora ", "monja", "abadesa",
)


def gender_hint(name: str) -> str:
    """
    Va AL FRENTE del prompt, no al final: puesto como frase suelta al final
    ("He is a man.") el modelo lo ignoraba —"Abate Prévost" seguía saliendo
    mujer—; con énfasis ponderado (sintaxis que sana sí respeta) justo antes
    de la descripción del personaje, sí se corrige.
    """
    low = f" {name.strip().lower()} "
    if any(t in low for t in FEMALE_TITLES):
        return "(female:1.4), a woman, "
    if any(t in low for t in MALE_TITLES):
        return "(male:1.4), a man, "
    return ""


class Command(BaseCommand):
    help = "Genera retratos manga de personajes con IA (pollinations.ai) en MEDIA_ROOT/ai_avatars/."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="Genera como máximo N retratos.")
        parser.add_argument("--overwrite", action="store_true", help="Regenera aunque el .webp ya exista.")
        parser.add_argument(
            "--include-existing",
            action="store_true",
            help="Incluye también los avatares que ya tienen avatar_image en la base.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=5.0,
            help="Segundos entre peticiones (por hilo). pollinations limita a ~1 cada 5 s sin API key.",
        )
        parser.add_argument("--workers", type=int, default=1, help="Descargas en paralelo. Ojo con el rate limit.")
        parser.add_argument("--retries", type=int, default=4, help="Reintentos ante 429 / errores de red.")
        parser.add_argument(
            "--no-remove-bg",
            action="store_true",
            help="No quita el fondo (más rápido; deja el fondo plano que pida el prompt).",
        )
        parser.add_argument("--dry-run", action="store_true", help="No descarga nada, solo muestra qué haría.")

    def handle(self, *args, **opts):
        w = self.stdout.write

        remove_bg = not opts["no_remove_bg"]
        bg_remover = None
        if remove_bg and not opts["dry_run"]:
            try:
                from rembg import new_session, remove  # noqa: WPS433 (import perezoso: pesado y opcional)
                session = new_session("u2net")
                bg_remover = lambda data: remove(data, session=session)  # noqa: E731
            except ImportError:
                raise CommandError(
                    "rembg no está instalado (pip install rembg onnxruntime). "
                    "Usa --no-remove-bg si quieres generar sin quitar el fondo."
                )

        out_dir = Path(settings.MEDIA_ROOT) / "ai_avatars"
        out_dir.mkdir(parents=True, exist_ok=True)

        # --- destinatarios ---------------------------------------------------
        # Mismo orden que el hub con ?sort=popularity, para que lo primero que se
        # rellena sea lo primero que se ve. 'id' cierra el orden por determinismo.
        avatars = AIAvatar.objects.select_related("edition__book")
        if not opts["include_existing"]:
            avatars = avatars.filter(Q(avatar_image="") | Q(avatar_image__isnull=True))
        avatars = avatars.order_by("-chat_count", "-is_major_character", "-is_author", "name", "id")

        targets = []
        for avatar in avatars.iterator(chunk_size=500):
            dest = out_dir / f"{avatar.pk}.webp"
            if dest.exists() and not opts["overwrite"]:
                continue
            targets.append((avatar, dest))
            if opts["limit"] and len(targets) >= opts["limit"]:
                break

        total = len(targets)
        w(f"Retratos por generar: {total} (destino {out_dir}, quitar fondo: {remove_bg})")
        if not total:
            w(self.style.SUCCESS("Nada que hacer."))
            return

        if opts["dry_run"]:
            for avatar, dest in targets[:20]:
                w(f"  {avatar.name} -> {dest.name}")
            w(f"... ({total} en total). Sin --dry-run se generan.")
            return

        # --- generación ------------------------------------------------------
        delay = opts["delay"]
        retries = max(0, opts["retries"])
        backoff_base = max(delay, 5.0)

        def build_prompt(avatar):
            # Derivado siempre de la base: name/book/description los tienen los
            # 4.477. La descripción evita que el modelo se invente al personaje
            # a partir del título (un "retrato de X de Manon Lescaut" a secas
            # devolvía a la heroína en vez del autor).
            book = avatar.edition.book.title if avatar.edition_id else ""
            desc = (avatar.description or "").strip()

            if avatar.is_author:
                who = f"the real historical author {avatar.name}"
                if book:
                    who += f", writer of \"{book}\""
                who += ", in period-accurate clothing"
            else:
                who = f"the literary character {avatar.name}"
                if book:
                    who += f", from the book \"{book}\""

            char_desc = f"{who}. {desc}" if desc else f"{who}."
            return STYLE_PREFIX + gender_hint(avatar.name) + char_desc + STYLE_SUFFIX

        def fetch(avatar):
            prompt = build_prompt(avatar)
            # Semilla estable a partir del UUID: relanzar produce la misma imagen.
            seed = int(avatar.pk.hex[:8], 16) % 1_000_000
            url = GEN_URL.format(prompt=urllib.parse.quote(prompt), seed=seed)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

            last = ""
            for intento in range(retries + 1):
                try:
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        data = resp.read()
                    if len(data) < 1000:
                        raise RuntimeError(f"respuesta muy pequeña ({len(data)} bytes)")
                    return data, None
                except Exception as exc:  # noqa: BLE001
                    last = str(exc)
                    if intento == retries:
                        break
                    # El 429 es lo normal en una tanda larga: se espera cada vez
                    # más antes de reintentar en vez de perder el retrato.
                    time.sleep(backoff_base * (2 ** intento))
            return None, last

        def generate(index, avatar, dest):
            data, err = fetch(avatar)
            if data is None:
                return index, avatar.name, False, err

            try:
                if bg_remover is not None:
                    # rembg recibe/devuelve bytes; el propio Pillow interno ya
                    # produce PNG con alfa, pero se guarda en WEBP (más liviano
                    # y es lo que el modelo/serializer ya sabe servir).
                    from PIL import Image  # noqa: WPS433

                    cut = bg_remover(data)
                    img = Image.open(io.BytesIO(cut)).convert("RGBA")
                    buf = io.BytesIO()
                    img.save(buf, "WEBP", quality=90)
                    dest.write_bytes(buf.getvalue())
                else:
                    dest.write_bytes(data)
            except Exception as exc:  # noqa: BLE001
                return index, avatar.name, False, f"post-proceso: {exc}"

            if delay:
                time.sleep(delay)
            return index, avatar.name, True, ""

        ok = fail = 0
        workers = max(1, opts["workers"])

        if workers == 1:
            results = (generate(i, a, d) for i, (a, d) in enumerate(targets, 1))
            for index, name, good, msg in results:
                ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
                w(f"[{index}/{total}] {'ok ' if good else 'ERR'} {name}{'' if good else ': ' + msg}")
        else:
            # rembg no es thread-safe entre sesiones; con --workers > 1 y quitar
            # fondo activo, cada hilo comparte la misma sesión de solo-lectura
            # (onnxruntime sí soporta llamadas concurrentes sobre una sesión).
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futs = [ex.submit(generate, i, a, d) for i, (a, d) in enumerate(targets, 1)]
                for done, fut in enumerate(as_completed(futs), 1):
                    index, name, good, msg = fut.result()
                    ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
                    w(f"[{done}/{total}] {'ok ' if good else 'ERR'} {name}{'' if good else ': ' + msg}")

        w(self.style.SUCCESS(f"\nGenerados {ok}, fallidos {fail}."))
        w("Siguiente paso: python manage.py upload_avatars_supabase")
