/**
 * Color de la tapa dura de la vista Libro: el tono dominante de la portada real, oscurecido para que
 * parezca tela o cuero. Se calcula una vez por portada y se recuerda. Si la imagen no se puede leer
 * (sin CORS, sin portada) se usa el color del tema.
 */

const CACHE_PREFIX = 'reader-cover-color:';
const memory = new Map<string, string | null>();

/** Promedio de los píxeles con color (ni casi blancos ni casi negros), pesado por su saturación. */
export function dominantColorOf(data: Uint8ClampedArray): [number, number, number] | null {
  let r = 0, g = 0, b = 0, weight = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max < 24 || min > 236) continue; // fondo blanco o negro de la portada
    const w = 0.15 + (max - min) / 255;   // los colores vivos mandan sobre los grises
    r += pr * w; g += pg * w; b += pb * w; weight += w;
  }
  if (weight === 0) return null;
  return [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)];
}

/** Lleva el tono a una tapa sobria: luminosidad entre 18 y 34 %, sin pasar de cierta saturación. */
export function coverBoardColor([r, g, b]: [number, number, number]): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  const sat = Math.min(0.55, s);
  const light = Math.min(0.34, Math.max(0.18, l * 0.55));
  return `hsl(${Math.round(h * 360)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%)`;
}

/** Color de tapa para una portada (null si no se pudo leer). */
export function loadCoverBoardColor(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (memory.has(url)) return Promise.resolve(memory.get(url) ?? null);
  try {
    const saved = localStorage.getItem(CACHE_PREFIX + url);
    if (saved) {
      memory.set(url, saved);
      return Promise.resolve(saved);
    }
  } catch { /* sin almacenamiento */ }

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (color: string | null) => {
      memory.set(url, color);
      if (color) {
        try { localStorage.setItem(CACHE_PREFIX + url, color); } catch { /* sin almacenamiento */ }
      }
      resolve(color);
    };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 36;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const rgb = dominantColorOf(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        done(rgb ? coverBoardColor(rgb) : null);
      } catch {
        done(null); // imagen de otro origen sin permiso de lectura
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
