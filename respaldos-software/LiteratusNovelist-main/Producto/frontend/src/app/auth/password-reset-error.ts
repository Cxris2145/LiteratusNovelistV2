import { HttpErrorResponse } from '@angular/common/http';

export function passwordResetError(error: HttpErrorResponse, fallback: string): string {
  if (error.status === 429) return 'Has hecho demasiados intentos. Espera antes de intentarlo de nuevo.';
  const body = error.error;
  if (body?.details?.length) return body.details.join(' ');
  if (typeof body?.error === 'string') return body.error;
  for (const field of ['email', 'code', 'new_password', 'confirm_password', 'reset_token']) {
    if (Array.isArray(body?.[field])) return body[field].join(' ');
  }
  return fallback;
}
