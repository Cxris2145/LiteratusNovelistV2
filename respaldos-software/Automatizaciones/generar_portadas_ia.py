import os
import json
import time
import urllib.parse
import urllib.request

books_dir = r"respaldos-software/books"
media_books_dir = r"respaldos-software/LiteratusNovelist-main/Producto/backend/media/books"
json_path = r"respaldos-software/Automatizaciones/Creacion de Portadas_basicas/books_to_generate.json"

with open(json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

slug_map = {item["slug"]: item for item in data}

# Fallback para el ensayo de Rousseau
slug_map["discurso-sobre-el-origen-y-los-fundamentos-de-la-desigualdad-entre-los-hombres-jean-jacques-rousseau"] = {
    "title": "Discurso sobre el origen de la desigualdad entre los hombres",
    "author": "Jean-Jacques Rousseau",
    "prompt": "A masterpiece oil painting of A lone philosopher in 18th-century attire standing in a wild, pristine primeval forest, contemplating human nature and society. Cinematic lighting, rich textures, fine art style, atmospheric. STRICTLY NO TEXT, NO LETTERS, NO SIGNATURES, NO WORDS."
}

book_dirs = [d for d in os.listdir(books_dir) if os.path.isdir(os.path.join(books_dir, d))]
missing = [d for d in book_dirs if not os.path.exists(os.path.join(books_dir, d, "cover.jpg"))]

print(f"Total de libros sin cover.jpg: {len(missing)}")

for i, slug in enumerate(missing, start=1):
    clean_name = slug.replace("-", " ")
    info = slug_map.get(slug, {
        "title": clean_name.title(),
        "author": "",
        "prompt": f"A masterpiece oil painting of {clean_name}. Cinematic lighting, rich textures, fine art style, atmospheric. STRICTLY NO TEXT, NO LETTERS, NO SIGNATURES, NO WORDS."
    })

    prompt = info["prompt"]
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?width=800&height=800&nologo=true&seed={i * 13}"

    print(f"[{i}/{len(missing)}] Generando portada para: {info['title']}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=40) as resp:
            img_bytes = resp.read()

        # Guardar en respaldos-software/books/{slug}/cover.jpg
        p1 = os.path.join(books_dir, slug, "cover.jpg")
        with open(p1, "wb") as f:
            f.write(img_bytes)

        # Guardar en respaldos-software/.../media/books/{slug}/cover.jpg si existe la carpeta
        p2_dir = os.path.join(media_books_dir, slug)
        if os.path.exists(p2_dir):
            p2 = os.path.join(p2_dir, "cover.jpg")
            with open(p2, "wb") as f:
                f.write(img_bytes)

        print(f"   -> Guardado con éxito ({len(img_bytes)} bytes)")
        time.sleep(1)
    except Exception as e:
        print(f"   -> Error: {e}")

print("\nProceso de generación de portadas finalizado.")
