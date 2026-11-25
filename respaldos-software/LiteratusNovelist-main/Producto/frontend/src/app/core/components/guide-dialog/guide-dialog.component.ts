import { animate, style, transition, trigger } from '@angular/animations';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';

export const GUIDE_DIALOG_CONFIG: MatDialogConfig = {
  id: 'literatus-guide',
  panelClass: 'guide-custom-dialog-panel',
  width: '640px',
  maxWidth: 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))',
  maxHeight: 'calc(100dvh - 24px)',
  autoFocus: '.guide-close-btn',
  restoreFocus: true,
  ariaLabelledBy: 'guide-title',
  ariaDescribedBy: 'guide-description',
};

export interface GuideStep {
  title: string;
  subtitle: string;
  icon: string;
  tag: string;
  description: string;
  points: { icon: string; text: string }[];
  route?: string;
  actionText?: string;
}

@Component({
  selector: 'app-guide-dialog',
  templateUrl: './guide-dialog.component.html',
  styleUrls: ['./guide-dialog.component.css'],
  animations: [
    trigger('guideStep', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX({{ enterX }}px)' }),
        animate('240ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ], { params: { enterX: 18 } }),
    ]),
  ],
})
export class GuideDialogComponent implements OnDestroy {
  dialogRef = inject(MatDialogRef<GuideDialogComponent>);
  router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly motionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  @ViewChild('scrollArea') private scrollArea?: ElementRef<HTMLElement>;

  currentStepIndex = 0;
  animationDirection = 1;
  prefersReducedMotion = this.motionQuery?.matches ?? true;
  dontShowAgain = false;

  readonly steps: GuideStep[] = [
    {
      title: 'Encuentra tu próxima lectura',
      subtitle: 'Los libros del catálogo se leen gratis',
      icon: 'auto_stories',
      tag: 'Descubre',
      description: 'Empieza por el catálogo de Literatus Novelist y elige la historia que quieres leer.',
      points: [
        { icon: 'search', text: 'Busca por título o autor y explora las categorías.' },
        { icon: 'menu_book', text: 'Abre una obra y comienza a leer sin gastar Tinta.' },
        { icon: 'favorite', text: 'Guarda tus favoritos para encontrarlos después.' }
      ],
      route: '/catalog',
      actionText: 'Explorar el catálogo'
    },
    {
      title: 'Lee a tu manera',
      subtitle: 'Tu biblioteca conserva el punto donde te quedaste',
      icon: 'menu_book',
      tag: 'Lee',
      description: 'Añade libros a Mi Biblioteca y adapta el lector para sentirte cómodo.',
      points: [
        { icon: 'bookmark', text: 'Retoma tus lecturas y guarda marcadores.' },
        { icon: 'format_size', text: 'Ajusta letra, tamaño, tema y modos de lectura asistida.' },
        { icon: 'volume_up', text: 'Usa la narración para escuchar mientras sigues el texto.' }
      ],
      route: '/library',
      actionText: 'Abrir Mi Biblioteca'
    },
    {
      title: 'Conversa con los personajes',
      subtitle: 'Otra forma de acercarte a las historias',
      icon: 'forum',
      tag: 'Comprende',
      description: 'Elige un personaje o autor disponible y hazle preguntas sobre su mundo.',
      points: [
        { icon: 'psychology', text: 'Explora ideas, decisiones y temas de la obra con ayuda de IA.' },
        { icon: 'ink_pen', text: 'La Tinta se usa en interacciones con IA y extras; leer sigue siendo gratis.' },
        { icon: 'payments', text: 'Consulta en Planes las opciones de membresía y recarga de Tinta.' }
      ],
      route: '/characters',
      actionText: 'Conocer a los personajes'
    },
    {
      title: 'Encuentra tu mesa en La Taberna',
      subtitle: 'Comparte la lectura con otras personas',
      icon: 'local_bar',
      tag: 'Comparte',
      description: 'Reúnete con tus amigos, comenta lo que estás leyendo y dale tu estilo a Maguito.',
      points: [
        { icon: 'group', text: 'Añade amigos y conversa con ellos en la mesa.' },
        { icon: 'auto_stories', text: 'Descubre lecturas conjuntas para compartir historias.' },
        { icon: 'redeem', text: 'Visita El Bazar para personalizar a tu Maguito.' }
      ],
      route: '/tavern',
      actionText: 'Entrar a La Taberna'
    },
    {
      title: 'Avanza a tu propio ritmo',
      subtitle: 'Cada etapa es una ocasión para volver a leer',
      icon: 'emoji_events',
      tag: 'Aprende',
      description: 'Recorre La Senda y consulta tus logros para seguir tu progreso.',
      points: [
        { icon: 'explore', text: 'Completa las etapas y actividades de La Senda.' },
        { icon: 'military_tech', text: 'Consulta tu nivel, experiencia y logros desbloqueados.' },
        { icon: 'local_fire_department', text: 'Sigue tu racha y vuelve cuando quieras continuar.' }
      ],
      route: '/learn',
      actionText: 'Explorar La Senda'
    }
  ];

  private readonly onMotionChange = (event: MediaQueryListEvent): void => {
    this.prefersReducedMotion = event.matches;
    this.cdr.markForCheck();
  };

  constructor() {
    this.motionQuery?.addEventListener?.('change', this.onMotionChange);
    this.dialogRef.beforeClosed().pipe(take(1)).subscribe(() => this.savePreference());
  }

  ngOnDestroy(): void {
    this.motionQuery?.removeEventListener?.('change', this.onMotionChange);
  }

  get currentStep(): GuideStep {
    return this.steps[this.currentStepIndex];
  }

  get isLastStep(): boolean {
    return this.currentStepIndex === this.steps.length - 1;
  }

  trackStep(_index: number, step: GuideStep): GuideStep {
    return step;
  }

  nextStep(): void {
    if (!this.isLastStep) {
      this.goToStep(this.currentStepIndex + 1);
    } else {
      this.close();
    }
  }

  prevStep(): void {
    this.goToStep(this.currentStepIndex - 1);
  }

  goToStep(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.steps.length || index === this.currentStepIndex) return;
    this.animationDirection = index > this.currentStepIndex ? 1 : -1;
    this.currentStepIndex = index;
    if (this.scrollArea) this.scrollArea.nativeElement.scrollTop = 0;
  }

  navigateToSection(route?: string): void {
    this.dialogRef.close();
    if (route) {
      this.router.navigate([route]);
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  private savePreference(): void {
    if (this.dontShowAgain) {
      localStorage.setItem('literatus_guide_dismissed', 'true');
    }
    // Siempre registramos que al menos vio la guía
    localStorage.setItem('literatus_guide_seen', 'true');
  }
}
