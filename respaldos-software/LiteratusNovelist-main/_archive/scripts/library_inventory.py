#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
library_inventory.py -- Library Content Agent, Etapa 1
Analiza los EPUBs en respaldos-software/books/ y genera inventario.
NO modifica la base de datos ni copia archivos.
Reanudable: si existe LIBRARY_INVENTORY.json parcial, retoma desde ahi.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import os, json, hashlib, zipfile, re, time, argparse, traceback
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from unicodedata import normalize as unorm

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR
BOOKS_DIR    = SCRIPT_DIR.parent.parent / "respaldos-software" / "books"
OUT_JSON     = PROJECT_ROOT / "LIBRARY_INVENTORY.json"
OUT_MD       = PROJECT_ROOT / "LIBRARY_INVENTORY.md"
ERRORS_MD    = PROJECT_ROOT / "BOOK_IMPORT_ERRORS.md"
CHECKPOINT   = PROJECT_ROOT / "IMPORT_CHECKPOINT.json"
AGENT_LOG    = PROJECT_ROOT / "AGENT_LOG.md"

def normalize_text(text):
    if not text:
        return ""
    t = unorm("NFKD", str(text))
    t = "".join(c for c in t if ord(c) < 128 or not c.isalpha())
    return re.sub(r"\s+", " ", t).strip().lower()

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def safe_str(val, maxlen=500):
    if val is None:
        return ""
    s = re.sub(r"<[^>]+>", "", str(val)).strip()
    return s[:maxlen]

def get_opf_content(zf):
    container = zf.read("META-INF/container.xml").decode("utf-8", errors="ignore")
    m = re.search(r'full-path="([^"]+)"', container)
    if not m:
        raise ValueError("container.xml sin full-path")
    opf_path = m.group(1)
    opf_text = zf.read(opf_path).decode("utf-8", errors="ignore")
    return opf_path, opf_text

def extract_dc(opf, tag):
    m = re.search(rf"<dc:{tag}[^>]*>(.*?)</dc:{tag}>", opf, re.DOTALL | re.IGNORECASE)
    return safe_str(m.group(1)) if m else ""

def extract_all_dc(opf, tag):
    return [safe_str(m.group(1)) for m in
            re.finditer(rf"<dc:{tag}[^>]*>(.*?)</dc:{tag}>", opf, re.DOTALL | re.IGNORECASE)]

def extract_isbn(opf):
    for m in re.finditer(r"<dc:identifier[^>]*>(.*?)</dc:identifier>", opf, re.DOTALL | re.IGNORECASE):
        val = safe_str(m.group(1))
        isbn_m = re.search(r"(?:isbn[:\-\s]*)?(97[89][\d\-]{10,}|\d{9}[\dXx])", val, re.IGNORECASE)
        if isbn_m:
            return re.sub(r"[^\dXx]", "", isbn_m.group(1))
    return ""

def detect_cover(zf, opf, opf_path):
    # Metodo 1: meta name=cover
    m = re.search(r'<meta\s+name="cover"\s+content="([^"]+)"', opf, re.IGNORECASE)
    cover_id = m.group(1) if m else None
    # Metodo 2: item properties=cover-image
    m2 = re.search(r'<item[^>]+properties="cover-image"[^>]*/?>',  opf, re.IGNORECASE)
    if m2:
        return True
    # Metodo 3: archivo con "cover" en nombre
    for e in zf.infolist():
        name = e.filename.lower()
        if re.search(r"cover|portada", name) and re.search(r"\.(jpg|jpeg|png|gif|webp|svg)", name):
            return True
    # Metodo 4: resolver cover_id en manifest
    if cover_id:
        id_m = re.search(rf'<item[^>]+id="{re.escape(cover_id)}"[^>]*href="([^"]+)"', opf, re.IGNORECASE)
        if id_m:
            return True
    return False

def count_spine_items(opf):
    return len(re.findall(r"<itemref\b", opf, re.IGNORECASE))

def count_readable_docs(zf, opf, opf_path):
    base_dir = str(Path(opf_path).parent)
    manifest = {}
    for m in re.finditer(r"<item\s([^>]+)>", opf, re.IGNORECASE):
        attrs = m.group(1)
        id_m  = re.search(r'id="([^"]+)"', attrs)
        hr_m  = re.search(r'href="([^"]+)"', attrs)
        if id_m and hr_m:
            manifest[id_m.group(1)] = hr_m.group(1)
    spine_ids = re.findall(r'<itemref\s[^>]*idref="([^"]+)"', opf, re.IGNORECASE)
    count = 0
    for sid in spine_ids:
        if sid not in manifest:
            continue
        href = manifest[sid]
        candidates = []
        if base_dir and base_dir != ".":
            candidates.append((Path(base_dir) / href).as_posix())
        candidates.append(href)
        for fp in candidates:
            try:
                data = zf.read(fp)
                text = re.sub(rb"<[^>]+>", b"", data)
                if len(text.strip()) > 100:
                    count += 1
                break
            except Exception:
                continue
    return count

