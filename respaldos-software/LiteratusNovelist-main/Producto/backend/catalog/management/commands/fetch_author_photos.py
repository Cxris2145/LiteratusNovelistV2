"""
catalog/management/commands/fetch_author_photos.py

Busca el retrato REAL de cada autor (no generado por IA) en Wikidata/Wikimedia
Commons y lo descarga a MEDIA_ROOT/authors/photos/<slug>.jpg. Es el gemelo de
catalog/management/commands/generate_covers.py, pero en vez de generar una
imagen con un modelo de difusión, busca la foto/retrato que Wikipedia ya usa
para ese autor —con licencia clara para reutilizar, a diferencia de tomar
cualquier resultado de una búsqueda de imágenes—.

Cómo empareja cada Author con su entidad:
    1. wbsearchentities (API pública de Wikidata, sin API key) busca por
       full_name y devuelve candidatos ordenados por relevancia.
    2. De esos candidatos, toma el primero que sea humano (P31 = Q5) y tenga
       foto/retrato (P18). Evita así que "Voltaire" resuelva a una canción o
       una parada de tranvía con el mismo nombre (se vio en pruebas reales).
    3. Ese P18 es un archivo de Wikimedia Commons; se descarga vía
       Special:FilePath, que sirve cualquier formato (jpg/png/tif) ya
       reescalado a --width.

Anti-duplicados ("que no se repitan"): se seleeva un registro del archivo de
Commons usado por cada autor ya emparejado en la corrida. Si el candidato de
otro autor resuelve al MISMO archivo, es señal de que el emparejamiento por
nombre falló (dos autores no comparten retrato real) — se prueba el siguiente
candidato de esa búsqueda en vez de asignarlo.

Escribe además un manifiesto MEDIA_ROOT/authors/photos/_manifest.json con
{author_id: {commons_file, wikipedia_url}} para que el siguiente paso
(upload_author_photos_supabase) enlace también Author.wikipedia_url, que hoy
está vacío en los 313 autores.

Uso:
    python manage.py fetch_author_photos --dry-run
    python manage.py fetch_author_photos --limit 10
    python manage.py fetch_author_photos --overwrite
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q

from catalog.models import Author

WD_API = "https://www.wikidata.org/w/api.php"
WD_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width={width}"

# La etiqueta de Wikimedia pide un User-Agent identificable en su API de
# etiqueta (no exige clave, pero sí que no se llame "python-urllib" a secas).
UA = "LiteratusNovelist-CatalogBot/1.0 (catálogo literario educativo, uso no comercial)"

PLACEHOLDER_NAMES = {"unknown", "anónimo", "anonimo", "desconocido", "varios", "various", "anonymous"}


def http_get(url: str, timeout: int = 20, retries: int = 3) -> bytes:
    """
    Con --delay bajo, Commons devuelve 429 en ráfagas cortas (la API de
    búsqueda de Wikidata aguanta bien; el redirector Special:FilePath es más
    sensible). Reintenta con backoff en vez de perder el retrato.
    """
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for intento in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or intento == retries:
                raise
            time.sleep(2 * (2 ** intento))
    raise RuntimeError("inalcanzable")  # pragma: no cover


def wd_search(name: str, lang: str) -> list:
    url = WD_API + "?" + urllib.parse.urlencode({
        "action": "wbsearchentities",
        "search": name,
        "language": lang,
        "format": "json",
        "limit": 6,
        "type": "item",
    })
    data = json.loads(http_get(url))
    return data.get("search", [])


def wd_entity(qid: str) -> dict:
    data = json.loads(http_get(WD_ENTITY.format(qid=qid)))
    return data["entities"][qid]


def best_candidate(name: str):
    """
    Primer candidato de Wikidata que sea persona (P31=Q5) y tenga retrato
    (P18). Busca primero en inglés (mejor cobertura de alias para nombres
    clásicos transliterados) y si no hay nada usable prueba en español.
    """
    seen_qids = set()
    for lang in ("en", "es"):
        for hit in wd_search(name, lang):
            qid = hit["id"]
            if qid in seen_qids:
                continue
            seen_qids.add(qid)
            try:
                ent = wd_entity(qid)
            except Exception:  # noqa: BLE001
                continue

            claims = ent.get("claims", {})
            is_human = any(
                c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == "Q5"
                for c in claims.get("P31", [])
                if c.get("mainsnak", {}).get("datavalue")
            )
            if not is_human or "P18" not in claims:
                continue

            filename = claims["P18"][0]["mainsnak"]["datavalue"]["value"]
            sitelinks = ent.get("sitelinks", {})
            wiki_title = (
                sitelinks.get("eswiki", {}).get("title")
                or sitelinks.get("enwiki", {}).get("title")
            )
            wiki_lang = "es" if sitelinks.get("eswiki") else "en"
            wikipedia_url = (
                f"https://{wiki_lang}.wikipedia.org/wiki/{urllib.parse.quote(wiki_title.replace(' ', '_'))}"
                if wiki_title else ""
            )
            yield qid, filename, wikipedia_url


class Command(BaseCommand):
    help = "Busca en Wikidata/Commons el retrato real de cada Author y lo descarga en MEDIA_ROOT/authors/photos/."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="Procesa como máximo N autores.")
        parser.add_argument("--overwrite", action="store_true", help="Reintenta aunque ya haya un archivo local.")
        parser.add_argument(
            "--include-existing",
            action="store_true",
            help="Incluye también autores que ya tienen Author.photo en la base.",
        )
        parser.add_argument("--delay", type=float, default=1.0, help="Segundos entre autores (cortesía con la API).")
        parser.add_argument("--width", type=int, default=500, help="Ancho del retrato a descargar.")
        parser.add_argument("--dry-run", action="store_true", help="No descarga nada, solo muestra qué haría.")

    def handle(self, *args, **opts):
        w = self.stdout.write

        out_dir = Path(settings.MEDIA_ROOT) / "authors" / "photos"
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = out_dir / "_manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

        authors = Author.objects.all()
        if not opts["include_existing"]:
            authors = authors.filter(Q(photo="") | Q(photo__isnull=True))
        authors = authors.order_by("full_name")

        targets = []
        for author in authors.iterator(chunk_size=200):
            if author.full_name.strip().lower() in PLACEHOLDER_NAMES:
                continue
            dest = out_dir / f"{author.slug}.jpg"
            if dest.exists() and not opts["overwrite"]:
                continue
            targets.append((author, dest))
            if opts["limit"] and len(targets) >= opts["limit"]:
                break

        total = len(targets)
        w(f"Autores por buscar: {total} (destino {out_dir})")
        if not total:
            w(self.style.SUCCESS("Nada que hacer."))
            return

        if opts["dry_run"]:
            for author, dest in targets[:25]:
                w(f"  {author.full_name} -> {dest.name}")
            w(f"... ({total} en total). Sin --dry-run se buscan y descargan.")
            return

        # Archivos de Commons ya asignados en esta corrida (+ los de corridas
        # previas, vía el manifiesto) — "que no se repitan" entre autores.
        used_files = {v["commons_file"] for v in manifest.values()}

        ok = fail = dupe = 0
        for i, (author, dest) in enumerate(targets, 1):
            try:
                assigned = False
                for qid, filename, wikipedia_url in best_candidate(author.full_name):
                    if filename in used_files:
                        continue  # mismo retrato ya usado por otro autor: no vale, sigue probando
                    img_url = COMMONS_FILEPATH.format(filename=urllib.parse.quote(filename), width=opts["width"])
                    data = http_get(img_url, timeout=30)
                    if len(data) < 500:
                        continue
                    dest.write_bytes(data)
                    used_files.add(filename)
                    manifest[str(author.pk)] = {
                        "commons_file": filename,
                        "wikipedia_url": wikipedia_url,
                        "wikidata_qid": qid,
                        "full_name": author.full_name,
                    }
                    w(f"[{i}/{total}] ok  {author.full_name} -> {qid} ({filename[:60]})")
                    ok += 1
                    assigned = True
                    break

                if not assigned:
                    # Hubo candidato(s) pero todos repetidos, o ninguno con foto.
                    w(f"[{i}/{total}] --  {author.full_name}: sin retrato disponible (o todos repetidos)")
                    dupe += 1
            except Exception as exc:  # noqa: BLE001
                w(f"[{i}/{total}] ERR {author.full_name}: {exc}")
                fail += 1

            if opts["delay"]:
                time.sleep(opts["delay"])

        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

        w(self.style.SUCCESS(f"\nEncontrados {ok}, sin retrato válido {dupe}, fallidos {fail}."))
        w("Siguiente paso: python manage.py upload_author_photos_supabase")
