import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit, inject,
} from '@angular/core';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { FriendStatus } from '../../core/services/community.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';

/** Alguien sentado a la mesa. */
export interface SceneGuest {
  code: string;
  username: string;
  outfit: MaguitoOutfit;
  status?: FriendStatus;
  level?: number;
}

type Slot = 'me' | 'l1' | 'r1' | 'l2' | 'r2';

interface Seat {
  slot: Slot;
  guest: SceneGuest;
  isMe: boolean;
  bubble: string | null;
}

/** Orden de los asientos: primero junto a ti, luego a los extremos. */
const GUEST_SLOTS: Slot[] = ['l1', 'r1', 'l2', 'r2'];
const STATUS_ORDER: Record<FriendStatus['kind'], number> = { tavern: 0, reading: 1, away: 2 };
const PHRASES = [
  '¡Salud por más historias!',
  '¿Qué estás leyendo?',
  'Esta ronda la invito yo',
  '¡Qué gran capítulo!',
  'Siempre hay otra historia por contar…',
  'Nivel {n} y subiendo',
];
const ROTATE_MS = 12000;

/**
 * La mesa de La Taberna, dibujada con CSS y SVG: pared de tablones, ventana con luna,
 * velas, la mesa con jarras y los Maguitos de cada uno con su ropa. Solo muestra:
 * las acciones viven en la lista de amigos.
 */
@Component({
  selector: 'app-tavern-scene',
  templateUrl: './tavern-scene.component.html',
  styleUrls: ['../community-shared.css', './tavern-scene.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TavernSceneComponent implements OnInit, OnChanges, OnDestroy {
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  @Input() me: SceneGuest | null = null;
  @Input() guests: SceneGuest[] = [];
  /** Visitante sin sesión: mesa de ejemplo. */
  @Input() demo = false;

  seats: Seat[] = [];
  /** Amigos que no caben en la mesa (en escritorio caben 4; en teléfono, 2). */
  extraWide = 0;
  extraNarrow = 0;
  summary = '';

  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'function') {
      this.zone.runOutsideAngular(() => {
        this.observer = new IntersectionObserver(entries => {
          this.host.dataset['onscreen'] = String(entries[0]?.isIntersecting ?? true);
        });
        this.observer.observe(this.host);
      });
    }
    if (!prefersReducedMotion()) {
      // Las frases rotan sin tocar la zona de Angular más que para repintar la escena.
      this.zone.runOutsideAngular(() => {
        this.timer = setInterval(() => {
          if (document.hidden || this.host.dataset['onscreen'] === 'false') return;
          this.tick++;
          this.zone.run(() => this.build());
        }, ROTATE_MS);
      });
    }
  }

  ngOnChanges(): void {
    this.build();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.observer?.disconnect();
  }

  trackSeat = (_: number, seat: Seat) => seat.slot + seat.guest.code;

  private build(): void {
    const ordered = [...this.guests].sort((a, b) =>
      STATUS_ORDER[a.status?.kind ?? 'away'] - STATUS_ORDER[b.status?.kind ?? 'away']);
    const seated = ordered.slice(0, GUEST_SLOTS.length);
    this.seats = seated.map((guest, i) => ({
      slot: GUEST_SLOTS[i], guest, isMe: false, bubble: this.bubbleFor(guest, i),
    }));
    if (this.me) {
      this.seats.unshift({ slot: 'me', guest: this.me, isMe: true, bubble: this.hostBubble() });
    }
    this.extraWide = Math.max(0, this.guests.length - GUEST_SLOTS.length);
    this.extraNarrow = Math.max(0, this.guests.length - 2);
    this.summary = this.describe(seated);
    this.cdr.markForCheck();
  }

  private hostBubble(): string | null {
    if (this.demo) return '¡Ven a sentarte con nosotros!';
    return this.guests.length ? null : 'Esta mesa espera a tus amigos';
  }

  private bubbleFor(guest: SceneGuest, seatIndex: number): string | null {
    switch (guest.status?.kind) {
      case 'reading':
        return this.shorten(guest.status.label, 30);
      case 'away':
        return 'Volverá pronto';
      default: {
        // Cada amigo tiene su frase y la va cambiando; no saltan todas a la vez.
        const index = (hash(guest.code) + Math.floor((this.tick + seatIndex) / 2)) % PHRASES.length;
        return PHRASES[index].replace('{n}', String(guest.level ?? 1));
      }
    }
  }

  private describe(seated: SceneGuest[]): string {
    if (this.demo) return 'Una mesa de La Taberna con Maguitos brindando por sus lecturas.';
    if (!seated.length) return 'Tu Maguito espera en la mesa a que lleguen tus amigos.';
    const names = seated.map(g => g.username).join(', ');
    return `Tu Maguito comparte la mesa con ${names}.`;
  }

  private shorten(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
  }
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}
