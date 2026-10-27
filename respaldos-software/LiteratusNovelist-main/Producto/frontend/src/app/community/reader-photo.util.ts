import { environment } from '../../environments/environment';

/** Foto de perfil de un lector, o null (entonces se ve su Maguito). Los enlaces de la API vienen sin dominio. */
export function readerPhotoUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  return avatar.startsWith('https://') ? avatar : `${environment.apiUrl}${avatar}`;
}

/** Fotos de una lista: si una no carga, esa fila vuelve a su Maguito. */
export class ReaderPhotos {
  private broken = new Set<string>();

  of(card: { friend_code: string; avatar?: string | null }): string | null {
    return this.broken.has(card.friend_code) ? null : readerPhotoUrl(card.avatar);
  }

  failed(code: string): void {
    this.broken.add(code);
  }
}
