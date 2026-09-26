/**
 * core/utils/cover-thumb.util.ts
 *
 * Las portadas se suben a Supabase Storage sin redimensionar (pueden pesar
 * varios MB). Supabase expone un endpoint de transformación de imágenes
 * (`/render/image/public/...`) que redimensiona y comprime al vuelo y cachea
 * el resultado en su CDN. Esta utilidad reescribe la URL cruda para pasar
 * por ese endpoint, evitando descargar el original a tamaño completo en
 * listados y estanterías donde solo se muestra una miniatura.
 */
export function coverThumb(
  url: string | null | undefined,
  width = 360,
  height = 540,
  quality = 62
): string {
  if (!url) return 'assets/default_cover.jpg';
  if (url.includes('/storage/v1/object/public/')) {
    return url.replace('/object/public/', '/render/image/public/')
      + (url.includes('?') ? '&' : '?') + `width=${width}&height=${height}&quality=${quality}&resize=cover`;
  }
  return url;
}
