import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePublicHome } from '../src/app/core/data/public-home.mjs';

const DEFAULT_API_URL = 'https://literatus-novelist.westus.cloudapp.azure.com/api/v1/';
const DEFAULT_OUTPUT = fileURLToPath(new URL('../src/assets/data/home-public.json', import.meta.url));
const STARTERS = [
  'la-odisea-homero', 'la-metamorfosis-kafka-franz', 'romeo-y-julieta-shakespeare-william',
  'la-casa-de-bernarda-alba-garcia-lorca-federico',
  'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis', 'frankenstein-mary-shelley',
  'la-vida-de-lazarillo-de-tormes-anonimo', 'rimas-gustavo-adolfo-becquer',
  'veinte-mil-leguas-de-viaje-submarino-verne-julio', 'hamlet-shakespeare-william',
  'la-divina-comedia-dante-alighieri', 'la-celestina-fernando-de-rojas'
];
const CAST = [
  ['Odiseo', 'la-odisea-homero', 'Rey de Ítaca. Tarda veinte años en volver a casa.'],
  ['Aquiles', 'la-iliada-homero', 'El mejor guerrero griego, y el más orgulloso.'],
  ['Virgilio', 'la-divina-comedia-dante-alighieri', 'Guía a Dante por el Infierno y el Purgatorio.'],
  ['Capitán Nemo', 'veinte-mil-leguas-de-viaje-submarino-verne-julio', 'Comandante del Nautilus, en guerra con la superficie.'],
  ['Gregorio Samsa', 'la-metamorfosis-kafka-franz', 'Despierta convertido en insecto y aún piensa en su trabajo.'],
  ['Alicia', 'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis', 'Cae por la madriguera y discute con todo el que encuentra.'],
  ['El Monstruo', 'frankenstein-mary-shelley', 'Busca respuestas de quien le dio la vida.'],
  ['Julieta', 'romeo-y-julieta-shakespeare-william', 'Desafía a su familia por amor a un Montesco.']
];

function publicUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) {
    throw new Error('Snapshot URL must use HTTPS without credentials (localhost HTTP is allowed)');
  }
  return url;
}

export async function fetchPublicJson(url, { fetchImpl = fetch, attempts = 2, timeoutMs = 80_000 } = {}) {
  const target = publicUrl(url);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(target, {
        headers: { Accept: 'application/json' },
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const error = new Error(`Public API returned HTTP ${response.status}`);
        error.responseStatus = response.status;
        throw error;
      }
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Public API did not return JSON');
      const body = await response.text();
      if (Buffer.byteLength(body) > 2_000_000) throw new Error('Public API payload is too large');
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.responseStatus && error.responseStatus < 500 && error.responseStatus !== 429) throw error;
    }
  }
  throw lastError;
}

function results(value) {
  const rows = Array.isArray(value) ? value : value?.results;
  if (!Array.isArray(rows)) throw new Error('Invalid legacy public collection');
  return rows;
}

async function mapLimited(items, limit, callback) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await callback(items[index]);
    }
  }));
  return output;
}

function publicBook(book, mediaUrl) {
  return {
    id: book.id, title: book.title, slug: book.slug, synopsis: (book.synopsis || '').slice(0, 480),
    is_featured: book.is_featured === true, cover_image: book.cover_image ? mediaUrl(book.cover_image) : null,
    author_name: book.author_name || book.book_authors?.[0]?.author?.full_name || '',
    genres: (book.genres || []).map(genre => ({ id: genre.id, name: genre.name, slug: genre.slug }))
  };
}

