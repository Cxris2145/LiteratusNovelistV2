import urllib.request, urllib.parse, json, re

def clean_extract(extract):
    lines = [l.strip() for l in extract.split('\n') if l.strip()]
    definitions = []
    part_of_speech = 'Definición'
    
    pos_keywords = ['sustantivo', 'verbo', 'adjetivo', 'adverbio', 'forma verbal', 'forma adjetiva', 'pronombre', 'interjección', 'locución']
    
    for i, line in enumerate(lines):
        lower_line = line.lower()
        if any(kw in lower_line for kw in pos_keywords) and ('=' in line or line.startswith('forma')):
            clean_pos = re.sub(r'[=]', '', line).strip()
            if clean_pos:
                part_of_speech = clean_pos.capitalize()
        
        # Match lines like "1 Vivienda" or "1" followed by definition
        num_match = re.match(r'^(\d+)\s*(.*)$', line)
        if num_match:
            rest = num_match.group(2).strip()
            if rest and len(rest) > 10 and not rest.startswith(('Sinónimo', 'Antónimo', 'Ejemplo', 'Relacionado')):
                definitions.append(rest)
            elif i + 1 < len(lines):
                next_l = lines[i + 1]
                if not next_l.startswith('=') and len(next_l) > 10:
                    definitions.append(next_l)
                    
    if not definitions:
        for line in lines:
            if not line.startswith('=') and len(line) > 15 and not line.startswith(('Sinónimo', 'Antónimo', 'Ejemplo', 'Relacionado')):
                definitions.append(line)
                if len(definitions) >= 3:
                    break
                    
    return part_of_speech, definitions[:3]

def lookup(word):
    w_clean = word.strip()
    # 1. Try Wiktionary Action API with user-agent
    url = f'https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles={urllib.parse.quote(w_clean.lower())}|{urllib.parse.quote(w_clean)}&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'LiteratusNovelist/2.0 (educational app; contact@literatus.app)'})
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            for pid, page in pages.items():
                if pid != '-1' and page.get('extract'):
                    pos, defs = clean_extract(page.get('extract', ''))
                    if defs:
                        return {'word': page.get('title', w_clean), 'partOfSpeech': pos, 'definitions': defs, 'source': 'Wikcionario'}
    except Exception as e:
        pass
        
    # 2. Try Wikipedia Summary API
    url_wiki = f'https://es.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(w_clean)}'
    req_wiki = urllib.request.Request(url_wiki, headers={'User-Agent': 'LiteratusNovelist/2.0 (educational app; contact@literatus.app)'})
    try:
        with urllib.request.urlopen(req_wiki, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            if data.get('extract'):
                return {'word': data.get('title', w_clean), 'partOfSpeech': data.get('description', 'Enciclopedia'), 'definitions': [data.get('extract')], 'source': 'Wikipedia'}
    except Exception as e:
        pass
        
    return None

test_words = ['casa', 'pelea', 'dura', 'caminaba', 'mujercitas', 'leporella', 'corazón', 'había', 'Londres', 'amigos']
for w in test_words:
    res = lookup(w)
    if res:
        print(f"OK: {w} -> [{res['partOfSpeech']}] {res['definitions'][0][:60]}")
    else:
        print(f"FAILED: {w}")
