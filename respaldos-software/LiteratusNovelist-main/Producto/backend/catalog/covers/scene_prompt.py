"""Genera un prompt de ESCENA por libro (título + autor + género + sinopsis).

Nunca el mismo prompt para todos. Prohíbe cualquier texto en la imagen: el
título/autor se añaden luego con Pillow (compositor Literatus).
"""

from __future__ import annotations

import re
import unicodedata


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\s+", " ", s)
    return re.sub(r"[^a-z0-9\s]", " ", s).strip()


GENRE_STYLE = {
    "terror": "dark gothic horror scene, deep shadows, cold moonlight, unsettling stillness",
    "policiaca, negra y suspense": "film-noir mystery scene, fog, dim streetlight, rain, tension",
    "ciencia ficcion": "retro-futurist scene, strange machinery or sky, muted otherworldly light",
    "fantasia": "mythic fantasy landscape, ancient ruins, arcane glow",
    "poesia": "lyrical symbolist scene, dreamlike, soft light, one evocative element",
    "teatro": "theatrical scene, dramatic stage lighting, heavy curtains",
    "filosofia": "austere classical setting, stone columns, strong chiaroscuro, a solitary figure",
    "ensayos": "austere study, desk and books, warm lamplight, contemplative",
    "aventuras": "sweeping adventure vista, mountains or open sea, dramatic sky, a lone traveler",
    "accion y aventura": "sweeping adventure vista, mountains or open sea, dramatic sky, a lone traveler",
    "romantica": "intimate romantic scene, warm melancholic light, an interior or garden at dusk",
    "infantil y juvenil": "refined storybook illustration, gentle warm palette, whimsical but painterly",
    "mitos, leyendas y sagas": "ancient mythic scene, weathered stone and gold, epic scale",
    "historia": "historical period scene, aged palette, architectural detail",
    "ficcion historica": "historical period scene, aged palette, architectural detail",
    "novela corta": "a single figure in an evocative literary setting",
    "cuentos": "a single figure in an evocative literary setting",
    "ficcion clasica": "a classic 19th-century literary scene, painterly realism, atmospheric",
    "biografias, diarios y hechos reales": "a period setting with dignified light, portrait-adjacent",
    "religion": "a solemn sacred scene, stone architecture, candlelight",
    "ficcion religiosa y espiritual": "a solemn spiritual scene, light through a window, quiet symbolism",
    "sociedad y ciencias sociales": "an urban period scene, streets or crowds, documentary painterly tone",
    "psicologia": "an intimate symbolic composition, one figure, introspective muted mood",
    "humor": "a wry period scene, warm light, a touch of the absurd, still painterly",
    "satira": "a wry period scene, warm light, a touch of the absurd, still painterly",
    "literatura de viaje": "a travel vista, roads, ships or foreign cityscapes, luminous distance",
}

