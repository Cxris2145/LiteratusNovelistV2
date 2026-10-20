export interface PublicHomeBook {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  is_featured: boolean;
  cover_image: string | null;
  author_name: string;
  genres: { id: string; name: string; slug: string }[];
}

export interface PublicHome {
  version: 1;
  generated_at: string;
  audience: 'public';
  stats: { total_books: number; total_characters: number; total_authors: number; total_genres: number };
  books: PublicHomeBook[];
  starter_books: { slug: string; title: string; author: string; genre: string; cover: string }[];
  genres: { name: string; slug: string; bookCount: number; image: string }[];
  cast: { id: string; name: string; role: string; bookTitle: string; bookSlug: string; image: string; isPortrait: boolean }[];
}

export const HOME_SNAPSHOT_MAX_AGE_MS: number;
export function parsePublicHome(value: unknown, now?: number, maxAgeMs?: number): PublicHome;
