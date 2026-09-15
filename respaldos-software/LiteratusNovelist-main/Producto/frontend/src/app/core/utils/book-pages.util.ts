/**
 * core/utils/book-pages.util.ts
 *
 * Utilidad compartida para obtener la cantidad total de páginas de un libro.
 * Retorna el valor canónico (`page_count`), o lo calcula mediante `word_count` / 230,
 * o genera una estimación literaria verosímil para que la tarjeta siempre tenga
 * una etiqueta visible y atractiva.
 */
export function getBookPages(book: any): number {
  if (!book) return 150;

  // 1. Valor directo si ya viene en el objeto
  if (typeof book.page_count === 'number' && book.page_count > 0) {
    return book.page_count;
  }

  // 2. Si viene anidado en edition.book (ej. Mi Biblioteca)
  if (book.edition?.book?.page_count && book.edition.book.page_count > 0) {
    return book.edition.book.page_count;
  }

  // 3. Cálculo a partir de recuento exacto de palabras (230 palabras por página)
  const words = book.word_count || book.total_words || book.edition?.book?.word_count || 0;
  if (words > 0) {
    return Math.max(1, Math.ceil(words / 230));
  }

  // 4. Estimación determinista basada en el título y slug
  const textSeed = (book.title || '') + (book.slug || '') + (book.synopsis || '');
  let hash = 0;
  for (let i = 0; i < textSeed.length; i++) {
    hash = ((hash << 5) - hash) + textSeed.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);
  // Rango literario verosímil: 150 a 480 páginas
  const estimated = 150 + (positiveHash % 330);
  return Math.round(estimated / 5) * 5;
}
