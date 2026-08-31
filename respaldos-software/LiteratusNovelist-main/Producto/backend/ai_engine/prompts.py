"""Plantillas de prompt para la estandarización de la biblioteca (sinopsis + portadas).

No contienen claves ni datos sensibles. El texto de la sinopsis debe basarse
EXCLUSIVAMENTE en el fragmento real de la obra que se pasa como contexto.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Sinopsis                                                                    #
# --------------------------------------------------------------------------- #
SYNOPSIS_SYSTEM = (
    "Eres un redactor editorial de una biblioteca digital en español. "
    "Escribes sinopsis de contraportada en español neutro, en tercera persona, "
    "claras y fáciles de leer. "
    "No emites juicios de valor ni usas lenguaje de reseña: nada de 'esta obra', "
    "'esta novela', 'el autor', 'el lector', 'obra maestra', 'nos sumerge', "
    "'imprescindible'. "
    "No revelas el final, ni muertes importantes, ni giros, ni la resolución del conflicto. "
    "No inventas personajes, lugares, fechas ni hechos que no aparezcan en el fragmento "
    "que se te entrega. Si el fragmento es insuficiente, describes solo lo que puedas "
    "sostener con él, sin rellenar con conocimiento externo."
)


def synopsis_prompt(*, title: str, authors: str, genres: str, excerpt: str) -> str:
    return (
        f"Título: {title}\n"
        f"Autor(es): {authors or 'Anónimo'}\n"
        f"Género(s): {genres or 'no especificado'}\n\n"
        "Fragmento inicial real de la obra (única fuente permitida):\n"
        f'"""{excerpt}"""\n\n'
        "Escribe UNA sola sinopsis de contraportada, de 60 a 120 palabras, que incluya:\n"
        "- el protagonista o la voz principal y su situación inicial;\n"
        "- el conflicto o la tensión central;\n"
        "- el tipo de historia (aventura, drama íntimo, sátira, ensayo, poesía, "
        "cuento moral, teatro, etc.).\n"
        "Prohibido: spoilers, muertes, giros ni final; personajes o hechos que no "
        "estén en el fragmento; frases de reseña o valoración; comillas o encabezados.\n"
        "Devuelve solo el texto de la sinopsis."
    )


def synopsis_retry_suffix(issues: list[str]) -> str:
    return (
        "\n\nEl intento anterior no pasó el control de calidad por: "
        + "; ".join(issues)
        + ". Corrige exactamente esos problemas y respeta el límite de 60 a 120 palabras."
    )


# --------------------------------------------------------------------------- #
# Ilustración de portada (Gemini "Nano Banana")                               #
# --------------------------------------------------------------------------- #
COVER_SYSTEM = (
    "Generas ilustraciones originales y sin texto para la colección de literatura clásica "
    "Literatus Novelist. La línea editorial es una pintura digital elegante, literaria y "
    "atemporal, simbólica y contenida. Nunca incluyes texto, letras, números, títulos, nombres "
    "de autor, firmas, logotipos, marcas de agua, marcos ni maquetas de libros. Tampoco copias "
    "ni imitas portadas publicadas existentes."
)


def cover_prompt(*, title: str, authors: str, genres: str, synopsis: str, palette_tone: str) -> str:
    mood = (synopsis or "").strip().replace("\n", " ")[:300] or "literaria y contemplativa"
    return (
        'Ilustración de portada para la colección de literatura clásica "Literatus Novelist". '
        'LÍNEA EDITORIAL FIJA: pintura digital elegante, literaria y atemporal; trazo controlado, '
        'nada infantil salvo que la obra lo pida. Composición limpia con UN motivo focal simbólico, '
        'no literal y sin escena recargada. Paleta oscura y sobria con un acento cálido dorado tenue; '
        'profundidad y atmósfera. Iluminación suave y direccional; textura sutil de grano y pintura. '
        'Formato vertical 2:3. El tercio inferior debe quedar tranquilo, con mucho espacio negativo '
        'y poco contraste para añadir tipografía después. '
        'Sin texto, sin letras, sin números, sin título, sin nombre de autor, sin firma, sin logotipos, '
        'sin marcas de agua, sin marco y sin maqueta de libro 3D. No copiar ni imitar ninguna portada '
        'publicada existente; ilustración original.\n\n'
        f'OBRA: {title}\n'
        f'AUTOR: {authors or "Autor anónimo"}\n'
        f'GÉNERO: {genres or "Literatura clásica"}\n'
        f'TEMA/ATMÓSFERA (evocar, no representar como texto): {mood}\n'
        f'TONO CROMÁTICO DOMINANTE: {palette_tone}\n\n'
        'Entrega una única ilustración vertical 2:3, sin ningún texto.'
    )
