import { environment } from '../../../environments/environment';

/**
 * Avisa que la cuenta de prueba se va. Con `final` el servidor la borra ya (cerró sesión); sin él,
 * la deja vencer en un minuto. Va con sendBeacon (sobrevive al cierre de la página): sin cabeceras,
 * así que el token viaja en el cuerpo, como texto plano para no necesitar un preflight de CORS.
 */
export function sendGuestLeave(final: boolean): void {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  const url = `${environment.apiUrl}users/guest/leave/`;
  const body = new Blob([JSON.stringify({ token, final })], { type: 'text/plain' });
  try {
    if (navigator.sendBeacon?.(url, body)) return;
  } catch { /* sin sendBeacon: fetch con keepalive */ }
  fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
}
