// Iconos de Material Symbols que usa el sitio.
//
// Las fuentes completas de Google pesan 5,4 MB (Rounded) y 4 MB (Outlined). El sitio
// sirve una versión recortada con solo los iconos que aparecen en el código
// (src/assets/fonts/*.woff2), generada por scripts/icon-fonts/subset_icons.py.
//
//   node scripts/icon-fonts.mjs           revisa que todos los iconos usados estén en la fuente
//                                          (corre antes de `ng serve` y `ng build`; solo avisa)
//   node scripts/icon-fonts.mjs --write   reescribe scripts/icon-fonts/icons.txt
//
// Si aparece el aviso de iconos que faltan: `node scripts/icon-fonts.mjs --write` y luego
// `python scripts/icon-fonts/subset_icons.py` (necesita `pip install fonttools brotli`).
// Mientras tanto, esos iconos se ven como texto (p. ej. «shopping_bag»).
//
// Se buscan nombres válidos de iconos en: textos entre comillas de los .ts, plantillas .html,
// `content:` de los .css, textos de src/assets/data, y textos exactos del backend (Python).
// Los iconos que solo vienen de la base de datos van en scripts/icon-fonts/extra-icons.txt.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'scripts', 'icon-fonts');
const BACKEND = resolve(ROOT, '..', 'backend');

const readList = file => existsSync(file)
  ? readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
  : [];

const NAMES = new Set(readList(join(DIR, 'material-symbols-names.txt')));

function walk(dir, test, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, test, out);
    else if (test(entry.name)) out.push(path);
  }
  return out;
}

function addTokens(text, found) {
  for (const m of text.matchAll(/[a-z0-9_]+/g)) if (NAMES.has(m[0])) found.add(m[0]);
}

const STRING = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

export function usedIcons() {
  const found = new Set();
  for (const file of walk(join(ROOT, 'src'), n => /\.(ts|html|css|json)$/.test(n) && !n.endsWith('.spec.ts'))) {
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.html')) addTokens(text.replace(/<!--[\s\S]*?-->/g, ''), found);
    else if (file.endsWith('.css')) for (const m of text.matchAll(/content:\s*(['"])([^'"]*)\1/g)) addTokens(m[2], found);
    else if (file.endsWith('.json')) for (const m of text.matchAll(/"([a-z0-9_]+)"/g)) { if (NAMES.has(m[1])) found.add(m[1]); }
    else for (const m of text.matchAll(STRING)) addTokens(m[1] ?? m[2] ?? m[3], found);
  }
  // El backend manda iconos en sus respuestas (logros, Senda, Bazar, panel): solo textos exactos.
  if (existsSync(BACKEND)) {
    for (const file of walk(BACKEND, n => n.endsWith('.py'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/['"]([a-z0-9_]+)['"]/g)) if (NAMES.has(m[1])) found.add(m[1]);
    }
  }
  for (const name of readList(join(DIR, 'extra-icons.txt'))) if (NAMES.has(name)) found.add(name);
  return [...found].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const used = usedIcons();
  const listFile = join(DIR, 'icons.txt');
  if (process.argv.includes('--write')) {
    writeFileSync(listFile, used.join('\n') + '\n');
    console.log(`icons.txt: ${used.length} iconos. Ahora: python scripts/icon-fonts/subset_icons.py`);
  } else {
    const inFont = new Set(readList(listFile));
    const missing = used.filter(n => !inFont.has(n));
    if (missing.length) {
      console.warn(`\n⚠  ${missing.length} icono(s) no están en la fuente recortada y se verán como texto:\n   ${missing.join(', ')}\n` +
        '   Arreglo: node scripts/icon-fonts.mjs --write && python scripts/icon-fonts/subset_icons.py\n');
    }
  }
}
