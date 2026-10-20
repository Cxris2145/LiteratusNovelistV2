import { AfterViewInit, ChangeDetectorRef, Directive, ElementRef, Input, NgZone, OnDestroy, booleanAttribute, inject } from '@angular/core';

@Directive({ selector: '[appPathScene]', exportAs: 'pathScene' })
export class PathSceneDirective implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private observer?: IntersectionObserver;
  /** Una sola escena de reino puede atravesar el centro de la pantalla. */
  @Input({ transform: booleanAttribute }) sceneAtCenter = false;
  paused = true;
  /** Se enciende la primera vez que la escena entra en pantalla y ya no se apaga: dispara su aparición. */
  revealed = false;

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') { this.paused = false; this.revealed = true; return; }
    this.zone.runOutsideAngular(() => {
      this.observeScene();
      if (this.sceneAtCenter) window.addEventListener('resize', this.observeScene, { passive: true });
    });
  }

  /** El centro de la pantalla, en ambos ejes: sirve igual para el mapa de lado y para el recorrido vertical. */
  private readonly observeScene = (): void => {
    this.observer?.disconnect();
    const halfHeight = Math.max(0, Math.floor(window.innerHeight / 2) - 1);
    const halfWidth = Math.max(0, Math.floor(window.innerWidth / 2) - 1);
    this.observer = new IntersectionObserver(entries => {
      const paused = !entries.some(entry => entry.isIntersecting);
      const revealed = this.revealed || !paused;
      if (paused !== this.paused || revealed !== this.revealed) {
        this.zone.run(() => { this.paused = paused; this.revealed = revealed; this.cdr.markForCheck(); });
      }
    }, this.sceneAtCenter ? { rootMargin: `-${halfHeight}px -${halfWidth}px` } : undefined);
    this.observer.observe(this.host.nativeElement);
  };

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.sceneAtCenter) window.removeEventListener('resize', this.observeScene);
  }
}
