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

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') { this.paused = false; return; }
    this.zone.runOutsideAngular(() => {
      this.observeScene();
      if (this.sceneAtCenter) window.addEventListener('resize', this.observeScene, { passive: true });
    });
  }

  private readonly observeScene = (): void => {
    this.observer?.disconnect();
    const halfViewport = Math.max(0, Math.floor(window.innerHeight / 2) - 1);
    this.observer = new IntersectionObserver(entries => {
      const paused = !entries.some(entry => entry.isIntersecting);
      if (paused !== this.paused) this.zone.run(() => { this.paused = paused; this.cdr.markForCheck(); });
    }, this.sceneAtCenter ? { rootMargin: `-${halfViewport}px 0px -${halfViewport}px 0px` } : undefined);
    this.observer.observe(this.host.nativeElement);
  };

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.sceneAtCenter) window.removeEventListener('resize', this.observeScene);
  }
}
