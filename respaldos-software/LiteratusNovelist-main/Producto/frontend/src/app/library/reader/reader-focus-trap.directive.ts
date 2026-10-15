import { AfterViewInit, Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo con el foco adentro: al abrirse lleva el foco a su primer control (si nadie lo puso ya ahí),
 * Tab y Mayús+Tab dan la vuelta dentro de él y, al cerrarse, el foco vuelve a donde estaba.
 *
 *   <section rdFocusTrap>…</section>                    (se abre y se cierra con *ngIf)
 *   <aside [rdFocusTrap]="abierto">…</aside>            (queda montado: atrapa solo mientras está abierto)
 */
@Directive({ selector: '[rdFocusTrap]' })
export class ReaderFocusTrapDirective implements AfterViewInit, OnChanges, OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private returnTo: HTMLElement | null = null;
  private active = false;
  private viewReady = false;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;

  /** Si atrapa el foco ahora (sin valor: siempre). */
  @Input() rdFocusTrap: boolean | '' = true;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.sync();
  }

  ngOnChanges(): void {
    if (this.viewReady) this.sync();
  }

  ngOnDestroy(): void {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    if (this.active) this.release();
  }

  private sync(): void {
    const wanted = this.rdFocusTrap !== false;
    if (wanted && !this.active) this.trap();
    else if (!wanted && this.active) this.release();
  }

  private trap(): void {
    this.active = true;
    const current = document.activeElement as HTMLElement | null;
    this.returnTo = current && !this.host.contains(current) ? current : null;
    this.host.addEventListener('keydown', this.onKeydown);
    // Después de que quien lo abre ponga su propio foco (la hoja "Aa" enfoca su pestaña).
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (this.active && !this.host.contains(document.activeElement)) {
        (this.focusables()[0] ?? this.host).focus({ preventScroll: true });
      }
    });
  }

  private release(): void {
    this.active = false;
    this.host.removeEventListener('keydown', this.onKeydown);
    // Si el foco quedó adentro (o se perdió al cerrarse), vuelve a donde estaba.
    const current = document.activeElement;
    if (this.returnTo?.isConnected && (!current || current === document.body || this.host.contains(current))) {
      this.returnTo.focus({ preventScroll: true });
    }
    this.returnTo = null;
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  }

  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const list = this.focusables();
    if (list.length === 0) {
      event.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !this.host.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !this.host.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };
}
