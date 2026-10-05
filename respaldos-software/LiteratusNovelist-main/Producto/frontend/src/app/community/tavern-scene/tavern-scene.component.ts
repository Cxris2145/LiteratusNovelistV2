import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject,
} from '@angular/core';

import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { FriendStatus, TavernChatMessage, TavernReactionItem } from '../../core/services/community.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';

/** Alguien sentado a la mesa. */
export interface SceneGuest {
  code: string;
  username: string;
  outfit: MaguitoOutfit;
  status?: FriendStatus;
  level?: number;
}

export type Slot = 'me' | 'center' | 'l1' | 'r1' | 'l2' | 'r2';

export interface BubbleData {
  text: string;
  isChat: boolean;
}

export interface Seat {
  slot: Slot;
  guest: SceneGuest;
  isMe: boolean;
  isFirst: boolean;
  bubble: BubbleData | null;
  mug: boolean;
}

export interface FloatingParticle {
  id: string;
  emoji: string;
  x: number;
}

const PHRASES = [
  '¡Salud por más historias! 🍺',
  '¡Qué gran capítulo! 📚',
  'Siempre hay otra historia por contar… ✨',
  '¿Qué estás leyendo? 📖',
  'Esta ronda la invito yo 🍻',
  'Nivel {n} y subiendo 🚀',
];
const ROTATE_MS = 12000;

