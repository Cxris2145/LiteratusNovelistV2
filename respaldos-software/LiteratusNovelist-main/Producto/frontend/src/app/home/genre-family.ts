/**
 * Agrupa los géneros del catálogo en cinco familias. Cada familia tiene un
 * color propio en la portada, así que el color de un libro indica su género.
 */
export type GenreFamilyId = 'narrativa' | 'escena' | 'pensamiento' | 'aventura' | 'misterio';

export interface GenreFamily {
  id: GenreFamilyId;
  label: string;
}

const FAMILIES: Record<GenreFamilyId, GenreFamily> = {
  narrativa: { id: 'narrativa', label: 'Narrativa' },
  escena: { id: 'escena', label: 'Teatro y poesía' },
  pensamiento: { id: 'pensamiento', label: 'Pensamiento' },
  aventura: { id: 'aventura', label: 'Aventura' },
  misterio: { id: 'misterio', label: 'Misterio' }
};

const BY_SLUG: Record<string, GenreFamilyId> = {
  'cuentos': 'narrativa',
  'novela-corta': 'narrativa',
  'ficcion-clasica': 'narrativa',
  'ficcion-contemporanea': 'narrativa',
  'ficcion-historica': 'narrativa',
  'romantica': 'narrativa',
  'ficcion-erotica': 'narrativa',
  'antologias': 'narrativa',
  'humor': 'narrativa',
  'satira': 'narrativa',
  'infantil-y-juvenil': 'narrativa',
  'teatro': 'escena',
  'poesia': 'escena',
  'arte-cine-y-fotografia': 'escena',
  'historia-teoria-literaria-y-critica': 'escena',
  'filosofia': 'pensamiento',
  'ensayos': 'pensamiento',
  'religion': 'pensamiento',
  'ficcion-religiosa-y-espiritual': 'pensamiento',
  'politica': 'pensamiento',
  'historia': 'pensamiento',
  'sociedad-y-ciencias-sociales': 'pensamiento',
  'psicologia': 'pensamiento',
  'autoayuda-y-superacion-personal': 'pensamiento',
  'ciencias-tecnologia-y-medicina': 'pensamiento',
  'biografias-diarios-y-hechos-reales': 'pensamiento',
  'accion-y-aventura': 'aventura',
  'literatura-de-viaje': 'aventura',
  'ciencia-ficcion': 'aventura',
  'fantasia': 'aventura',
  'mitos-leyendas-y-sagas': 'aventura',
  'terror': 'misterio',
  'policiaca-negra-y-suspense': 'misterio'
};

export const FAMILY_ORDER: GenreFamilyId[] = ['narrativa', 'escena', 'pensamiento', 'aventura', 'misterio'];

/** Familia de un género; los géneros nuevos caen en una familia estable según su slug. */
export function genreFamily(slug: string | null | undefined): GenreFamily {
  if (!slug) return FAMILIES.narrativa;
  const known = BY_SLUG[slug];
  if (known) return FAMILIES[known];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return FAMILIES[FAMILY_ORDER[Math.abs(hash) % FAMILY_ORDER.length]];
}

/** Familia de un libro según su primer género. */
export function bookFamily(book: { genres?: { slug: string }[] } | null | undefined): GenreFamily {
  return genreFamily(book?.genres?.[0]?.slug);
}
