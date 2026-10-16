const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "ahora", "hace 5 min", "hace 2 h", "ayer" o la fecha corta: para mensajes de la taberna. */
export function timeAgo(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return 'ahora';
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 2 * DAY) return 'ayer';
  return new Date(time).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

/** Hora para una charla: "14:05". */
export function clockTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Separador de día para una charla: "Hoy", "Ayer" o "12 de octubre". */
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(Date.parse(iso));
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
