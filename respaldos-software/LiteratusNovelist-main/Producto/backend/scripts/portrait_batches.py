"""Track built-in image-tool outputs; this script never calls a paid provider.

`next` emits one safe prompt from the exported catalog. `save` copies an already
generated file and records its exact identity/hash for import_portraits.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

BACKEND = Path(__file__).resolve().parents[1]
TASK = BACKEND / '.tmp-portraits'
SOURCES = BACKEND / 'media' / 'portrait_sources'
GENERATED_ROOT = Path.home() / '.codex' / 'generated_images'


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.writing')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def groups():
    result = {}
    for avatar in read(TASK / 'catalog-manifest.json', {})['avatars']:
        result.setdefault(avatar['identity_key'], []).append(avatar)
    return result


def completed():
    result = set()
    for path in TASK.glob('generation-*.json'):
        data = read(path, [])
        records = data.get('records', []) if isinstance(data, dict) else data
        result.update(record['identity_key'] for record in records if record.get('status') in ('generated', 'generated_reviewed', 'reused_reviewed', 'published'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    query = sub.add_parser('next')
    query.add_argument('--partition', type=int, choices=(0, 1, 2), default=2)
    query.add_argument('--count', type=int, default=1)
    query.add_argument('--characters-only', action='store_true')
    save = sub.add_parser('save')
    save.add_argument('--identity', required=True)
    save.add_argument('--image', required=True)
    save.add_argument('--prompt', required=True)
    save.add_argument('--worker', choices=('root',), default='root')
    reuse = sub.add_parser('reuse')
    reuse.add_argument('--identity', required=True)
    reuse.add_argument('--source', required=True, help='Reviewed source relative to media/portrait_sources.')
    reuse.add_argument('--sha256', required=True)
    reuse.add_argument('--prompt', required=True)
    reuse.add_argument('--worker', choices=('root',), default='root')
    options = parser.parse_args()
    catalog = groups()
    if options.command == 'next':
        done = completed()
        # Approved Aquiles and manually prioritized Nemo are handled separately.
        excluded = {key for key, rows in catalog.items() if rows[0]['name'] in ('Aquiles', 'Capitán Nemo')}
        pending = [(key, rows) for key, rows in catalog.items()
                   if key not in done | excluded and (not options.characters_only or not rows[0]['is_author'])
                   and int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 3 == options.partition
                   and any(not row['existing_image']['path'] for row in rows)]
        priority_rows = read(TASK / 'character-priority.json', []) if options.characters_only else []
        rank = {row['identity_key']: index for index, row in reversed(list(enumerate(priority_rows)))}
        pending.sort(key=lambda item: (rank.get(item[0], len(rank)), not item[1][0]['is_author'], -len(item[1]), item[0]))
        if not pending:
            print(json.dumps({'done': True}))
            return
        selected = []
        for key, rows in pending[:max(1, min(options.count, 8))]:
            first = rows[0]
            selected.append({'identity_key': key, 'name': first['name'], 'book_title': first['book_title'],
                             'avatar_ids': [row['avatar_id'] for row in rows], 'prompt': first['prompt']})
        print(json.dumps(selected[0] if options.count == 1 else selected, ensure_ascii=False))
        return
    if options.identity not in catalog:
        raise ValueError('La identidad no está en el catálogo exportado.')
    source = (SOURCES / options.source).resolve() if options.command == 'reuse' else Path(options.image).resolve()
    allowed_root = SOURCES.resolve() if options.command == 'reuse' else GENERATED_ROOT.resolve()
    if not source.is_relative_to(allowed_root) or not source.is_file():
        raise ValueError('Solo se importan archivos existentes de generated_images de Codex.')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if options.command == 'reuse' and digest != options.sha256:
        raise ValueError('El retrato revisado no coincide con su SHA256 esperado.')
    name = hashlib.sha256(options.identity.encode()).hexdigest()[:24] + '-' + digest[:12] + '.png'
    destination = SOURCES / 'generated' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
        raise ValueError('El archivo de destino ya existe con contenido diferente.')
    if not destination.exists():
        shutil.copy2(source, destination)
    index = TASK / f'generation-{options.worker}.json'
    records = read(index, [])
    if isinstance(records, dict):
        records = records['records']
    entry = {'identity_key': options.identity, 'avatar_ids': [row['avatar_id'] for row in catalog[options.identity]],
             'source': destination.relative_to(SOURCES).as_posix(), 'sha256': digest,
             'prompt': options.prompt, 'status': 'reused_reviewed' if options.command == 'reuse' else 'generated_reviewed'}
    records = [record for record in records if record['identity_key'] != options.identity] + [entry]
    write(index, records)
    print(json.dumps({'name': catalog[options.identity][0]['name'], 'source': entry['source'], 'avatars': len(entry['avatar_ids'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
