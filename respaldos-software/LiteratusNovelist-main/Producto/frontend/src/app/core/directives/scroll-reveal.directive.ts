import { Directive, ElementRef, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { ScrollRevealService, RevealOptions } from '../services/scroll-reveal.service';

@Directive({
  selector: '[appScrollReveal]'
})
export class ScrollRevealDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private scrollService = inject(ScrollRevealService);

  @Input('appScrollReveal') animation: 'slide-up' | 'fade' | 'slide-left' | 'slide-right' | 'scale' | 'stagger' = 'slide-up';
  @Input() revealDelay?: number;
  @Input() revealThreshold?: number;

  ngOnInit(): void {
    const options: RevealOptions = {
      animation: this.animation,
      delay: this.revealDelay,
      threshold: this.revealThreshold
    };
    this.scrollService.observe(this.el.nativeElement, options);
  }

  ngOnDestroy(): void {
    this.scrollService.unobserve(this.el.nativeElement);
  }
}