/**
 * La mesa de La Taberna de Tinta:
 * Escena inmersiva ilustrada con fondo cálido de taberna, Maguitos animados en capas SVG,
 * jarras con espuma para brindar, el gato negro de la taberna, burbujas de diálogo
 * reactivas al chat, y barra flotante de chat y reacciones rápidas.
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
  @Input() demo = false;
  @Input() messages: TavernChatMessage[] = [];
  @Input() reactions: TavernReactionItem[] = [];
  @Input() toasting = false;
  @Input() topRankUsername: string | null = null;

  @Output() sendMessage = new EventEmitter<string>();
  @Output() sendReaction = new EventEmitter<string>();

  seats: Seat[] = [];
  extraWide = 0;
  extraNarrow = 0;
  summary = '';

  chatText = '';
  busySending = false;
  showEmojiList = false;
  particles: FloatingParticle[] = [];

  readonly quickEmojis = ['😊', '📚', '🍺', '✨', '🧙‍♂️', '📜', '🕯️', '🔥'];

  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private observer?: IntersectionObserver;
  private seenReactionIds = new Set<string>();

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
      this.zone.runOutsideAngular(() => {
        this.timer = setInterval(() => {
          if (document.hidden || this.host.dataset['onscreen'] === 'false') return;
          this.tick++;
          this.zone.run(() => this.build());
        }, ROTATE_MS);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reactions'] && this.reactions) {
      for (const r of this.reactions) {
        if (!this.seenReactionIds.has(r.id)) {
          this.seenReactionIds.add(r.id);
          this.spawnParticle(r.emoji || '✨');
          if (r.emoji === '🍺' || r.reaction === 'beer') {
            this.triggerToastEffect();
          }
        }
      }
    }
    this.build();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.observer?.disconnect();
  }

  trackSeat = (_: number, seat: Seat) => seat.slot + seat.guest.code;
  trackParticle = (_: number, p: FloatingParticle) => p.id;

  sendChat(): void {
    const text = this.chatText.trim();
    if (!text || this.busySending) return;
    this.sendMessage.emit(text);
    this.chatText = '';
    this.showEmojiList = false;
  }

  react(emoji: string): void {
    this.sendReaction.emit(emoji);
    this.spawnParticle(emoji);
    if (emoji === '🍺') {
      this.triggerToastEffect();
    }
  }

  insertEmoji(emoji: string): void {
    this.chatText += emoji;
    this.showEmojiList = false;
  }

  toggleEmojiList(): void {
    this.showEmojiList = !this.showEmojiList;
  }

  private triggerToastEffect(): void {
    this.toasting = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toasting = false;
      this.cdr.markForCheck();
    }, 2200);
    this.cdr.markForCheck();
  }

  private spawnParticle(emoji: string): void {
    const p: FloatingParticle = {
      id: Math.random().toString(),
      emoji,
      x: 24 + Math.random() * 52,
    };
    this.particles.push(p);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.particles = this.particles.filter(item => item.id !== p.id);
      this.cdr.markForCheck();
    }, 2400);
  }

  private build(): void {
    const isFirstRank = (u: string) => {
      if (this.topRankUsername) return u.toLowerCase() === this.topRankUsername.toLowerCase();
      return this.demo && u === 'Maguito';
    };

    if (this.demo) {
      // Distribución idéntica a la maqueta:
      // Izquierda: Tercer amigo (sombrero rojo con flor)
      // Centro: Amigo de Maguito (barba y sombrero de mago)
      // Derecha: Maguito con corona y gafas de aviador
      const leftGuest = this.guests.find(g => g.code === 'demo-tercer') || this.guests[1] || this.guests[0];
      const centerGuest = this.guests.find(g => g.code === 'demo-amigo') || this.guests[0];
      const meGuest = this.me || { code: 'demo-me', username: 'Maguito', outfit: { head: 'aviator', cape: 'red' }, level: 12 };

      this.seats = [
        {
          slot: 'l1',
          guest: leftGuest,
          isMe: false,
          isFirst: false,
          bubble: { text: '¡Qué gran capítulo! 📚', isChat: false },
          mug: true,
        },
        {
          slot: 'center',
          guest: centerGuest,
          isMe: false,
          isFirst: false,
          bubble: { text: '¡Salud por más historias! 🍺', isChat: false },
          mug: true,
        },
        {
          slot: 'r1',
          guest: meGuest,
          isMe: true,
          isFirst: true,
          bubble: { text: 'Siempre hay otra historia por contar… ✨', isChat: false },
          mug: true,
        },
      ];
      this.summary = 'Mesa de La Taberna de Tinta con Maguito y sus amigos brindando.';
      this.cdr.markForCheck();
      return;
    }

    // Modo real conectado:
    const seatedGuests = [...this.guests];
    this.seats = [];

    if (!seatedGuests.length) {
      // Solo Maguito esperando en la mesa
      if (this.me) {
        this.seats.push({
          slot: 'center',
          guest: this.me,
          isMe: true,
          isFirst: isFirstRank(this.me.username),
          bubble: this.hostBubble(),
          mug: true,
        });
      }
    } else if (seatedGuests.length === 1) {
      // Tú y un amigo
      this.seats.push({
        slot: 'l1',
        guest: seatedGuests[0],
        isMe: false,
        isFirst: isFirstRank(seatedGuests[0].username),
        bubble: this.bubbleFor(seatedGuests[0], 0),
        mug: true,
      });
      if (this.me) {
        this.seats.push({
          slot: 'r1',
          guest: this.me,
          isMe: true,
          isFirst: isFirstRank(this.me.username),
          bubble: this.hostBubble(),
          mug: true,
        });
      }
    } else {
      // Tres o más: Amigo 1 a la izquierda, Amigo 0 al centro, Maguito a la derecha
      this.seats.push({
        slot: 'l1',
        guest: seatedGuests[1],
        isMe: false,
        isFirst: isFirstRank(seatedGuests[1].username),
        bubble: this.bubbleFor(seatedGuests[1], 1),
        mug: true,
      });
      this.seats.push({
        slot: 'center',
        guest: seatedGuests[0],
        isMe: false,
        isFirst: isFirstRank(seatedGuests[0].username),
        bubble: this.bubbleFor(seatedGuests[0], 0),
        mug: true,
      });
      if (this.me) {
        this.seats.push({
          slot: 'r1',
          guest: this.me,
          isMe: true,
          isFirst: isFirstRank(this.me.username),
          bubble: this.hostBubble(),
          mug: true,
        });
      }
    }

    this.extraWide = Math.max(0, this.guests.length - 2);
    this.summary = this.describe(seatedGuests);
    this.cdr.markForCheck();
  }

  private hostBubble(): BubbleData | null {
    if (this.me) {
      const myMsg = this.messages.find(m => m.is_me || m.username === this.me!.username);
      if (myMsg && myMsg.content) {
        return { text: this.shorten(myMsg.content, 48), isChat: true };
      }
    }
    return this.guests.length
      ? { text: 'Siempre hay otra historia por contar… ✨', isChat: false }
      : { text: 'Esta mesa espera a tus amigos 🍺', isChat: false };
  }

  private bubbleFor(guest: SceneGuest, seatIndex: number): BubbleData | null {
    // 1. ¿Hay un mensaje reciente de chat para este usuario?
    const userMsg = this.messages.find(
      m => m.username.toLowerCase() === guest.username.toLowerCase() || (m.friend_code && m.friend_code === guest.code)
    );
    if (userMsg && userMsg.content) {
      return { text: this.shorten(userMsg.content, 48), isChat: true };
    }

    // 2. Si está leyendo o ausente
    if (guest.status?.kind === 'reading') {
      return { text: this.shorten(guest.status.label, 32), isChat: false };
    }
    if (guest.status?.kind === 'away') {
      return { text: 'Volverá pronto 🌙', isChat: false };
    }

    // 3. Frases temáticas con emojis
    const index = (hash(guest.code) + Math.floor((this.tick + seatIndex) / 2)) % PHRASES.length;
    return { text: PHRASES[index].replace('{n}', String(guest.level ?? 1)), isChat: false };
  }

  private describe(seated: SceneGuest[]): string {
    if (this.demo) return 'Mesa de La Taberna de Tinta con Maguitos brindando.';
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
