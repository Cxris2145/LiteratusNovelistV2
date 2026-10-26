/** Formatos en español para el panel del control parental (la app no registra el locale 'es'). */

const dateFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  // '2026-10-26' (solo fecha) se lee como medianoche local, no UTC.
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDate(value: string | null | undefined): string {
  const date = parse(value);
  return date ? dateFmt.format(date) : '—';
}

export function formatShortDate(value: string | null | undefined): string {
  const date = parse(value);
  return date ? shortDateFmt.format(date) : '—';
}

export function formatTime(value: string | null | undefined): string {
  const date = parse(value);
  return date ? timeFmt.format(date) : '';
}

/** «hace 5 min», «hace 3 h», «ayer», «hace 4 días» o la fecha. */
export function relativeTime(value: string | null | undefined, now = new Date()): string {
  const date = parse(value);
  if (!date) return 'sin actividad todavía';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return `hace ${Math.round(minutes / 60)} h`;
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return formatDate(value);
}

/** Encabezado de un día en la línea de tiempo: «Hoy», «Ayer» o «lunes 20 de octubre». */
export function dayHeading(value: string, now = new Date()): string {
  const date = parse(value);
  if (!date) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  const text = dayFmt.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clave local (AAAA-MM-DD) para agrupar eventos por día. */
export function localDayKey(value: string): string {
  const date = parse(value);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function initialOf(name: string | null | undefined): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Mensaje legible de un error del backend (DRF: {error}, {detail} o errores por campo). */
export function apiErrorMessage(err: any, fallback: string): string {
  if (err?.status === 429) return 'Hiciste demasiados intentos. Espera un rato y vuelve a probar.';
  if (err?.status === 0) return 'No hay conexión con el servidor. Revisa tu internet y vuelve a probar.';
  const body = err?.error;
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.detail === 'string') return body.detail;
  if (body && typeof body === 'object') {
    for (const value of Object.values(body)) {
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
      if (typeof value === 'string') return value;
    }
  }
  return fallback;
}

/** Errores por campo de DRF ({username: ['…']}) o del control parental ({field, error}). */
export function fieldErrors(err: any): Record<string, string> {
  const body = err?.error;
  const result: Record<string, string> = {};
  if (!body || typeof body !== 'object') return result;
  if (typeof body.field === 'string' && typeof body.error === 'string') {
    result[body.field] = body.error;
    return result;
  }
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value) && typeof value[0] === 'string') result[key] = value.join(' ');
  }
  return result;
}
