/**
 * core/utils/author-photo.util.ts
 *
 * Resuelve la imagen adecuada para un autor, proporcionando recursos locales
 * específicos para casos especiales (como 'Anónimo' y 'Juan Ruiz') cuando no
 * hay imagen remota válida o si falla la red, evitando mostrar la silueta
 * genérica cuando existe una ilustración simbólica o retrato adecuado.
 */

const KNOWN_AUTHOR_PHOTOS: Record<string, string> = {
  'an-nimo': 'assets/images/authors/anonimo.webp',
  'anonimo': 'assets/images/authors/anonimo.webp',
  'juan-ruiz': 'assets/images/authors/juan-ruiz.webp',
};

export function getAuthorPhoto(
  author: { slug?: string; full_name?: string; photo?: string | null } | null | undefined
): string {
  if (!author) return 'assets/images/default-avatar.svg';

  const slug = (author.slug || '').toLowerCase().trim();
  const name = (author.full_name || '').toLowerCase().trim();

  // Si tiene foto válida en la nube (excluyendo dominios antiguos o malformados)
  if (author.photo && !author.photo.includes('srbmswjsbkpftjabcurg') && !author.photo.includes('https%3A')) {
    return author.photo;
  }

  // Fallback a imágenes dedicadas conocidas
  if (KNOWN_AUTHOR_PHOTOS[slug]) {
    return KNOWN_AUTHOR_PHOTOS[slug];
  }

  if (name.includes('anónimo') || name.includes('anonimo')) {
    return 'assets/images/authors/anonimo.webp';
  }

  if (name.includes('juan ruiz') && !name.includes('alarcón') && !name.includes('alarcon')) {
    return 'assets/images/authors/juan-ruiz.webp';
  }

  return author.photo || 'assets/images/default-avatar.svg';
}

export function handleAuthorPhotoError(
  event: Event,
  author?: { slug?: string; full_name?: string } | null
): void {
  const img = event.target as HTMLImageElement;
  if (!img) return;

  const slug = (author?.slug || '').toLowerCase().trim();
  const name = (author?.full_name || '').toLowerCase().trim();

  const isAnonimo = slug === 'an-nimo' || slug === 'anonimo' || name.includes('anónimo') || name.includes('anonimo');
  const isJuanRuiz = (slug === 'juan-ruiz' || name.includes('juan ruiz')) && !name.includes('alarcón') && !name.includes('alarcon');

  if (isAnonimo) {
    if (!img.src.includes('assets/images/authors/anonimo.webp')) {
      img.src = 'assets/images/authors/anonimo.webp';
      return;
    }
  } else if (isJuanRuiz) {
    if (!img.src.includes('assets/images/authors/juan-ruiz.webp')) {
      img.src = 'assets/images/authors/juan-ruiz.webp';
      return;
    }
  }

  img.src = 'assets/images/default-avatar.svg';
}
