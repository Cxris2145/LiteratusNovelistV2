import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_SNAPSHOT_MAX_AGE_MS, parsePublicHome } from '../src/app/core/data/public-home.mjs';
import { bootstrapLegacyHome, buildHomeSnapshot, fetchPublicJson } from './build-home-snapshot.mjs';

const now = Date.parse('2026-10-20T01:00:00Z');
const genre = { id: 'g1', name: 'Aventura', slug: 'aventura' };
const book = { id: 'b1', slug: 'la-odisea-homero', title: 'La Odisea', synopsis: '', is_featured: true,
  cover_image: 'https://example.com/cover.webp', author_name: 'Homero', genres: [genre] };
function payload() {
  return { version: 1, generated_at: new Date(now).toISOString(), audience: 'public',
    stats: { total_books: 1, total_characters: 1, total_authors: 1, total_genres: 1 },
    books: [structuredClone(book)], starter_books: [], genres: [], cast: [] };
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
const silent = { warn() {}, info() {} };
async function testDirectory() {
  const parent = fileURLToPath(new URL('../.angular/cache/', import.meta.url));
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, 'home-snapshot-test-'));
}

test('allowlist removes private and unexpected fields at every level', () => {
  const home = payload();
  home.access_token = 'secret';
  home.profile = { email: 'private@example.com' };
  home.stats.ink_balance = 100;
  home.books[0].reviews = [{ email: 'private@example.com' }];
  home.books[0].genres[0].token = 'secret';
  const output = JSON.stringify(parsePublicHome(home, now));
  assert.doesNotMatch(output, /secret|private@example.com|ink_balance|reviews/);
  assert.equal(JSON.parse(output).books[0].title, 'La Odisea');
});

test('rejects non-public, expired, future, unbounded and unsafe DTOs', () => {
  for (const change of [
    home => { home.audience = 'adult'; },
    home => { home.version = 2; },
    home => { home.generated_at = new Date(now - HOME_SNAPSHOT_MAX_AGE_MS).toISOString(); },
    home => { home.generated_at = new Date(now + 6 * 60_000).toISOString(); },
    home => { home.books = Array(51).fill(book); },
    home => { home.books[0].cover_image = 'javascript:alert(1)'; },
    home => { home.books[0].cover_image = 'https://user:password@example.com/a.jpg'; },
    home => { home.books[0].cover_image = 'http://example.com/a.jpg'; },
    home => { home.books[0].cover_image = '/media/../private'; },
    home => { home.stats.total_books = -1; }
  ]) {
    const home = payload();
    change(home);
    assert.throws(() => parsePublicHome(home, now));
  }
});

test('accepts media URLs from the local development API without allowing arbitrary HTTP origins', () => {
  const home = payload();
  home.books[0].cover_image = 'http://localhost:8000/media/cover.webp';
  assert.equal(parsePublicHome(home, now).books[0].cover_image, home.books[0].cover_image);
  home.books[0].cover_image = 'http://127.0.0.1:8010/media/cover.webp';
  assert.equal(parsePublicHome(home, now).books[0].cover_image, home.books[0].cover_image);
});

test('public fetch omits credentials, retries server errors and does not retry 404', async () => {
  let calls = 0;
  const result = await fetchPublicJson('https://example.com/home', { fetchImpl: async (_url, init) => {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, undefined);
    return ++calls === 1 ? response({}, 503) : response(payload());
  } });
  assert.equal(result.audience, 'public');
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(fetchPublicJson('https://example.com/home', { fetchImpl: async () => {
    calls++;
    return response({}, 404);
  } }));
  assert.equal(calls, 1);
});

test('legacy bridge excludes adult and missing-age books, including curated detail avatars', async () => {
  let active = 0;
  let maximumActive = 0;
  const publicDetail = { ...book, min_age: 0, avatars: [{ id: 'a1', name: 'Odiseo', avatar_image: book.cover_image }] };
  const fetchImpl = async target => {
    const path = target.pathname;
    if (path.endsWith('/books/')) return response({ results: [{ ...book, min_age: 0 },
      { ...book, id: 'adult', min_age: 18 }, { ...book, id: 'unknown' }] });
    if (path.endsWith('/stats/')) return response(payload().stats);
    if (path.endsWith('/genres/')) return response({ results: [{ ...genre, book_count: 1, cover_image: book.cover_image }] });
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (path.includes('/la-odisea-homero/')) return response(publicDetail);
    // A detail endpoint leaking another age is not enough to publish it.
    return response({ ...publicDetail, slug: path.split('/').at(-2), min_age: 18 });
  };
  const home = await bootstrapLegacyHome('https://example.com/api/v1/', { fetchImpl, now });
  assert.deepEqual(home.books.map(value => value.id), ['b1']);
  assert.deepEqual(home.starter_books.map(value => value.slug), ['la-odisea-homero']);
  assert.deepEqual(home.cast.map(value => value.id), ['a1']);
  assert.ok(maximumActive <= 4);
  assert.doesNotMatch(JSON.stringify(home), /min_age|avatars/);
});

test('build sanitizes before writing and keeps a valid previous snapshot on failure', async () => {
  const directory = await testDirectory();
  const outputPath = join(directory, 'home.json');
  try {
    const incoming = { ...payload(), refresh_token: 'secret' };
    await buildHomeSnapshot({ outputPath, now, log: silent, fetchImpl: async () => response(incoming) });
    assert.doesNotMatch(await readFile(outputPath, 'utf8'), /secret|refresh_token/);
    const previous = await readFile(outputPath, 'utf8');
    await buildHomeSnapshot({ outputPath, now, log: silent, fetchImpl: async () => response({}, 503) });
    assert.equal(await readFile(outputPath, 'utf8'), previous);
  } finally { await rm(directory, { recursive: true }); }
});

test('build fails without fresh data and never overwrites an expired snapshot with an error', async () => {
  const directory = await testDirectory();
  const outputPath = join(directory, 'home.json');
  try {
    const previous = JSON.stringify({ ...payload(), generated_at: new Date(now - HOME_SNAPSHOT_MAX_AGE_MS).toISOString() });
    await writeFile(outputPath, previous);
    await assert.rejects(buildHomeSnapshot({ outputPath, now, log: silent, fetchImpl: async () => response({}, 503) }), /Cannot build/);
    assert.equal(await readFile(outputPath, 'utf8'), previous);
  } finally { await rm(directory, { recursive: true }); }
});

test('build uses legacy bridge only for the missing home endpoint', async () => {
  const directory = await testDirectory();
  const outputPath = join(directory, 'home.json');
  const paths = [];
  try {
    await buildHomeSnapshot({ apiUrl: 'https://example.com/api/v1/', outputPath, now, log: silent,
      fetchImpl: async target => {
        paths.push(target.pathname);
        if (target.pathname.endsWith('/home/')) return response({}, 404);
        if (target.pathname.endsWith('/books/')) return response({ results: [{ ...book, min_age: 0 }] });
        if (target.pathname.endsWith('/stats/')) return response(payload().stats);
        if (target.pathname.endsWith('/genres/')) return response({ results: [] });
        return response({}, 404);
      }
    });
    assert.ok(paths.includes('/api/v1/catalog/books/'));
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).starter_books.length, 1);
  } finally { await rm(directory, { recursive: true }); }
});
