import urllib.request, json

test_words = [
    'había', 'tenía', 'dijo', 'ojos', 'hombres', 'amigos', 'mujercitas', 'casa',
    'pelea', 'dura', 'crescente', 'madre', 'hermana', 'pequeña', 'grande',
    'después', 'entonces', 'noche', 'tiempo', 'día', 'corazón', 'vida',
    'leporella', 'jo', 'march', 'misterio'
]

results = []
for w in test_words:
    url_wikt = f'https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&origin=*&titles={urllib.parse.quote(w)}&format=json'
    req = urllib.request.Request(url_wikt, headers={'User-Agent': 'LiteratusNovelist/1.0'})
    wikt_found = False
    extract = ""
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            d = json.loads(res.read().decode('utf-8'))
            pages = d.get('query', {}).get('pages', {})
            if pages and '-1' not in pages:
                p = list(pages.values())[0]
                extract = p.get('extract', '')
                wikt_found = len(extract.strip()) > 0
    except Exception as e:
        extract = str(e)
    
    wiki_found = False
    wiki_extract = ""
    if not wikt_found:
        url_wiki = f'https://es.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(w)}'
        req2 = urllib.request.Request(url_wiki, headers={'User-Agent': 'LiteratusNovelist/1.0'})
        try:
            with urllib.request.urlopen(req2, timeout=4) as res2:
                d2 = json.loads(res2.read().decode('utf-8'))
                wiki_extract = d2.get('extract', '')
                wiki_found = len(wiki_extract.strip()) > 0
        except Exception as e:
            wiki_extract = str(e)
            
    results.append({
        'word': w,
        'wikt_found': wikt_found,
        'extract_len': len(extract),
        'wiki_found': wiki_found,
        'wiki_len': len(wiki_extract)
    })

for r in results:
    print(f"{r['word']:<12}: Wikt={r['wikt_found']} ({r['extract_len']}) | Wiki={r['wiki_found']} ({r['wiki_len']})")
