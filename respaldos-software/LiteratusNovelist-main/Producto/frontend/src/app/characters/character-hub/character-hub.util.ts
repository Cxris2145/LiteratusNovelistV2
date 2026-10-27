import { HubAvatar } from '../../core/services/chat.service';

export const FALLBACK_AVATAR = 'assets/images/default-avatar.svg';

export function hubIdentity(character: HubAvatar): string {
  return character.group_key || character.id;
}

/** Protect infinite scrolling from overlapping pages while preserving homonyms. */
export function uniqueCharacters(characters: HubAvatar[]): HubAvatar[] {
  return [...new Map(characters.map(character => [hubIdentity(character), character])).values()];
}

/** Recorta la copia activa de un control segmentado de `count` partes iguales hasta la `index`. */
export function segmentClip(index: number, count: number): string {
  const step = 100 / count;
  const start = Math.max(index, 0) * step;
  return `inset(0 ${100 - start - step}% 0 ${start}% round 999px)`;
}

export function portraitThumbnail(url: string | null | undefined, width = 300): string {
  if (!url) return FALLBACK_AVATAR;
  if (!url.includes('/storage/v1/object/public/')) return url;
  const thumbnail = new URL(url);
  thumbnail.pathname = thumbnail.pathname.replace('/object/public/', '/render/image/public/');
  // Both bounds + contain preserve the original face, unlike width-only cover.
  thumbnail.searchParams.set('width', String(width));
  thumbnail.searchParams.set('height', String(Math.round(width * 1.25)));
  thumbnail.searchParams.set('quality', '80');
  thumbnail.searchParams.set('resize', 'contain');
  return thumbnail.toString();
}
