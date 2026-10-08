import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Fecha local de hoy en formato YYYY-MM-DD, para el `max` de los campos de nacimiento. */
export function todayIsoDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Años cumplidos hoy para una fecha YYYY-MM-DD (misma regla que catalog/age.py en el backend). */
export function ageFromBirthDate(birthDate: string): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  const now = new Date();
  const hadBirthday = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

export function birthDateValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value;
  if (!value) return null; // Validators.required se aplica en el registro.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { birthDateInvalid: true };
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return { birthDateInvalid: true };
  }
  const today = todayIsoDate();
  if (value > today) return { birthDateFuture: true };
  if (year < Number(today.slice(0, 4)) - 120) return { birthDateInvalid: true };
  return null;
}