/** One-time migration bridge: anonymous legacy APIs, strictly age 0, at build time only. */
export async function bootstrapLegacyHome(apiUrl, options = {}) {
  const base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  const get = path => fetchPublicJson(new URL(path, base), options);
  const mediaUrl = value => {
    if (!value) return '';
    return typeof value === 'string' && value.startsWith('/media/') ? new URL(value, base).href : value;
  };
  const [catalog, stats, genreResponse] = await Promise.all([
    get('catalog/books/?ordering=-is_featured,-created_at&page_size=50'),
    get('catalog/stats/'),
    get('catalog/genres/?page_size=100')
  ]);
  // Do not infer age from anonymity: old deployments may not apply age filters.
  const safeBooks = results(catalog).filter(book => book?.min_age === 0).slice(0, 50);
  if (!safeBooks.length) throw new Error('No explicitly public books available for the snapshot');
  const slugs = [...new Set([...STARTERS, ...CAST.map(member => member[1])])];
  const details = await mapLimited(slugs, 4, async slug => {
    try {
      const book = await get(`catalog/books/${encodeURIComponent(slug)}/`);
      return book?.min_age === 0 && book.slug === slug ? book : null;
    } catch {
      // A curated book can be deleted/reclassified without breaking the build.
      return null;
    }
  });
  const bySlug = new Map(details.filter(Boolean).map(book => [book.slug, book]));
  const curated = STARTERS.map(slug => bySlug.get(slug)).filter(book => book?.cover_image);
  const starters = curated.length ? curated : safeBooks.filter(book => book.cover_image).slice(0, 12);
  const normalize = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cast = (await mapLimited(CAST, 4, async ([name, bookSlug, role]) => {
    const book = bySlug.get(bookSlug);
    if (!book) return null;
    let avatar = book.avatars?.find(member => normalize(member.name || '').includes(normalize(name)));
    if (!avatar) {
      try {
        const response = await get(`ai/hub/avatars/?q=${encodeURIComponent(name)}&page_size=10`);
        avatar = results(response).find(member => member.book_slug === bookSlug);
      } catch { return null; }
    }
    if (!avatar) return null;
    const portrait = avatar.avatar_image_url || avatar.avatar_image || '';
    return { id: avatar.id, name, role, bookTitle: book.title, bookSlug,
      image: mediaUrl(portrait || book.cover_image || ''), isPortrait: Boolean(portrait) };
  })).filter(Boolean);
  return parsePublicHome({
    version: 1, generated_at: new Date(options.now ?? Date.now()).toISOString(), audience: 'public', stats,
    books: safeBooks.map(book => publicBook(book, mediaUrl)),
    starter_books: starters.map(book => ({ slug: book.slug, title: book.title,
      author: book.author_name || book.book_authors?.[0]?.author?.full_name || '',
      genre: book.genres?.[0]?.name || '', cover: mediaUrl(book.cover_image) })),
    genres: results(genreResponse).filter(genre => genre.book_count > 0)
      .sort((a, b) => b.book_count - a.book_count).slice(0, 13)
      .map(genre => ({ name: genre.name, slug: genre.slug, bookCount: genre.book_count, image: mediaUrl(genre.cover_image) })),
    cast
  }, options.now);
}

async function writeSnapshot(path, home) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(home)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function buildHomeSnapshot({ apiUrl = DEFAULT_API_URL, snapshotUrl,
  outputPath = DEFAULT_OUTPUT, now = Date.now(), log = console, ...options } = {}) {
  const apiBase = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
  const url = snapshotUrl || new URL('catalog/home/', publicUrl(apiBase)).href;
  let home;
  try {
    try {
      home = parsePublicHome(await fetchPublicJson(url, options), now);
    } catch (error) {
      if (error.responseStatus !== 404 || snapshotUrl) throw error;
      log.warn('Public home endpoint is not deployed yet; building from anonymous age-0 legacy data.');
      home = await bootstrapLegacyHome(apiBase, { ...options, now });
    }
  } catch (error) {
    try {
      home = parsePublicHome(JSON.parse(await readFile(outputPath, 'utf8')), now);
      log.warn('Public API unavailable; preserving the existing unexpired public snapshot.');
    } catch {
      throw new Error('Cannot build a fresh public home snapshot. Deploy the backend or retry; the existing file was not changed.', { cause: error });
    }
  }
  await writeSnapshot(outputPath, home);
  log.info(`Public home snapshot ready: ${home.books.length} books, ${home.starter_books.length} starters, ${home.cast.length} characters.`);
  return home;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildHomeSnapshot({ apiUrl: process.env.PUBLIC_API_URL || DEFAULT_API_URL,
    snapshotUrl: process.env.HOME_SNAPSHOT_URL }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