# (palabras-clave como palabra completa) -> elemento de escena. Orden = prioridad.
KEYWORD_SCENE = [
    (("metamorfosis", "insecto", "escarabajo", "cucaracha"),
     "a cramped early-20th-century bedroom, oppressive, slightly distorted perspective, a shuttered window"),
    (("frankenstein", "laboratorio", "experimento", "galvanismo"),
     "a dim laboratory full of glass instruments and cables, lightning at a tall window"),
    (("quijote", "molinos", "molino", "hidalgo"),
     "a dry Castilian plain at golden hour with distant windmills and a lean rider on a bony horse"),
    (("odisea", "iliada", "troya", "ulises", "aquiles"),
     "an ancient Greek shore, a wooden galley, bronze evening light"),
    (("dracula", "vampiro", "vampiros", "nosferatu"),
     "a castle on a crag under a blood-red moon, bats over bare trees"),
    (("nieve", "nevada", "nevado", "invierno", "ventisca", "escarcha", "helada", "yukon", "trineo"),
     "a snow-covered landscape under a pale winter sky, faint tracks in the snow"),
    (("naufragio", "naufrago", "oceano", "capitan", "marinero", "goleta", "fragata", "velero", "arrecife", "ballena"),
     "a stormy sea and a wooden sailing ship heeling in the swell"),
    (("pirata", "corsario", "abordaje", "tesoro"),
     "a pirate ship at anchor in a hidden cove at dawn"),
    (("castillo", "mansion", "abadia", "catedral", "cripta", "cementerio", "mazmorra", "claustro", "torreon"),
     "old stone architecture, pointed arches and a long shadowed corridor"),
    (("guerra", "batalla", "soldado", "ejercito", "trinchera", "canones", "artilleria", "asedio"),
     "a war-torn field at dusk, distant smoke and broken trees"),
    (("revolucion", "barricada", "guillotina"),
     "a city barricade at night, torchlight and torn banners"),
    (("desierto", "duna", "dunas", "caravana", "beduino", "oasis"),
     "a vast desert of dunes under a burning sky, a small caravan"),
    (("selva", "jungla", "amazonas"),
     "a dense green jungle, humid light through the canopy, a ruined temple"),
    (("bosque", "arboleda", "espesura"),
     "a deep shadowed forest with shafts of pale light"),
    (("tren", "estacion", "ferrocarril", "locomotora", "anden"),
     "an old railway platform wrapped in fog and steam"),
    (("paris", "parisino", "sena"),
     "a Paris street at dusk, wet cobblestones and gas lamps"),
    (("londres", "londinense", "tamesis"),
     "a foggy London street, gas lamps, a hansom cab silhouette"),
    (("madrid", "sevilla", "granada", "toledo", "castilla"),
     "a Spanish old town at dusk, warm stone and long shadows"),
    (("estatua", "pedestal", "golondrina"),
     "a gilded statue on a tall pedestal above a night city, a small bird perched near it"),
    (("ciudad", "avenida", "bulevar", "arrabal", "suburbio"),
     "a 19th-century city street at dusk under gas lamps"),
    (("rio", "puente", "canal"),
     "a misty river and an old stone bridge at dawn"),
    (("lago", "estanque", "laguna"),
     "a still dark lake at twilight, mist on the water"),
    (("montana", "cumbre", "alpes", "cordillera", "acantilado", "risco", "precipicio"),
     "high snowbound mountains at dawn, a narrow path"),
    (("jardin", "rosaleda", "invernadero", "huerto"),
     "an overgrown garden at twilight, a stone bench and climbing roses"),
    (("carta", "cartas", "diario", "manuscrito", "epistola", "epistolas"),
     "an old writing desk with scattered letters and a low oil lamp"),
    (("teatro", "escenario", "bambalinas", "mascaras", "comediante"),
     "an empty theatre stage, a single spotlight and heavy red curtains"),
    (("prision", "carcel", "presidio", "condena", "cadalso"),
     "a stone prison cell, one barred window and a shaft of light"),
    (("hospital", "sanatorio", "manicomio", "tisis", "fiebre", "peste", "epidemia"),
     "a pale sanatorium ward, tall windows, cold clean light"),
    (("iglesia", "convento", "monasterio", "sacerdote", "monje", "capilla", "altar"),
     "a candlelit church interior, stone columns and incense haze"),
    (("hada", "hadas", "duende", "enano", "ogro", "bruja"),
     "a warm storybook forest scene, soft lamplight, gentle wonder"),
]

_STYLE_TAIL = (
    "Painterly oil painting, cinematic directional lighting, muted sophisticated palette, "
    "atmospheric, elegant classic-literature aesthetic, semi-realistic. "
    "Vertical portrait composition, key subject in the central vertical band, "
    "the lower area calm and uncluttered. "
    "Absolutely NO text of any kind anywhere in the image: no letters, no words, no title, "
    "no author name, no numbers, no signature, no logo, no watermark, no captions, "
    "no inscriptions on objects, no frame, no book mockup, no modern vehicles, no cars, no UI. "
    "Not anime, not 3D render, not clipart, not a stock photo, not a childish drawing."
)


def _has_word(hay: str, kw: str) -> bool:
    return re.search(r"\b" + re.escape(kw) + r"\b", hay) is not None


def build_scene_prompt(*, title: str, authors: str, genres: str, synopsis: str) -> str:
    g0 = _norm((genres or "").split(",")[0])
    style = GENRE_STYLE.get(g0, "an evocative classic-literature scene, painterly realism, atmospheric")

    hay = _norm(f"{title} {title} {synopsis}")  # el título pesa doble
    concrete = ""
    for keys, scene in KEYWORD_SCENE:
        if any(_has_word(hay, k) for k in keys):
            concrete = scene
            break

    # El texto del título/autor lo añade después el compositor Pillow. NO se mete
    # en el prompt de la imagen: los títulos cortos e icónicos ("Hamlet") o los
    # títulos corruptos hacían que flux-schnell escribiera letras en la ilustración.
    mood = re.sub(r"\s+", " ", (synopsis or "")).strip()[:200].rstrip(" .")
    # Evita que fragmentos entrecomillados de la sinopsis se rendericen como texto.
    mood = mood.replace('"', "").replace("«", "").replace("»", "")
    extra = f" Atmosphere to evoke (never render as text): {mood}." if mood else ""
    scene_block = (f"Scene: {concrete}. Overall style: {style}." if concrete
                   else f"Scene: {style}.")

    return (
        "Editorial cover illustration for a classic work of literature. "
        f"{scene_block}{extra} "
        + _STYLE_TAIL
    )
