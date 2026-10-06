import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone,
  OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren, inject,
} from '@angular/core';

import { MaguitoComponent } from '../../core/components/maguito/maguito.component';
import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { FriendStatus, TavernChatMessage, TavernReactionItem } from '../../core/services/community.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';
import { TavernTableAction } from '../tavern-table/tavern-table.types';

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
  fullText?: string;
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

/** Centro horizontal (%) de cada asiento: las reacciones suben desde quien las envía. */
const SEAT_X: Record<Slot, number> = { me: 50, center: 50, l1: 28, r1: 72, l2: 10, r2: 90 };

const PHRASES = [
  '¡Salud por más historias! 🍺',
  '¡Qué gran capítulo! 📚',
  'Siempre hay otra historia por contar… ✨',
  '¿Qué estás leyendo? 📖',
  'Esta ronda la invito yo 🍻',
  'Nivel {n} y subiendo 🚀',
];
const ROTATE_MS = 12000;
const FITTING_BUBBLE: BubbleData = { text: '¿Cómo me queda? ✨', isChat: false };

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
  /** El Bazar está abierto: la lámpara alumbra a tu Maguito, que hace de espejo. */
  @Input() fitting = false;
  /** Cambia con cada prenda probada, canjeada o puesta. */
  @Input() fittingTick = 0;
  @Input() fittingGesture: 'try' | 'buy' | 'equip' = 'try';

  @Output() sendMessage = new EventEmitter<string>();
  @Output() sendReaction = new EventEmitter<string>();
  @Output() tableAction = new EventEmitter<TavernTableAction>();
  @Output() guestSelect = new EventEmitter<SceneGuest>();
  /** Botón "El Bazar" de la mesa. */
  @Output() bazar = new EventEmitter<void>();

  @ViewChildren('seatMaguito') private seatMaguitos?: QueryList<MaguitoComponent>;

  seats: Seat[] = [];
  emptySlots: Slot[] = [];
  extraWide = 0;
  extraNarrow = 0;
  summary = '';

  chatText = '';
  busySending = false;
  showEmojiList = false;
  table3dReady = false;
  tableHover: TavernTableAction | null = null;
  tableReaction = '';
  tableReactionTick = 0;
  particles: FloatingParticle[] = [];
  /** Destellos al probarse una prenda: cada número es una ráfaga nueva. */
  fitBursts: number[] = [];

  readonly quickEmojis = ['😊', '📚', '🍺', '✨', '🧙‍♂️', '📜', '🕯️', '🔥'];

  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private observer?: IntersectionObserver;
  private seenReactionIds = new Set<string>();
  private reactionLoads = 0;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'function') {
      this.zone.runOutsideAngular(() => {
        this.observer = new IntersectionObserver(entries => {
          this.host.dataset['onscreen'] = String(entries[0]?.isIntersecting ?? true);
          this.syncAmbient();
        });
        this.observer.observe(this.host);
      });
    }
    document.addEventListener('visibilitychange', this.syncAmbient);
    this.syncAmbient();
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
    this.build();
    if (changes['reactions'] && this.reactions) {
      // La lista vacía inicial y la primera carga son de antes de llegar: solo se marcan como vistas.
      // Las propias tampoco se repiten: ya salieron al pulsar.
      const arriving = this.reactionLoads++ < 2;
      for (const r of this.reactions) {
        if (this.seenReactionIds.has(r.id)) continue;
        this.seenReactionIds.add(r.id);
        if (arriving || r.is_me) continue;
        this.spawnParticle(r.emoji || '✨', this.seatXFor(r.username, false));
        if (r.emoji === '🍺' || r.reaction === 'beer') this.triggerToastEffect();
      }
    }
    if (changes['fittingTick'] && !changes['fittingTick'].firstChange) this.celebrateFitting();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.syncAmbient);
  }

  private syncAmbient = (): void => {
    this.host.dataset['ambientPaused'] = String(document.hidden || this.host.dataset['onscreen'] === 'false');
  };

  trackSeat = (_: number, seat: Seat) => seat.slot + seat.guest.code;
  trackParticle = (_: number, p: FloatingParticle) => p.id;
  /** Un bocadillo nuevo por cada frase: así entra con su animación al cambiar el texto. */
  trackBubble = (_: number, bubble: BubbleData) => bubble.text;
  trackBurst = (_: number, burst: number) => burst;

  sendChat(): void {
    const text = this.chatText.trim();
    if (!text || this.busySending) return;
    this.sendMessage.emit(text);
    this.chatText = '';
    this.showEmojiList = false;
  }

  react(emoji: string): void {
    this.sendReaction.emit(emoji);
    this.spawnParticle(emoji, this.demo ? SEAT_X.r1 : SEAT_X.center);
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

  /** El selector de emojis se cierra al pulsar fuera o con Escape. */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointer(event: PointerEvent): void {
    if (!this.showEmojiList) return;
    const target = event.target as Element | null;
    if (target?.closest('.ts-emoji-picker-wrap, .ts-emoji-toggle')) return;
    this.showEmojiList = false;
    this.cdr.markForCheck();
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.showEmojiList) {
      this.showEmojiList = false;
      this.cdr.markForCheck();
    }
  }

  catMessage: string | null = null;
  private catTimer: ReturnType<typeof setTimeout> | null = null;

  activateTable(action: TavernTableAction): void {
    if (action === 'cat') {
      this.tableReaction = '🐾';
      this.tableReactionTick++;
      this.spawnParticle('🐾', 78);
      this.triggerCatPurr();
      return;
    }
    if (action === 'potions') {
      this.tableReaction = '✨';
      this.tableReactionTick++;
      this.spawnParticle('✨', 65);
      this.triggerPotionMagic();
      return;
    }
    if (action === 'hourglass') {
      this.tableReaction = '⏳';
      this.tableReactionTick++;
      this.spawnParticle('⏳', 35);
      this.triggerHourglassFlip();
      return;
    }
    this.tableReaction = action === 'book' ? '📖' : action === 'rewards' ? '✨' : '🍺';
    this.tableReactionTick++;
    this.tableAction.emit(action);
  }

  private triggerCatPurr(): void {
    const purrs = [
      '¡Miau! 🐾 El gato negro de la taberna ronronea alegremente a tu lado.',
      '🐾 El gato de la taberna te guiña un ojo dorado con complicidad.',
      '¡Ronroneo de la suerte! 🐾 Tus próximas lecturas tendrán magia extra.',
      '🐾 El gato negro amasa suavemente la madera de la mesa.',
    ];
    this.catMessage = purrs[Math.floor(Math.random() * purrs.length)];
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => {
      this.catMessage = null;
      this.cdr.markForCheck();
    }, 4500);
    this.cdr.markForCheck();
  }

  private triggerPotionMagic(): void {
    const effects = [
      '✨ Has probado la Poción de Concentración: mente lúcida y atenta.',
      '🧪 La pócima violeta burbujea: un aura mágica envuelve tu mesa.',
      '🌟 Destellos aromáticos de lavanda y tinta fresca despiertan tu inspiración.',
    ];
    this.catMessage = effects[Math.floor(Math.random() * effects.length)];
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => {
      this.catMessage = null;
      this.cdr.markForCheck();
    }, 4500);
    this.cdr.markForCheck();
  }

  private triggerHourglassFlip(): void {
    this.catMessage = '⏳ El tiempo de lectura fluye como arena dorada. ¡Cada página suma!';
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => {
      this.catMessage = null;
      this.cdr.markForCheck();
    }, 4500);
    this.cdr.markForCheck();
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

  /** Al probarse algo, tu Maguito reacciona: un respingo al probar, un salto al canjear o ponérselo. */
  private celebrateFitting(): void {
    const index = this.seats.findIndex(seat => seat.isMe);
    if (index < 0 || prefersReducedMotion()) return;
    this.seatMaguitos?.get(index)?.play(this.fittingGesture === 'try' ? 'poke' : 'success');
    if (this.fittingGesture !== 'try') return;
    const burst = this.fittingTick;
    this.fitBursts = [...this.fitBursts.slice(-2), burst];
    setTimeout(() => {
      this.fitBursts = this.fitBursts.filter(item => item !== burst);
      this.cdr.markForCheck();
    }, 700);
  }

  /** Horizontal de quien reacciona; si no está sentado a la vista, algún punto de la mesa. */
  private seatXFor(username: string, isMe: boolean): number {
    const seat = this.seats.find(item => isMe ? item.isMe : item.guest.username.toLowerCase() === username?.toLowerCase());
    return seat ? SEAT_X[seat.slot] : 24 + Math.random() * 52;
  }

  private spawnParticle(emoji: string, x = 24 + Math.random() * 52): void {
    this.tableReaction = emoji;
    this.tableReactionTick++;
    const p: FloatingParticle = {
      id: Math.random().toString(),
      emoji,
      // Un poco de dispersión para que dos reacciones seguidas no se tapen.
      x: Math.max(6, Math.min(94, x + (Math.random() - .5) * 8)),
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

    // La presencia real decide quién comparte la mesa. Tu asiento no cambia al llegar amigos.
    const seatedGuests = this.guests.filter(guest => guest.status?.kind === 'tavern');
    const slots: Slot[] = ['l1', 'r1', 'l2', 'r2'];
    this.seats = seatedGuests.slice(0, 4).map((guest, index) => ({
      slot: slots[index], guest, isMe: false, isFirst: isFirstRank(guest.username),
      bubble: this.bubbleFor(guest, index), mug: true,
    }));
    if (this.me) this.seats.push({
      slot: 'center', guest: this.me, isMe: true, isFirst: isFirstRank(this.me.username),
      bubble: this.fitting ? FITTING_BUBBLE : this.hostBubble(), mug: !this.fitting,
    });
    this.emptySlots = slots.slice(seatedGuests.length, Math.max(2, Math.min(4, seatedGuests.length + 1)));
    this.extraWide = Math.max(0, seatedGuests.length - 4);
    this.extraNarrow = Math.max(0, seatedGuests.length - 2);
    this.summary = this.describe(seatedGuests);
    this.cdr.markForCheck();
  }

  private hostBubble(): BubbleData | null {
    if (this.me) {
      const myMsg = this.messages.find(m => m.is_me || m.username === this.me!.username);
      if (myMsg && myMsg.content) {
        return { text: this.shorten(myMsg.content, 48), fullText: myMsg.content, isChat: true };
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
      return { text: this.shorten(userMsg.content, 48), fullText: userMsg.content, isChat: true };
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
