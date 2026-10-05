import { Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

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
  styleUrls: ['./guide-dialog.component.css']
})
export class GuideDialogComponent {
  dialogRef = inject(MatDialogRef<GuideDialogComponent>);
  router = inject(Router);

  currentStepIndex = 0;
  dontShowAgain = false;

  readonly steps: GuideStep[] = [
    {
      title: 'Bienvenido a Literatus Novelist',
      subtitle: 'Tu universo interactivo de lectura, aprendizaje e inteligencia artificial',
      icon: 'auto_stories',
      tag: 'Inicio Rápido',
      description: 'Literatus combina la magia de los libros clásicos con herramientas modernas para que disfrutes y comprendas cada obra a tu propio ritmo.',
      points: [
        { icon: 'explore', text: 'Accede a miles de obras maestras libres de derechos.' },
        { icon: 'psychology', text: 'Conversa con personajes literarios impulsados por IA.' },
        { icon: 'menu_book', text: 'Lector inteligente con narración por voz y seguimiento.' }
      ]
    },
    {
      title: 'Explora y Adquiere Obras',
      subtitle: 'Navega por el Catálogo, Categorías y Autores',
      icon: 'explore',
      tag: 'Paso 1: Descubrir',
      description: 'Encuentra libros organizados por géneros, autores y niveles de dificultad (Principiante a Maestro).',
      points: [
        { icon: 'grid_view', text: 'Filtra por categorías: Ciencia Ficción, Novela, Filosofía y más.' },
        { icon: 'ink_pen', text: 'Usa tus gotas de Tinta para adquirir obras y guardarlas en tu biblioteca.' },
        { icon: 'search', text: 'Buscador inteligente por título, autor o contenido.' }
      ],
      route: '/catalog',
      actionText: 'Ver Catálogo de Libros'
    },
    {
      title: 'Tu Biblioteca y Lector Inmersivo',
      subtitle: 'Tu colección personal y experiencia de lectura avanzada',
      icon: 'menu_book',
      tag: 'Paso 2: Lectura',
      description: 'Accede a "Mi Biblioteca" para continuar tus lecturas exactamente donde las dejaste.',
      points: [
        { icon: 'volume_up', text: 'Narración de voz neuronal (Kokoro & Web TTS) para escuchar los libros.' },
        { icon: 'translate', text: 'Diccionario integrado y preguntas en vivo a personajes del libro.' },
        { icon: 'format_size', text: 'Ajuste de tipografía, tamaño de letra, interlineado y modo concentración.' }
      ],
      route: '/library',
      actionText: 'Ir a Mi Biblioteca'
    },
    {
      title: 'Personajes IA y La Taberna',
      subtitle: 'Conversaciones vivas y recarga de energía',
      icon: 'theater_comedy',
      tag: 'Paso 3: Interacción',
      description: 'Sumérgete en debates únicos con los protagonistas y autores de las obras.',
      points: [
        { icon: 'forum', text: 'Chatea o habla por voz con Don Quijote, Sherlock Holmes y más.' },
        { icon: 'local_bar', text: 'En La Taberna te reúnes con tus amigos; en su Tienda recargas Tinta y vistes a tu Maguito.' },
        { icon: 'mail', text: 'Recibe correspondencia literaria y avisos importantes en tu buzón.' }
      ],
      route: '/characters',
      actionText: 'Conocer Personajes'
    },
    {
      title: 'Progreso, Niveles y Recompensas',
      subtitle: 'Gamificación diseñada para motivar tu hábito lector',
      icon: 'emoji_events',
      tag: 'Paso 4: Logros',
      description: 'Cada página leída y cada interacción te otorgan Experiencia (XP) y Tinta.',
      points: [
        { icon: 'featured_seasonal_and_gifts', text: 'Reclama tu Recompensa Diaria de Tinta gratis cada día.' },
        { icon: 'military_tech', text: 'Sube de nivel para desbloquear descuentos exclusivos en la tienda.' },
        { icon: 'local_fire_department', text: 'Mantén tu racha diaria de lectura y consigue logros épicos.' }
      ],
      route: '/achievements',
      actionText: 'Ver Mis Logros'
    }
  ];

  get currentStep(): GuideStep {
    return this.steps[this.currentStepIndex];
  }

  get isLastStep(): boolean {
    return this.currentStepIndex === this.steps.length - 1;
  }

  nextStep(): void {
    if (!this.isLastStep) {
      this.currentStepIndex++;
    } else {
      this.close();
    }
  }

  prevStep(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
    }
  }

  goToStep(index: number): void {
    this.currentStepIndex = index;
  }

  navigateToSection(route?: string): void {
    this.savePreference();
    this.dialogRef.close();
    if (route) {
      this.router.navigate([route]);
    }
  }

  close(): void {
    this.savePreference();
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
