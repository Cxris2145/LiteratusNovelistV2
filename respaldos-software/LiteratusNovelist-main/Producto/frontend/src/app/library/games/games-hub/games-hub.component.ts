import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatService } from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth.service';

export interface LiteraryGameCard {
  id: 'senda' | 'enigma' | 'interrogatorio';
  title: string;
  eyebrow: string;
  badge: string;
  icon: string;
  accent: 'gold' | 'cyan' | 'violet';
  route: string;
  ctaLabel: string;
  description: string;
  highlights: { icon: string; text: string }[];
}

@Component({
  selector: 'app-games-hub',
  templateUrl: './games-hub.component.html',
  styleUrls: ['./games-hub.component.css']
})
export class GamesHubComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();

  userInkBalance = 0;

  readonly games: LiteraryGameCard[] = [
    {
      id: 'senda',
      title: 'La Senda del Lector',
      eyebrow: 'Trivias & Progresión',
      badge: 'Mapa de Niveles',
      icon: 'map',
      accent: 'gold',
      route: '/learn',
      ctaLabel: 'Recorrer La Senda',
      description:
        'Avanza por un mapa interactivo de desafíos sobre las obras de tu biblioteca, demuestra tu dominio lector y desbloquea cofres de recompensa.',
      highlights: [
        { icon: 'route', text: 'Niveles progresivos adaptados a tus libros adquiridos' },
        { icon: 'redeem', text: 'Cofres con Gotas de Tinta y puntos de Experiencia (XP)' },
        { icon: 'local_fire_department', text: 'Impulsa tu racha diaria y desbloquea insignias' }
      ]
    },
    {
      id: 'enigma',
      title: 'El Enigma del Tintero',
      eyebrow: 'Acertijo de Palabras',
      badge: 'Reto Diario · +15 Tinta',
      icon: 'extension',
      accent: 'cyan',
      route: '/games/enigma',
      ctaLabel: 'Descifrar el Enigma',
      description:
        'Descubre letra por letra el título de la obra oculta del día antes de que se agoten las cinco gotas de tinta de tu pluma.',
      highlights: [
        { icon: 'today', text: 'Un nuevo enigma literario cada 24 horas' },
        { icon: 'water_drop', text: '5 gotas de margen para adivinar sin agotar la pluma' },
        { icon: 'ink_pen', text: 'Recompensa directa de +15 Gotas de Tinta al acertar' }
      ]
    },
    {
      id: 'interrogatorio',
      title: 'El Interrogatorio a Ciegas',
      eyebrow: 'Duelo Deductivo con IA',
      badge: 'Misterio en Vivo',
      icon: 'visibility_off',
      accent: 'violet',
      route: '/games/interrogatorio',
      ctaLabel: 'Iniciar Interrogatorio',
      description:
        'Un personaje literario te habla oculto entre las sombras. Haz las preguntas correctas, analiza sus pistas y deduce su verdadera identidad.',
      highlights: [
        { icon: 'psychology_alt', text: 'Conversación en tiempo real con IA en modo incógnito' },
        { icon: 'stars', text: 'Reto oficial diario con premio de Tinta y modo práctica libre' },
        { icon: 'menu_book', text: 'Sospechosos extraídos de tu biblioteca y del catálogo clásico' }
      ]
    }
  ];

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  ngOnInit(): void {
    this.chatService.inkBalance$
      .pipe(takeUntil(this.destroy$))
      .subscribe(balance => {
        this.userInkBalance = balance ?? 0;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
