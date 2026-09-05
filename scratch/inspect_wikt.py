import urllib.request, json

words = ['pelea', 'caminaba', 'dura', 'casa', 'mar']
output = []
for w in words:
    url = f'https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&origin=*&titles={w}&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'LiteratusNovelist/1.0'})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        pages = data.get('query', {}).get('pages', {})
        page = list(pages.values())[0] if pages else {}
        output.append(f'=== EXTRACT FOR {w} ===\n' + page.get('extract', '')[:500])

with open('scratch/inspect_wikt.txt', 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(output))
print("Done")
