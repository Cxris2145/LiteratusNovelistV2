"""
catalog/moderation.py — Validación y filtro de lenguaje obsceno para reseñas de la comunidad.
"""
import re
import unicodedata

MAX_REVIEW_COMMENT_LENGTH = 500
MIN_REVIEW_COMMENT_LENGTH = 3

# Mapa de sustituciones comunes (leetspeak / símbolos) usadas para evadir filtros
_LEET_TRANS = str.maketrans({
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '@': 'a',
    '$': 's',
    '5': 's',
    '7': 't',
    '!': 'i',
})

# Palabras obscenas, insultos y vulgarismos en español (general, Chile, LatAm, España) e inglés.
# Se evalúan por palabra completa (\b...\b) tras normalizar acentos (preservando la ñ)
# y colapsar letras repetidas, evitando falsos positivos en vocabulario literario.
PROFANE_WORDS = frozenset({
    # Español general / insultos directos
    'puto', 'putos', 'puta', 'putas', 'putazo', 'putear', 'puteria',
    'hijodeputa', 'hijosdeputa', 'hijadeputa', 'hdp',
    'mierda', 'mierdas', 'mierdero',
    'carajo', 'carajos',
    'cabron', 'cabrona', 'cabrones', 'cabronas',
    'pendejo', 'pendeja', 'pendejos', 'pendejas', 'pendejada', 'pendejadas',
    'imbecil', 'imbeciles', 'idiota', 'idiotas',
    'estupido', 'estupida', 'estupidos', 'estupidas',
    'tarado', 'tarada', 'tarados', 'taradas',
    'mongolico', 'mongolica', 'subnormal', 'subnormales',
    'marica', 'maricas', 'maricon', 'maricones', 'maricona', 'mariconada',
    'joder', 'jodido', 'jodida', 'jodidos', 'jodidas', 'jodete',
    'coño', 'coños', 'gilipollas', 'capullo', 'polla', 'pollas', 'soplapollas',
    'verga', 'vergas', 'vergazo',
    'chinga', 'chingar', 'chingado', 'chingada', 'chingados', 'chingadas',
    'chingatumadre', 'pinche', 'pinches',
    'culero', 'culera', 'culeros', 'culeras',
    'mamaguevo', 'mamahuevo', 'malparido', 'malparida', 'malparidos', 'malparidas',
    'gonorrea', 'pirobo', 'carechimba',
    'culo', 'culos',
    # Modismos vulgares Chile / Cono Sur
    'culiao', 'culia', 'culiaos', 'culias', 'culiado', 'culiada', 'culiados', 'culiadas',
    'qlo', 'qlia', 'qliao', 'ctm',
    'conchetumare', 'conchatumadre', 'conchetumadre', 'conchesumadre',
    'chuchetumare', 'chuchatumadre',
    'weon', 'weona', 'weones', 'weonas',
    'hueon', 'hueona', 'hueones', 'hueonas',
    'aweonao', 'aweona', 'aweonaos', 'ahuevao',
    'wea', 'weas', 'huevada', 'huevadas', 'webada', 'webadas',
    'chucha', 'chuchas', 'maraco', 'maraca', 'maracos', 'maracas',
    'pichula', 'pichulas', 'chupapico', 'tula',
    'zorra', 'zorras', 'prostituta', 'prostitutas', 'ramera', 'rameras',
    'pelotudo', 'pelotuda', 'pelotudos', 'pelotudas',
    'boludo', 'boluda', 'boludos', 'boludas',
    'conchudo', 'conchuda', 'conchudos', 'conchudas',
    'pija', 'pijas', 'poronga', 'porongas',
    'ojete', 'pajero', 'pajera', 'pajeros', 'pajeras',
    'mamon', 'mamona', 'mamones', 'mamonas',
    'chupapija', 'chupaverga', 'chupapolla', 'lameculos',
    'cagar', 'cagada', 'cagado', 'cagadas', 'cagados', 'cagon', 'cagona',
    # Inglés
    'fuck', 'fucker', 'fuckers', 'fucking', 'fucked', 'motherfucker', 'motherfucking',
    'shit', 'shitty', 'bullshit',
    'bitch', 'bitches',
    'asshole', 'assholes', 'bastard', 'bastards',
    'dickhead', 'cock', 'cunt', 'whore', 'slut',
    'nigger', 'nigga', 'faggot', 'retard', 'retarded',
})

# Frases compuestas obscenas
PROFANE_PHRASES = (
    'hijo de puta',
    'hija de puta',
    'hijos de puta',
    'la concha de tu madre',
    'la concha de su madre',
    'concha tu madre',
    'concha de tu madre',
    'vete a la mierda',
    'andate a la mierda',
    'andate a la chucha',
    'vete a la chucha',
    'chupa el pico',
    'chupame el pico',
    'chupame la pija',
    'chupame la verga',
)


def _strip_accents_preserve_enie(text: str) -> str:
    """Elimina tildes/diacríticos conservando la letra ñ."""
    placeholder = '\x00'
    text = text.replace('ñ', placeholder).replace('Ñ', placeholder)
    normalized = unicodedata.normalize('NFD', text)
    stripped = ''.join(ch for ch in normalized if unicodedata.category(ch) != 'Mn')
    return unicodedata.normalize('NFC', stripped).replace(placeholder, 'ñ')


def _collapse_repeats(word: str) -> str:
    """Colapsa caracteres repetidos excesivos (ej. 'puuuutooo' -> 'puto'),
    respetando dígrafos válidos del español (rr, ll, cc)."""
    out = []
    for ch in word:
        if len(out) >= 2 and out[-1] == ch and out[-2] == ch:
            continue
        if len(out) >= 1 and out[-1] == ch and ch not in ('r', 'l', 'c', 'e', 'o', 's'):
            continue
        out.append(ch)
    return ''.join(out)


def _collapse_all_repeats(word: str) -> str:
    """Colapsa toda letra repetida consecutiva ('putoo' -> 'puto')."""
    out = []
    for ch in word:
        if not out or out[-1] != ch:
            out.append(ch)
    return ''.join(out)


def contains_profanity(text: str) -> bool:
    """
    Devuelve True si el texto contiene palabras o expresiones obscenas.
    Tolera mayúsculas, tildes, repetición de letras y sustituciones numéricas/símbolos.
    """
    if not text or not text.strip():
        return False

    cleaned = _strip_accents_preserve_enie(text.lower())
    cleaned_leet = cleaned.translate(_LEET_TRANS)

    # Normalizar espacios para detectar frases compuestas
    normalized_spaces = re.sub(r'[^a-zñ\s]', ' ', cleaned_leet)
    normalized_spaces = re.sub(r'\s+', ' ', normalized_spaces).strip()

    for phrase in PROFANE_PHRASES:
        if re.search(rf'\b{re.escape(phrase)}\b', normalized_spaces):
            return True

    # Extraer tokens alfanuméricos (permitiendo separadores intercalados como p.u.t.o o p*to)
    # 1) Tokens directos tras traducir leetspeak
    tokens = re.findall(r'[a-zñ]+', cleaned_leet)

    # 2) Detectar palabras con símbolos intercalados (ej. p*t*o, m.i.e.r.d.a)
    compact_punct = re.sub(r'(?<=[a-zñ])[._*\-~]+(?=[a-zñ])', '', cleaned_leet)
    tokens.extend(re.findall(r'[a-zñ]+', compact_punct))

    for token in tokens:
        if len(token) < 3:
            continue
        candidates = {
            token,
            _collapse_repeats(token),
            _collapse_all_repeats(token),
        }
        if candidates & PROFANE_WORDS:
            return True

    return False
