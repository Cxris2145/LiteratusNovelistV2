import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone,
  OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren, inject,
} from '@angular/core';

import { MaguitoComponent } from '../../core/components/maguito/maguito.component';
import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { AuthService, userStorageKey } from '../../core/services/auth.service';
import { FriendStatus, TavernChatMessage, TavernReactionItem } from '../../core/services/community.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';
import { TavernTableAction } from '../tavern-table/tavern-table.types';
import { timeAgo } from '../time-ago.util';

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
/** Un mensaje de la mesa se ve como globo sobre su Maguito solo un rato; después queda en el historial. */
const BUBBLE_MS = 10 * 60_000;
const HISTORY_SEEN_KEY = 'literatus_tavern_history_seen';

/** Mensajes seguidos de una misma persona en el historial de la mesa. */
export interface HistoryGroup {
  key: string;
  username: string;
  isMe: boolean;
  outfit: MaguitoOutfit;
  messages: TavernChatMessage[];
}

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
  private auth = inject(AuthService);

  get isGuest(): boolean {
    return this.auth.isGuest();
  }

  get isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  @Input() me: SceneGuest | null = null;
  @Input() guests: SceneGuest[] = [];
  @Input() demo = false;
  @Input() messages: TavernChatMessage[] = [];
  @Input() reactions: TavernReactionItem[] = [];
  @Input() toasting = false;
  /** El Bazar está abierto: la lámpara alumbra a tu Maguito, que hace de espejo. */
  @Input() fitting = false;
  /** Cambia con cada prenda probada, canjeada o puesta. */
  @Input() fittingTick = 0;
  @Input() fittingGesture: 'try' | 'buy' | 'equip' = 'try';

  @Output() sendMessage = new EventEmitter<string>();
  @Output() sendReaction = new EventEmitter<string>();
  /** Se abrió el historial: la sala trae los últimos 50 mensajes. */
  @Output() historyOpen = new EventEmitter<void>();
  @Output() deleteMessage = new EventEmitter<string>();
  @Output() tableAction = new EventEmitter<TavernTableAction>();
  @Output() guestSelect = new EventEmitter<SceneGuest>();

  @ViewChildren('seatMaguito') private seatMaguitos?: QueryList<MaguitoComponent>;

  seats: Seat[] = [];
  emptySlots: Slot[] = [];
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

  historyOpenState = false;
  historyGroups: HistoryGroup[] = [];
  unseenCount = 0;
  private historySeenAt = 0;
  /** Mensajes que llegaron con el historial abierto: entran con su animación (no los de antes). */
  historyFresh = new Set<string>();
  private historyBaseline = 0;
  readonly timeAgo = timeAgo;

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
    if (changes['messages']) this.buildHistory();
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
    if (this.catTimer) clearTimeout(this.catTimer);
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
  trackGroup = (_: number, group: HistoryGroup) => group.key;
  trackMessage = (_: number, message: TavernChatMessage) => message.id;

  sendChat(): void {
    if (this.isGuest) return;
    const text = this.chatText.trim();
    if (!text || this.busySending) return;
    this.sendMessage.emit(text);
    this.chatText = '';
    this.showEmojiList = false;
  }

  react(emoji: string): void {
    if (this.isGuest) return;
    this.sendReaction.emit(emoji);
    this.spawnParticle(emoji, this.demo ? SEAT_X.r1 : SEAT_X.center);
    if (emoji === '🍺') {
      this.triggerToastEffect();
    }
  }

  /** Menú "+" de la barra: Compartir lectura, Invitar y brindar, Mi cofre. */
  actionsOpen = false;

  toggleActions(): void {
    if (this.isGuest) return;
    this.actionsOpen = !this.actionsOpen;
    if (this.actionsOpen) {
      this.historyOpenState = false;
      this.showEmojiList = false;
    }
  }

  runAction(action: TavernTableAction): void {
    if (this.isGuest) return;
    this.actionsOpen = false;
    this.tableHover = null;
    this.activateTable(action);
  }

  toggleHistory(): void {
    if (this.isGuest) return;
    this.historyOpenState = !this.historyOpenState;
    this.showEmojiList = false;
    this.actionsOpen = false;
    if (this.historyOpenState) {
      // Lo que ya estaba (y lo más viejo que traiga la sala) no anima; solo lo posterior.
      this.historyBaseline = this.newestMessageAt();
      this.historyFresh.clear();
      this.historyOpen.emit();
      this.markHistorySeen();
      this.scrollHistoryToEnd();
    }
  }

  closeHistory(): void {
    if (!this.historyOpenState) return;
    this.historyOpenState = false;
    this.cdr.markForCheck();
  }

  removeMessage(message: TavernChatMessage): void {
    if (message.is_me) this.deleteMessage.emit(message.id);
  }

  insertEmoji(emoji: string): void {
    this.chatText += emoji;
    this.showEmojiList = false;
  }

  toggleEmojiList(): void {
    if (this.isGuest) return;
    this.showEmojiList = !this.showEmojiList;
    this.actionsOpen = false;
  }

  /** El selector de emojis se cierra al pulsar fuera o con Escape. */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointer(event: PointerEvent): void {
    const target = event.target as Element | null;
    // Escribir o reaccionar no cierra el historial: así se ve llegar lo que uno manda.
    if (this.historyOpenState && !target?.closest('.ts-chat-dock')) this.closeHistory();
    if (this.actionsOpen && !target?.closest('.ts-actions')) { this.actionsOpen = false; this.cdr.markForCheck(); }
    if (!this.showEmojiList) return;
    if (target?.closest('.ts-emoji-picker-wrap, .ts-emoji-toggle')) return;
    this.showEmojiList = false;
    this.cdr.markForCheck();
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.actionsOpen) {
      this.actionsOpen = false;
      this.cdr.markForCheck();
      (this.host.querySelector('.ts-actions-toggle') as HTMLElement | null)?.focus();
      return;
    }
    if (this.showEmojiList) {
      this.showEmojiList = false;
      this.cdr.markForCheck();
      return;
    }
    this.closeHistory();
  }

  catMessage: string | null = null;
  catLeaving = false;
  private catTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Cada objeto reacciona en la mesa y abre su ventana. En la mesa de muestra (visitantes) el
   * gato, las pociones y el reloj solo dejan un globo: sus ventanas necesitan una cuenta.
   */
  activateTable(action: TavernTableAction): void {
    if (action === 'cat') {
      this.tableReaction = '🐾';
      this.tableReactionTick++;
      this.spawnParticle('🐾', 78);
      if (this.demo) { this.triggerCatPurr(); return; }
    } else if (action === 'potions') {
      this.tableReaction = '✨';
      this.tableReactionTick++;
      this.spawnParticle('✨', 65);
      if (this.demo) { this.triggerPotionMagic(); return; }
    } else if (action === 'hourglass') {
      this.tableReaction = '⏳';
      this.tableReactionTick++;
      this.spawnParticle('⏳', 35);
      if (this.demo) { this.triggerHourglassFlip(); return; }
    } else {
      this.tableReaction = action === 'book' ? '📖' : action === 'rewards' ? '✨' : '🍺';
      this.tableReactionTick++;
    }
    this.tableAction.emit(action);
  }

  private triggerCatPurr(): void {
    this.showObjectMessage(pick([
      '¡Miau! 🐾 El gato negro de la taberna ronronea alegremente a tu lado.',
      '🐾 El gato de la taberna te guiña un ojo dorado con complicidad.',
      '¡Ronroneo de la suerte! 🐾 Tus próximas lecturas tendrán magia extra.',
      '🐾 El gato negro amasa suavemente la madera de la mesa.',
    ]));
  }

  private triggerPotionMagic(): void {
    this.showObjectMessage(pick([
      '✨ Has probado la Poción de Concentración: mente lúcida y atenta.',
      '🧪 La pócima violeta burbujea: un aura mágica envuelve tu mesa.',
      '🌟 Destellos aromáticos de lavanda y tinta fresca despiertan tu inspiración.',
    ]));
  }

  private triggerHourglassFlip(): void {
    this.showObjectMessage('⏳ El tiempo de lectura fluye como arena dorada. ¡Cada página suma!');
  }

  /** El globo de los objetos entra con ts-pop-in y se va fundiéndose (150 ms) a los 4,5 s. */
  private showObjectMessage(text: string): void {
    this.catMessage = text;
    this.catLeaving = false;
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => this.hideObjectBubble(), 4500);
    this.cdr.markForCheck();
  }

  hideObjectBubble(): void {
    if (!this.catMessage || this.catLeaving) return;
    this.catLeaving = true;
    this.cdr.markForCheck();
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => {
      this.catMessage = null;
      this.catLeaving = false;
      this.cdr.markForCheck();
    }, 150);
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
    if (this.demo) {
      // Distribución idéntica a la maqueta:
      // Izquierda: Tercer amigo (sombrero rojo con flor)
      // Centro: Amigo de Maguito (barba y sombrero de mago)
      // Derecha: Maguito con gafas de aviador
      const leftGuest = this.guests.find(g => g.code === 'demo-tercer') || this.guests[1] || this.guests[0];
      const centerGuest = this.guests.find(g => g.code === 'demo-amigo') || this.guests[0];
      const meGuest = this.me || { code: 'demo-me', username: 'Maguito', outfit: { head: 'aviator', cape: 'red' }, level: 12 };

      this.seats = [
        {
          slot: 'l1',
          guest: leftGuest,
          isMe: false,
          bubble: { text: '¡Qué gran capítulo! 📚', isChat: false },
          mug: true,
        },
        {
          slot: 'center',
          guest: centerGuest,
          isMe: false,
          bubble: { text: '¡Salud por más historias! 🍺', isChat: false },
          mug: true,
        },
        {
          slot: 'r1',
          guest: meGuest,
          isMe: true,
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
      slot: slots[index], guest, isMe: false,
      bubble: this.bubbleFor(guest, index), mug: true,
    }));
    if (this.me) this.seats.push({
      slot: 'center', guest: this.me, isMe: true,
      bubble: this.fitting ? FITTING_BUBBLE : this.hostBubble(), mug: !this.fitting,
    });
    this.emptySlots = slots.slice(seatedGuests.length, Math.max(2, Math.min(4, seatedGuests.length + 1)));
    this.summary = this.describe(seatedGuests);
    this.cdr.markForCheck();
  }

  /** Los mensajes de la mesa que todavía se ven como globo. */
  private get bubbleMessages(): TavernChatMessage[] {
    const since = Date.now() - BUBBLE_MS;
    return this.messages.filter(m => Date.parse(m.created_at) >= since);
  }

  private hostBubble(): BubbleData | null {
    if (this.me) {
      const myMsg = this.bubbleMessages.find(m => m.is_me || m.username === this.me!.username);
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
    const userMsg = this.bubbleMessages.find(
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

  /** Agrupa los mensajes (del más viejo al más nuevo) por autor seguido, como en un chat. */
  private buildHistory(): void {
    const ordered = [...(this.messages ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const groups: HistoryGroup[] = [];
    for (const message of ordered) {
      const last = groups[groups.length - 1];
      if (last && last.username === message.username) last.messages.push(message);
      else groups.push({ key: message.id, username: message.username, isMe: message.is_me, outfit: message.outfit, messages: [message] });
    }
    this.historyGroups = groups;
    if (!this.historySeenAt) this.historySeenAt = this.readHistorySeen();
    if (this.historyOpenState) {
      for (const message of ordered) {
        if (Date.parse(message.created_at) > this.historyBaseline) this.historyFresh.add(message.id);
      }
      this.markHistorySeen();
      this.scrollHistoryToEnd();
    } else {
      this.unseenCount = ordered.filter(m => !m.is_me && Date.parse(m.created_at) > this.historySeenAt).length;
    }
  }

  private newestMessageAt(): number {
    return this.messages.reduce((max, m) => Math.max(max, Date.parse(m.created_at) || 0), 0);
  }

  private markHistorySeen(): void {
    const newest = this.newestMessageAt();
    this.historySeenAt = Math.max(this.historySeenAt, newest, Date.now());
    this.unseenCount = 0;
    try { localStorage.setItem(userStorageKey(HISTORY_SEEN_KEY), String(this.historySeenAt)); } catch { /* sin almacenamiento */ }
  }

  private readHistorySeen(): number {
    try {
      const saved = Number(localStorage.getItem(userStorageKey(HISTORY_SEEN_KEY)));
      // La primera vez, lo anterior a hoy no cuenta como nuevo.
      return Number.isFinite(saved) && saved > 0 ? saved : Date.now() - 24 * 60 * 60_000;
    } catch {
      return Date.now();
    }
  }

  private scrollHistoryToEnd(): void {
    setTimeout(() => {
      const list = this.host.querySelector<HTMLElement>('.ts-history-list');
      if (list) list.scrollTop = list.scrollHeight;
    });
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

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