def analyze_epub(epub_path: Path) -> dict:
    slug = epub_path.parent.name
    result = {
        "slug": slug,
        "file": epub_path.name,
        "path": str(epub_path),
        "size_bytes": 0,
        "sha256": "",
        "status": "ok",
        "errors": [],
        "title": "",
        "authors": [],
        "language": "",
        "publisher": "",
        "published_date": "",
        "isbn": "",
        "identifiers": [],
        "description": "",
        "subjects": [],
        "spine_items": 0,
        "readable_chapters": 0,
        "has_cover": False,
        "_title_norm": "",
        "_author_norm": "",
    }
    try:
        result["size_bytes"] = epub_path.stat().st_size
    except Exception as e:
        result["errors"].append(f"stat: {e}")
    try:
        result["sha256"] = sha256_file(epub_path)
    except Exception as e:
        result["errors"].append(f"sha256: {e}")
        result["status"] = "error"
        return result
    try:
        with zipfile.ZipFile(epub_path, "r") as zf:
            try:
                opf_path, opf = get_opf_content(zf)
            except Exception as e:
                result["errors"].append(f"opf: {e}")
                result["status"] = "error"
                return result
            result["title"]          = extract_dc(opf, "title")
            result["authors"]        = extract_all_dc(opf, "creator")
            result["language"]       = extract_dc(opf, "language")[:10]
            result["publisher"]      = extract_dc(opf, "publisher")
            result["published_date"] = extract_dc(opf, "date")[:30]
            result["isbn"]           = extract_isbn(opf)
            result["identifiers"]    = extract_all_dc(opf, "identifier")
            result["description"]    = extract_dc(opf, "description")[:800]
            result["subjects"]       = extract_all_dc(opf, "subject")
            result["spine_items"]    = count_spine_items(opf)
            try:
                result["readable_chapters"] = count_readable_docs(zf, opf, opf_path)
            except Exception as e:
                result["errors"].append(f"chapters: {e}")
                result["readable_chapters"] = result["spine_items"]
            try:
                result["has_cover"] = detect_cover(zf, opf, opf_path)
            except Exception as e:
                result["errors"].append(f"cover: {e}")
    except zipfile.BadZipFile:
        result["errors"].append("BadZipFile: EPUB corrupto o no es ZIP valido")
        result["status"] = "error"
        return result
    except Exception as e:
        result["errors"].append(f"zip: {e}")
        result["status"] = "error"
        return result
    if not result["title"]:
        result["errors"].append("WARN: sin titulo en OPF")
        if result["status"] == "ok":
            result["status"] = "warning"
    if not result["authors"]:
        result["errors"].append("WARN: sin autor en OPF")
        if result["status"] == "ok":
            result["status"] = "warning"
    if result["readable_chapters"] == 0:
        result["errors"].append("WARN: 0 capitulos legibles")
        if result["status"] == "ok":
            result["status"] = "warning"
    result["_title_norm"]  = normalize_text(result["title"]  or slug)
    result["_author_norm"] = normalize_text(result["authors"][0] if result["authors"] else "")
    return result

