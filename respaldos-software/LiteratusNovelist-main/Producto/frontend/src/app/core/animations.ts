import { trigger, transition, style, animate, query, group, keyframes } from '@angular/animations';

export const routeTransitionAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    // Prepara los componentes para el cross-fade
    query(':enter, :leave', [
      style({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        opacity: 0
      })
    ], { optional: true }),
    query(':enter', [
      style({ opacity: 0 })
    ], { optional: true }),
    // Ejecuta la animación en paralelo
    group([
      query(':leave', [
        animate('300ms ease-out', style({ opacity: 0 }))
      ], { optional: true }),
      query(':enter', [
        animate('300ms 150ms ease-in', style({ opacity: 1 }))
      ], { optional: true })
    ])
  ])
]);

export const shakeAnimation = trigger('shake', [
  transition('* => trigger', [
    animate('0.4s', keyframes([
      style({ transform: 'translate3d(-2px, 0, 0)', offset: 0.1 }),
      style({ transform: 'translate3d(4px, 0, 0)', offset: 0.2 }),
      style({ transform: 'translate3d(-4px, 0, 0)', offset: 0.3 }),
      style({ transform: 'translate3d(4px, 0, 0)', offset: 0.4 }),
      style({ transform: 'translate3d(-4px, 0, 0)', offset: 0.5 }),
      style({ transform: 'translate3d(4px, 0, 0)', offset: 0.6 }),
      style({ transform: 'translate3d(-2px, 0, 0)', offset: 0.7 }),
      style({ transform: 'translate3d(0, 0, 0)', offset: 1.0 })
    ]))
  ])
]);

export const fadeDownAnimation = trigger('fadeDown', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(-10px)' }),
    animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(10px)' }))
  ])
]);

/** Despliegue del panel del Asistente: entra deslizando desde abajo. */
export const slideUpPanelAnimation = trigger('slideUpPanel', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(32px) scale(0.98)' }),
    animate('320ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(24px) scale(0.98)' }))
  ])
]);
