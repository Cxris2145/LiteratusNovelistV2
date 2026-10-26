import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ChildCard, ParentalService, ParentalStatus } from '../../core/services/parental.service';
import { NotificationService } from '../../core/services/notification.service';
import { ChildFormDialogComponent, ChildFormDialogData } from '../child-form-dialog/child-form-dialog.component';
import { apiErrorMessage, initialOf, relativeTime } from '../parental-format';

/**
 * Inicio del control parental: el tutor declara «este perfil es para mi hijo y yo tengo el control»
 * al crear o vincular la cuenta del hijo, y desde aquí entra a su historial.
 */
@Component({
  selector: 'app-parental-home',
  templateUrl: './parental-home.component.html',
  styleUrls: ['../parental-shared.css', './parental-home.component.css']
})
export class ParentalHomeComponent implements OnInit {
  private parental = inject(ParentalService);
  private dialog = inject(MatDialog);
  private notifications = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  status: ParentalStatus | null = null;
  loading = true;
  error = '';

  readonly initialOf = initialOf;
  readonly relativeTime = relativeTime;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.parental.status().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: status => {
        this.status = status;
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'No pudimos cargar el control parental. Inténtalo de nuevo.');
      }
    });
  }

  get atLimit(): boolean {
    return !!this.status && this.status.children.length >= this.status.max_children;
  }

  displayName(child: ChildCard): string {
    return child.first_name || child.username;
  }

  openForm(mode: 'create' | 'link'): void {
    if (!this.status || this.dialog.openDialogs.length) return;
    this.dialog.open<ChildFormDialogComponent, ChildFormDialogData, ChildCard>(ChildFormDialogComponent, {
      data: { mode, consentText: this.status.consent_text },
      panelClass: 'account-dialog-panel',
      width: '520px',
      maxWidth: 'calc(100vw - 24px)',
      autoFocus: 'first-tabbable',
      ariaLabelledBy: 'cf-title',
    }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(child => {
      if (!child || !this.status) return;
      this.status = { ...this.status, children: [...this.status.children, child] };
      this.notifications.success(
        mode === 'create'
          ? `Listo: ${child.username} ya puede entrar con su usuario y contraseña.`
          : `La cuenta de ${child.username} quedó a tu cargo.`,
        'Control parental');
    });
  }
}
