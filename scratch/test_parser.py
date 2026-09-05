import urllib.request, json, re

def parse_extract(extract, wordToSearch):
    lines = [l.strip() for l in extract.split('\n') if l.strip()]
    definitions = []
    currentPartOfSpeech = 'Definición'
    
    for i in range(len(lines)):
        line = lines[i]
        if line.startswith('=== ') and line.endswith(' ==='):
            currentPartOfSpeech = line.replace('=', '').strip()
        elif re.match(r'^\d+$', line) and i + 1 < len(lines):
            nextLine = lines[i + 1]
            if nextLine and not nextLine.startswith('='):
                definitions.append(nextLine)
                
    if not definitions:
        for line in lines:
            if not line.startswith('=') and len(line) > 15 and not line.startswith('Ejemplo:') and not line.startswith('Sinónimos:'):
                definitions.append(line)
                if len(definitions) >= 3:
                    break
    return currentPartOfSpeech, definitions

words = ['casa', 'pelea', 'caminaba', 'dura', 'había', 'tenía', 'dijo', 'ojos', 'amigos', 'mujercitas']
for w in words:
    url = f'https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&origin=*&titles={urllib.parse.quote(w)}&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'LiteratusReader/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            d = json.loads(res.read().decode('utf-8'))
            pages = d.get('query', {}).get('pages', {})
            p = list(pages.values())[0]
            extract = p.get('extract', '')
            pos, defs = parse_extract(extract, w)
            print(f"Word: {w:<10} | POS: {pos:<15} | Defs: {len(defs)}")
            if defs:
                print(f"   -> {defs[0][:70]}")
            else:
                print("   -> NO DEFINITIONS!")
    except Exception as e:
        print(f"Word: {w:<10} | Error: {e}")
