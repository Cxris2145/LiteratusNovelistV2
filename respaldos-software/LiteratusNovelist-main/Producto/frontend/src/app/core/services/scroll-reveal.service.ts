import { Injectable, NgZone, inject, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

export interface RevealOptions {
  animation?: 'slide-up' | 'fade' | 'slide-left' | 'slide-right' | 'scale' | 'stagger';
  delay?: number;
  threshold?: number;
  once?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ScrollRevealService implements OnDestroy {
  private ngZone = inject(NgZone);
  private router = inject(Router);

  private observer: IntersectionObserver | null = null;
  private observedElements = new WeakSet<Element>();
  private routerSub: Subscription | null = null;
  private prefersReducedMotion = false;
  private scanTimeoutId: any = null;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    // Detectar preferencia de reducción de movimiento del sistema
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = motionQuery.matches;

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches;
        if (this.prefersReducedMotion) {
          this.revealAllImmediately();
        }
      });
    }

    if (!('IntersectionObserver' in window)) {
      // Fallback si el navegador no soporta IntersectionObserver
      this.revealAllImmediately();
      return;
    }

    // Configurar el observer fuera de la zona de Angular para máximo rendimiento
    // de 60fps sin provocar ciclos de detección de cambios innecesarios
    this.ngZone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;

              // Si tiene un retraso configurado en data-reveal-delay
              const delay = target.dataset['revealDelay'];
              if (delay && !this.prefersReducedMotion) {
                setTimeout(() => {
                  this.revealElement(target);
                }, parseInt(delay, 10));
              } else {
                this.revealElement(target);
              }

              // Dejar de observar para liberar memoria y recursos de CPU
              this.observer?.unobserve(target);
            }
          });
        },
        {
          root: null,
          // Empieza a preparar y revelar un poco antes de que toque el viewport exacto
          // para evitar saltos o retrasos perceptibles al hacer scroll fluido
          rootMargin: '0px 0px -30px 0px',
          threshold: 0.05
        }
      );
    });

    // Escuchar cambios de ruta para re-escanear elementos recién renderizados
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.debouncedScan();
      });

    // Escaneo inicial
    this.debouncedScan();
  }

  private revealElement(el: HTMLElement): void {
    el.classList.add('is-revealed');
    // Para compatibilidad con clases previas (.reveal-section.visible)
    if (el.classList.contains('reveal-section')) {
      el.classList.add('visible');
    }

    // Disparar evento personalizado opcional por si el componente desea reaccionar
    el.dispatchEvent(new CustomEvent('revealed', { bubbles: true }));
  }

  /**
   * Observa un elemento individual con opciones opcionales
   */
  observe(element: Element, options?: RevealOptions): void {
    if (!element || this.observedElements.has(element)) return;

    const htmlEl = element as HTMLElement;

    if (this.prefersReducedMotion) {
      this.revealElement(htmlEl);
      return;
    }

    if (options?.animation) {
      htmlEl.classList.add(`reveal-${options.animation}`);
    } else if (!htmlEl.classList.contains('reveal-section') && !htmlEl.classList.contains('stagger-group')) {
      htmlEl.classList.add('reveal-on-scroll');
    }

    if (options?.delay) {
      htmlEl.dataset['revealDelay'] = options.delay.toString();
    }

    this.observedElements.add(element);

    if (this.observer) {
      this.observer.observe(element);
    } else {
      this.revealElement(htmlEl);
    }
  }

  /**
   * Deja de observar un elemento
   */
  unobserve(element: Element): void {
    if (this.observer && element) {
      this.observer.unobserve(element);
    }
  }

  /**
   * Escanea el DOM buscando elementos con selectores de animación
   * y los suscribe automáticamente al IntersectionObserver
   */
  scan(container?: Element | Document): void {
    if (typeof window === 'undefined') return;

    if (this.prefersReducedMotion) {
      this.revealAllImmediately(container);
      return;
    }

    const root = container || document;
    const selectors = [
      '.reveal-on-scroll:not(.is-revealed)',
      '.reveal-section:not(.is-revealed):not(.visible)',
      '.stagger-group:not(.is-revealed)',
      '[data-scroll-reveal]:not(.is-revealed)'
    ].join(',');

    const elements = root.querySelectorAll(selectors);
    elements.forEach((el) => {
      if (!this.observedElements.has(el)) {
        this.observedElements.add(el);
        this.observer?.observe(el);
      }
    });
  }

  /**
   * Escaneo con debounce para agrupar múltiples inserciones del DOM o transiciones de ruta
   */
  debouncedScan(delay = 80): void {
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
    }
    this.scanTimeoutId = setTimeout(() => {
      this.scan();
    }, delay);
  }

  /**
   * Revela todos los elementos inmediatamente (para accesibilidad o navegadores antiguos)
   */
  private revealAllImmediately(container?: Element | Document): void {
    if (typeof document === 'undefined') return;
    const root = container || document;
    const selectors = [
      '.reveal-on-scroll',
      '.reveal-section',
      '.stagger-group',
      '[data-scroll-reveal]'
    ].join(',');

    root.querySelectorAll(selectors).forEach((el) => {
      (el as HTMLElement).classList.add('is-revealed', 'visible');
    });
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.routerSub) {
      this.routerSub.unsubscribe();
      this.routerSub = null;
    }
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
    }
  }
}
