import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ChildCard, ParentalService } from '../../core/services/parental.service';
import { todayIsoDate } from '../../core/utils/birth-date.util';
import { apiErrorMessage, fieldErrors } from '../parental-format';

export interface ChildFormDialogData {
  mode: 'create' | 'link';
  consentText: string;
}

/** Alta del perfil del hijo, o vínculo de una cuenta que ya tiene, con la declaración del tutor. */
@Component({
  selector: 'app-child-form-dialog',
  templateUrl: './child-form-dialog.component.html',
  styleUrls: ['../parental-shared.css', './child-form-dialog.component.css']
})
export class ChildFormDialogComponent {
  readonly data = inject<ChildFormDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<ChildFormDialogComponent, ChildCard>>(MatDialogRef);
  private parental = inject(ParentalService);
  private destroyRef = inject(DestroyRef);

  mode = this.data.mode;
  readonly today = todayIsoDate();

  firstName = '';
  username = '';
  password = '';
  birthDate = '';
  identifier = '';
  consent = false;
  showPassword = false;
  /** Al vincular, la fecha solo se pide si la cuenta no la tiene. */
  askBirthDate = false;

  saving = false;
  error = '';
  errors: Record<string, string> = {};

  setMode(mode: 'create' | 'link'): void {
    if (this.saving) return;
    this.mode = mode;
    this.error = '';
    this.errors = {};
    this.password = '';
  }

  get canSubmit(): boolean {
    if (this.saving || !this.consent || !this.password) return false;
    if (this.mode === 'create') return this.username.trim().length >= 3 && !!this.birthDate;
    return !!this.identifier.trim() && (!this.askBirthDate || !!this.birthDate);
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.saving = true;
    this.error = '';
    this.errors = {};
    this.dialogRef.disableClose = true;
    const request$ = this.mode === 'create'
      ? this.parental.createChild({
          username: this.username.trim(), password: this.password, birth_date: this.birthDate,
          first_name: this.firstName.trim(), consent: this.consent,
        })
      : this.parental.linkChild({
          identifier: this.identifier.trim(), password: this.password, consent: this.consent,
          birth_date: this.askBirthDate ? this.birthDate : null,
        });
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: child => this.dialogRef.close(child),
      error: err => {
        this.saving = false;
        this.dialogRef.disableClose = false;
        if (err?.error?.code === 'BIRTH_DATE_REQUIRED') this.askBirthDate = true;
        this.errors = fieldErrors(err);
        const fieldShown = Object.keys(this.errors).some(key => this.fieldIsShown(key));
        this.error = fieldShown ? '' : apiErrorMessage(err, 'No pudimos guardar. Inténtalo de nuevo.');
      }
    });
  }

  private fieldIsShown(key: string): boolean {
    const create = ['username', 'password', 'birth_date', 'first_name', 'consent'];
    const link = ['identifier', 'password', 'consent', ...(this.askBirthDate ? ['birth_date'] : [])];
    return (this.mode === 'create' ? create : link).includes(key);
  }
}