def save_json(all_results, empty_folders, total_epubs, ts):
    data = {
        "schema_version": "1.1",
        "generated_at": ts,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source_path": str(BOOKS_DIR),
        "total_epub_folders": total_epubs,
        "empty_folders": empty_folders,
        "empty_folder_count": len(empty_folders),
        "books": all_results
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def compute_stats(all_results, empty_folders, start_time):
    ok       = sum(1 for r in all_results if r["status"] == "ok")
    warnings = sum(1 for r in all_results if r["status"] == "warning")
    errors   = sum(1 for r in all_results if r["status"] == "error")
    with_cover    = sum(1 for r in all_results if r["has_cover"])
    without_cover = sum(1 for r in all_results if not r["has_cover"])
    with_isbn    = sum(1 for r in all_results if r["isbn"])
    without_isbn = sum(1 for r in all_results if not r["isbn"])
    total_chapters = sum(r["readable_chapters"] for r in all_results)
    total_size     = sum(r["size_bytes"] for r in all_results)
    author_norms = set()
    for r in all_results:
        for a in r["authors"]:
            n = normalize_text(a)
            if n:
                author_norms.add(n)
    languages = defaultdict(int)
    for r in all_results:
        lang = (r["language"] or "desconocido")[:5].strip().lower() or "desconocido"
        languages[lang] += 1
    sha_map = defaultdict(list)
    for r in all_results:
        if r["sha256"]:
            sha_map[r["sha256"]].append(r["slug"])
    exact_dup_groups = {k: v for k, v in sha_map.items() if len(v) > 1}
    key_map = defaultdict(list)
    for r in all_results:
        key = (r["_title_norm"], r["_author_norm"])
        if key[0]:
            key_map[key].append(r["slug"])
    possible_dup_groups = {str(k): v for k, v in key_map.items() if len(v) > 1}
    return {
        "ok": ok, "warnings": warnings, "errors": errors,
        "total": ok + warnings + errors,
        "with_cover": with_cover, "without_cover": without_cover,
        "with_isbn": with_isbn, "without_isbn": without_isbn,
        "total_chapters": total_chapters,
        "total_size_bytes": total_size,
        "total_size_gb": total_size / (1024**3),
        "unique_authors": len(author_norms),
        "languages": dict(sorted(languages.items(), key=lambda x: -x[1])),
        "exact_duplicates": len(exact_dup_groups),
        "exact_dup_groups": exact_dup_groups,
        "possible_duplicates": len(possible_dup_groups),
        "possible_dup_groups": possible_dup_groups,
        "elapsed_min": (time.time() - start_time) / 60,
        "empty_folders": len(empty_folders),
    }

def write_markdown(stats, all_results, empty_folders, ts):
    lines = [
        "# LIBRARY_INVENTORY.md",
        "## Inventario de EPUBs -- Library Content Agent, Etapa 1",
        f"\nGenerado: {ts}",
        f"Fuente: respaldos-software/books/\n",
        "---\n",
        "## Resumen ejecutivo\n",
        "| Metrica | Valor |",
        "|---|---|",
        f"| Total carpetas de libros | {stats['total'] + stats['empty_folders']} |",
        f"| EPUBs encontrados | {stats['total']} |",
        f"| Carpetas sin EPUB | {stats['empty_folders']} |",
        f"| EPUBs validos (OK) | {stats['ok']} |",
        f"| EPUBs con advertencias | {stats['warnings']} |",
        f"| EPUBs con errores/corruptos | {stats['errors']} |",
        f"| Autores unicos | {stats['unique_authors']} |",
        f"| Con portada interna | {stats['with_cover']} |",
        f"| Sin portada | {stats['without_cover']} |",
        f"| Con ISBN | {stats['with_isbn']} |",
        f"| Sin ISBN | {stats['without_isbn']} |",
        f"| Capitulos legibles totales | {stats['total_chapters']:,} |",
        f"| Duplicados exactos (SHA-256) | {stats['exact_duplicates']} |",
        f"| Posibles duplicados (titulo+autor) | {stats['possible_duplicates']} |",
        f"| Tamano total EPUBs | {stats['total_size_gb']:.3f} GB |",
        f"| Tiempo de analisis | {stats['elapsed_min']:.1f} minutos |",
        "\n---\n",
        "## Distribucion de idiomas\n",
        "| Idioma | Cantidad |",
        "|---|---|",
    ]
    for lang, count in list(stats["languages"].items())[:20]:
        lines.append(f"| {lang} | {count} |")
    lines += ["\n---\n", "## Duplicados exactos por SHA-256\n"]
    if stats["exact_dup_groups"]:
        for sha, slugs in list(stats["exact_dup_groups"].items())[:20]:
            lines.append(f"- {sha[:16]}... => {', '.join(slugs)}")
    else:
        lines.append("*No se detectaron duplicados exactos.*")
    lines += ["\n---\n", "## Posibles duplicados por titulo + autor\n"]
    if stats["possible_dup_groups"]:
        for key, slugs in list(stats["possible_dup_groups"].items())[:30]:
            lines.append(f"- {key} => {', '.join(slugs)}")
    else:
        lines.append("*No se detectaron posibles duplicados.*")
    lines += ["\n---\n", "## EPUBs con errores\n"]
    errors_list = [r for r in all_results if r["status"] == "error"]
    if errors_list:
        lines += ["| Slug | Errores |", "|---|---|"]
        for r in errors_list[:100]:
            errs = "; ".join(r["errors"][:2])
            lines.append(f"| {r['slug'][:60]} | {errs[:100]} |")
    else:
        lines.append("*No se registraron errores fatales.*")
    lines += ["\n---\n", "## EPUBs con advertencias\n"]
    warn_list = [r for r in all_results if r["status"] == "warning"]
    lines.append(f"Total: {len(warn_list)} EPUBs con metadatos incompletos.\n")
    if warn_list:
        lines += ["| Slug | Advertencias |", "|---|---|"]
        for r in warn_list[:50]:
            warns = "; ".join(r["errors"][:2])
            lines.append(f"| {r['slug'][:60]} | {warns[:120]} |")
    lines += ["\n---\n", "## Carpetas sin EPUB\n",
              f"Total: {stats['empty_folders']} carpetas sin archivo EPUB.\n"]
    for folder in empty_folders[:40]:
        lines.append(f"- {folder}")
    if len(empty_folders) > 40:
        lines.append(f"- ... y {len(empty_folders) - 40} mas (ver LIBRARY_INVENTORY.json)")
    lines += ["\n---\n", "> Datos completos en LIBRARY_INVENTORY.json",
              "> Generado por: Library Content Agent v1.0"]
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def update_errors_md(errors_log):
    if not errors_log:
        return
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    header = "| Archivo/Slug | Error | Fecha | Fase | Posible Solucion |\n|---|---|---|---|---|"
    rows = [f"| {r['slug'][:60]} | {'; '.join(r['errors'][:1])[:100]} | {ts} | inventario | Revisar estructura EPUB |"
            for r in errors_log]
    content = ERRORS_MD.read_text(encoding="utf-8") if ERRORS_MD.exists() else ""
    marker = "*(Ningún error registrado aún — Importación no iniciada)*"
    if marker in content:
        content = content.replace(marker, header + "\n" + "\n".join(rows))
    else:
        content += "\n\n### Errores -- Etapa 1 Inventario\n\n" + header + "\n" + "\n".join(rows)
    ERRORS_MD.write_text(content, encoding="utf-8")

def update_checkpoint(stats, ts):
    data = {}
    if CHECKPOINT.exists():
        try:
            data = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        except Exception:
            pass
    data.update({
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "stage": "INVENTORY_COMPLETE",
        "notes": "Etapa 1 completada. Listo para Etapa 2 (Prueba Piloto).",
        "inventory_stats": {
            "total_epubs": stats["total"],
            "ok": stats["ok"],
            "warnings": stats["warnings"],
            "errors": stats["errors"],
            "with_cover": stats["with_cover"],
            "without_cover": stats["without_cover"],
            "with_isbn": stats["with_isbn"],
            "without_isbn": stats["without_isbn"],
            "unique_authors": stats["unique_authors"],
            "total_chapters": stats["total_chapters"],
            "exact_duplicates": stats["exact_duplicates"],
            "possible_duplicates": stats["possible_duplicates"],
            "total_size_gb": round(stats["total_size_gb"], 3),
            "elapsed_min": round(stats["elapsed_min"], 1),
        }
    })
    CHECKPOINT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def append_agent_log(stats, ts):
    entry = f"""

---

## {ts[:10]} -- [LIBRARY] Etapa 1: Inventario completo de EPUBs

- Agente: Library Content Agent
- Tipo: Analisis (solo lectura -- sin modificar BD)
- Etapa: 1 -- Inventario

### Resultados

| Dato | Valor |
|---|---|
| EPUBs procesados | {stats['total']} |
| OK (validos) | {stats['ok']} |
| Con advertencias | {stats['warnings']} |
| Con errores | {stats['errors']} |
| Autores unicos | {stats['unique_authors']} |
| Con portada | {stats['with_cover']} |
| Sin portada | {stats['without_cover']} |
| Con ISBN | {stats['with_isbn']} |
| Sin ISBN | {stats['without_isbn']} |
| Capitulos legibles totales | {stats['total_chapters']:,} |
| Duplicados exactos (SHA-256) | {stats['exact_duplicates']} |
| Posibles duplicados | {stats['possible_duplicates']} |
| Tamano total | {stats['total_size_gb']:.3f} GB |
| Tiempo de analisis | {stats['elapsed_min']:.1f} minutos |

### Archivos generados
- LIBRARY_INVENTORY.json
- LIBRARY_INVENTORY.md
- IMPORT_CHECKPOINT.json (actualizado)
- BOOK_IMPORT_ERRORS.md (actualizado)

"""
    with open(AGENT_LOG, "a", encoding="utf-8") as f:
        f.write(entry)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--batch-size", type=int, default=50)
    args = parser.parse_args()
    start_time = time.time()
    ts = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("  Library Content Agent -- Etapa 1: Inventario de EPUBs")
    print(f"  Inicio: {ts}")
    print("=" * 60)
    print(f"\n[*] Escaneando {BOOKS_DIR} ...")
    epub_paths = []
    empty_folders = []
    for folder in sorted(BOOKS_DIR.iterdir()):
        if not folder.is_dir():
            continue
        epubs = list(folder.glob("*.epub"))
        if epubs:
            epub_paths.append(epubs[0])
        else:
            empty_folders.append(folder.name)
    total_epubs = len(epub_paths)
    print(f"[*] Encontrados: {total_epubs} EPUBs | {len(empty_folders)} carpetas sin EPUB\n")
    existing_slugs = set()
    all_results = []
    if args.resume and OUT_JSON.exists():
        try:
            saved = json.loads(OUT_JSON.read_text(encoding="utf-8"))
            all_results = saved.get("books", [])
            existing_slugs = {r["slug"] for r in all_results}
            print(f"[*] Reanudando: {len(existing_slugs)} ya procesados\n")
        except Exception as e:
            print(f"[!] No pude cargar inventario previo: {e}")
    pending = [p for p in epub_paths if p.parent.name not in existing_slugs]
    print(f"[*] Pendientes: {len(pending)} EPUBs\n")
    for i, epub_path in enumerate(pending, 1):
        slug = epub_path.parent.name
        if i == 1 or i % 25 == 0 or i == len(pending):
            elapsed = time.time() - start_time
            eta = (elapsed / i) * (len(pending) - i) if i > 0 else 0
            print(f"[{i:4d}/{len(pending)}] {(i/len(pending))*100:5.1f}%"
                  f"  elapsed={elapsed:.0f}s  eta={eta:.0f}s  {slug[:50]}")
        result = analyze_epub(epub_path)
        all_results.append(result)
        if i % args.batch_size == 0:
            save_json(all_results, empty_folders, total_epubs, ts)
    save_json(all_results, empty_folders, total_epubs, ts)
    stats = compute_stats(all_results, empty_folders, start_time)
    write_markdown(stats, all_results, empty_folders, ts)
    update_errors_md([r for r in all_results if r["status"] == "error"])
    update_checkpoint(stats, ts)
    append_agent_log(stats, ts)
    print("\n" + "=" * 60)
    print("  VERIFICACION DE CONSISTENCIA")
    print("=" * 60)
    total_accounted = stats["total"] + stats["empty_folders"]
    total_expected  = total_epubs + len(empty_folders)
    print(f"  EPUBs procesados:  {stats['total']}")
    print(f"    OK:              {stats['ok']}")
    print(f"    Advertencias:    {stats['warnings']}")
    print(f"    Errores:         {stats['errors']}")
    print(f"  Carpetas sin EPUB: {stats['empty_folders']}")
    print(f"  Total contabilizado: {total_accounted}  (esperado: {total_expected})")
    if total_accounted == total_expected:
        print("  OK: todos los EPUBs contabilizados")
    else:
        print(f"  DIFERENCIA: {total_accounted} vs {total_expected}")
    print(f"\n  Autores unicos:    {stats['unique_authors']}")
    top_langs = list(stats['languages'].items())[:8]
    print(f"  Idiomas:           {top_langs}")
    print(f"  Con portada:       {stats['with_cover']}")
    print(f"  Sin portada:       {stats['without_cover']}")
    print(f"  Con ISBN:          {stats['with_isbn']}")
    print(f"  Sin ISBN:          {stats['without_isbn']}")
    print(f"  Capitulos totales: {stats['total_chapters']:,}")
    print(f"  Dupl. exactos:     {stats['exact_duplicates']}")
    print(f"  Posibles dupl.:    {stats['possible_duplicates']}")
    print(f"  Tamano total:      {stats['total_size_gb']:.3f} GB")
    print(f"  Tiempo total:      {stats['elapsed_min']:.1f} min")
    print("\n" + "=" * 60)
    print(f"  Inventario guardado en:")
    print(f"    {OUT_JSON}")
    print(f"    {OUT_MD}")
    print("=" * 60)

if __name__ == "__main__":
    main()
