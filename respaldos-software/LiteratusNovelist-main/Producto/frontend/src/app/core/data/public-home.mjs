// Shared by the browser and the build exporter. Only these public DTO fields
// can reach the CDN; unexpected response fields (tokens, profiles, etc.) drop out.
export const HOME_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public home object');
  return value;
}

function text(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('Invalid public home text');
  return value;
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) throw new Error('Invalid public home count');
  return value;
}

function id(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  return text(value, 128);
}

function slug(value) {
  const result = text(value, 300);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) throw new Error('Invalid public home slug');
  return result;
}

function image(value, nullable = false) {
  if (value === null && nullable) return null;
  const result = text(value, 4096, true);
  if (!result) return '';
  // Remote media requires TLS; the local development API may use loopback HTTP.
  if (/^\/(assets|media)\/[a-z0-9/_.%~-]+$/i.test(result) && !result.includes('..')) return result;
  let url;
  try { url = new URL(result); } catch { throw new Error('Invalid public home image URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) throw new Error('Unsafe public home image URL');
  return result;
}

function list(value, max, transform) {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid public home collection');
  return value.map(item => transform(record(item)));
}

/** Validate freshness and return a new allowlisted public payload. */
export function parsePublicHome(value, now = Date.now(), maxAgeMs = HOME_SNAPSHOT_MAX_AGE_MS) {
  const dto = record(value);
  if (dto.version !== 1 || dto.audience !== 'public') throw new Error('Unsupported public home audience/version');
  const generatedAt = text(dto.generated_at, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt)) throw new Error('Invalid public home timestamp');
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs) || generatedMs > now + FUTURE_SKEW_MS || now - generatedMs >= maxAgeMs) throw new Error('Expired public home snapshot');
  const stats = record(dto.stats);
  return {
    version: 1,
    generated_at: new Date(generatedMs).toISOString(),
    audience: 'public',
    stats: {
      total_books: count(stats.total_books),
      total_characters: count(stats.total_characters),
      total_authors: count(stats.total_authors),
      total_genres: count(stats.total_genres)
    },
    books: list(dto.books, 50, book => {
      if (typeof book.is_featured !== 'boolean') throw new Error('Invalid public home featured flag');
      return {
        id: id(book.id), title: text(book.title, 500), slug: slug(book.slug),
        synopsis: text(book.synopsis, 6000, true), is_featured: book.is_featured,
        cover_image: image(book.cover_image, true), author_name: text(book.author_name, 500, true),
        genres: list(book.genres, 40, genre => ({ id: id(genre.id), name: text(genre.name, 200), slug: slug(genre.slug) }))
      };
    }),
    starter_books: list(dto.starter_books, 12, book => ({
      slug: slug(book.slug), title: text(book.title, 500), author: text(book.author, 500, true),
      genre: text(book.genre, 200, true), cover: image(book.cover)
    })),
    genres: list(dto.genres, 13, genre => ({
      name: text(genre.name, 200), slug: slug(genre.slug), bookCount: count(genre.bookCount), image: image(genre.image)
    })),
    cast: list(dto.cast, 8, member => {
      if (typeof member.isPortrait !== 'boolean') throw new Error('Invalid public home portrait flag');
      return {
        id: id(member.id), name: text(member.name, 200), role: text(member.role, 1000, true),
        bookTitle: text(member.bookTitle, 500), bookSlug: slug(member.bookSlug),
        image: image(member.image), isPortrait: member.isPortrait
      };
    })
  };
}
