import urllib.request, json, re

words = [
    "había", "un", "hombre", "que", "vivía", "en", "el", "campo", "muy", "pobre",
    "su", "casa", "era", "pequeña", "pero", "él", "siempre", "decía", "la", "verdad",
    "todos", "los", "días", "salía", "a", "trabajar", "con", "gran", "esfuerzo",
    "entonces", "llegó", "una", "noche", "oscura", "donde", "hubo", "pelea", "dura",
    "entre", "dos", "jóvenes", "mujercitas", "leporella"
]

def parse(extract):
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
                definitions.append({'definition': nextLine})
    if not definitions:
        for line in lines:
            if not line.startswith('=') and len(line) > 15 and not line.startswith('Ejemplo:') and not line.startswith('Sinónimos:'):
                definitions.append({'definition': line})
                if len(definitions) >= 3:
                    break
    return definitions

failed = []
succeeded = []
for w in words:
    url = f'https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&origin=*&titles={urllib.parse.quote(w.lower())}&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'Literatus/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            if pages and '-1' not in pages:
                p = list(pages.values())[0]
                extract = p.get('extract', '')
                defs = parse(extract)
                if defs:
                    succeeded.append((w, len(defs), defs[0]['definition'][:50]))
                else:
                    failed.append((w, 'Parsed 0 defs from extract'))
            else:
                failed.append((w, 'Wiktionary -1 page'))
    except Exception as e:
        failed.append((w, f'Exception: {e}'))

print(f"Total: {len(words)} | Succeeded: {len(succeeded)} | Failed: {len(failed)}")
print("\n--- FAILED WORDS ---")
for f in failed:
    print(f"  {f[0]}: {f[1]}")
