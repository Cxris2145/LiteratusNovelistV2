import { Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { AIUsage, SubscriptionService } from '../../../core/services/subscription.service';
import { Encounter, EncounterLine, EncounterParticipant, EncounterService } from '../../../core/services/encounter.service';
import { AIUsageMeterComponent } from '../../../core/components/ai-usage-meter/ai-usage-meter.component';
import { InkDayPassComponent } from '../../../core/components/ink-day-pass/ink-day-pass.component';
import { FALLBACK_AVATAR, portraitThumbnail } from '../../character-hub/character-hub.util';
import {
  AUTO_STEP_PAUSE_MS, EncounterStep, EncounterTarget, openingIdeas, planAutoRun, planRound, shortName,
} from '../encounter-turns.util';

/** Tras «Detener», el mismo botón no vuelve a arrancar la ronda hasta pasado este tiempo. */
const STOP_GUARD_MS = 800;

/**
 * Conversación a tres: el lector y dos personajes. Cada respuesta es un pedido aparte
 * (sendChat con el personaje que habla), encadenados en una cola: «A responde, luego B», o
 * varios turnos seguidos cuando siguen conversando solos. Detener vacía la cola; el turno en
 * curso termina igual (ya se está generando y cobrando).
 */
@Component({
  selector: 'app-encounter-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AIUsageMeterComponent, InkDayPassComponent],
  templateUrl: './encounter-chat.component.html',
  styleUrl: './encounter-chat.component.css',
})
export class EncounterChatComponent implements OnDestroy {
  private readonly encounters = inject(EncounterService);
  private readonly subscriptions = inject(SubscriptionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @Input() set encounterId(id: string | null) {
    if (id && id !== this.currentId) this.load(id);
  }

  @ViewChild('feed') private feed?: ElementRef<HTMLElement>;
  @ViewChild('input') private inputEl?: ElementRef<HTMLTextAreaElement>;

  readonly fallback = FALLBACK_AVATAR;
  currentId = '';
  state: 'loading' | 'ready' | 'error' = 'loading';
  encounter: Encounter | null = null;
  lines: EncounterLine[] = [];
  ideas: string[] = [];
  sameBook = false;

  draft = '';
  target: EncounterTarget = 'both';
  error = '';
  /** El turno que falló sigue en la cola: «Reintentar» lo vuelve a pedir. */
  canRetry = false;
  /** Sin plan ni pase: se ofrece el pase aquí mismo y la cola espera. */
  offerPass: AIUsage | null = null;
  /** Hay turnos automáticos en camino (el botón dice «Detener»). */
  autoRunning = false;
  /** Quién está escribiendo ahora. */
  typing: EncounterParticipant | null = null;

  editingTopic = false;
  topicDraft = '';
  savingTopic = false;
  restarting = false;

  private queue: EncounterStep[] = [];
  private busy = false;
  private stoppedAt = 0;
  private pauseTimer?: ReturnType<typeof setTimeout>;
  private loadSub?: Subscription;
  private sendSub?: Subscription;

  get isDemo(): boolean {
    return !this.auth.isLoggedIn() || this.auth.isGuest();
  }

  get pair(): [EncounterParticipant, EncounterParticipant] | null {
    return this.encounter?.participants ?? null;
  }

  get title(): string {
    const pair = this.pair;
    return pair ? `${pair[0].name} y ${pair[1].name}` : 'Encuentro de personajes';
  }

  get books(): string {
    const pair = this.pair;
    if (!pair) return '';
    return pair[0].book_title === pair[1].book_title ? pair[0].book_title : `${pair[0].book_title} · ${pair[1].book_title}`;
  }

  /** Se está esperando una respuesta o hay turnos en cola. */
  get working(): boolean {
    return this.busy || this.queue.length > 0;
  }

  get targetName(): string {
    const chosen = this.pair?.find(p => p.id === this.target);
    return chosen ? chosen.name : 'los dos';
  }

  trackLine = (_: number, line: EncounterLine) => line.id;
  trackPerson = (_: number, person: EncounterParticipant) => person.id;
  short = shortName;

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.sendSub?.unsubscribe();
    clearTimeout(this.pauseTimer);
  }

  speaker(line: EncounterLine): EncounterParticipant | null {
    return this.pair?.find(p => p.id === line.speaker_id) ?? null;
  }

  /** 0 o 1: el color de cada personaje. */
  speakerIndex(id: string | null | undefined): number {
    return this.pair?.[1].id === id ? 1 : 0;
  }

  /** Foto y nombre (o «Tú») solo en el primer mensaje de una racha de quien habla. */
  showHead(index: number): boolean {
    const line = this.lines[index];
    const prev = this.lines[index - 1];
    if (!prev || prev.role !== line.role) return true;
    return line.role === 'assistant' && prev.speaker_id !== line.speaker_id;
  }

  thumb(url: string | null | undefined, width = 160): string {
    return portraitThumbnail(url, width);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith(FALLBACK_AVATAR)) img.src = FALLBACK_AVATAR;
  }

  private load(id: string): void {
    this.stop();
    this.loadSub?.unsubscribe();
    this.sendSub?.unsubscribe();
    this.busy = false;
    this.typing = null;
    this.currentId = id;
    this.state = 'loading';
    this.error = '';
    this.offerPass = null;
    this.canRetry = false;
    this.target = 'both';
    this.editingTopic = false;
    this.loadSub = this.encounters.get(id).subscribe({
      next: encounter => this.show(encounter),
      error: err => {
        this.state = 'error';
        this.error = err?.status === 404 ? 'Este encuentro ya no existe.'
          : err?.error?.message || 'No pudimos abrir el encuentro. Intenta de nuevo.';
      },
    });
  }

  private show(encounter: Encounter): void {
    this.encounter = encounter;
    this.lines = [...encounter.messages];
    const [a, b] = encounter.participants;
    this.sameBook = a.book_slug === b.book_slug;
    this.ideas = openingIdeas(this.sameBook);
    this.state = 'ready';
    this.afterRender();
  }

  setTarget(target: EncounterTarget): void {
    this.target = target;
    this.inputEl?.nativeElement.focus();
  }

  send(text = this.draft): void {
    const message = text.trim();
    const pair = this.pair;
    if (!message || !pair || this.state !== 'ready' || this.isDemo) return;
    // Escribir corta la ronda automática; el turno que ya se está generando termina.
    this.stop();
    this.draft = '';
    this.error = '';
    const last = this.busy ? this.queue[0]?.speakerId ?? null : this.lastSpeakerId();
    this.enqueue(planRound(pair, this.target, last, message));
    this.afterRender();
  }

  useIdea(idea: string): void {
    this.target = 'both';
    this.send(idea);
  }

  /** «Que sigan conversando» / «Que empiecen ellos». */
  startAuto(): void {
    const pair = this.pair;
    // «Detener» y «Que sigan conversando» ocupan el mismo lugar: un doble clic en Detener no reanuda.
    if (!pair || this.working || this.isDemo || Date.now() - this.stoppedAt < STOP_GUARD_MS) return;
    this.error = '';
    this.autoRunning = true;
    this.enqueue(planAutoRun(pair, this.lastSpeakerId()));
  }

  /** Botón «Detener». */
  stopAuto(): void {
    this.stoppedAt = Date.now();
    this.stop();
  }

  /** Vacía la cola; si hay un turno en camino, ese termina. */
  stop(): void {
    clearTimeout(this.pauseTimer);
    this.queue = this.busy ? this.queue.slice(0, 1) : [];
    this.autoRunning = false;
    this.canRetry = false;
  }

  retry(): void {
    this.error = '';
    this.canRetry = false;
    this.pump();
  }

  /** Pase activado: sigue la cola, o se envía el mensaje que esperaba en el campo. */
  onPassActivated(): void {
    this.offerPass = null;
    if (this.queue.length) this.pump();
    else if (this.draft.trim()) this.send();
  }

  private enqueue(steps: EncounterStep[]): void {
    this.queue.push(...steps);
    this.pump();
  }

  private pump(): void {
    if (this.busy || this.offerPass || !this.queue.length || !this.encounter) return;
    const step = this.queue[0];
    const after = this.lastSavedId();
    const mine: EncounterLine | null = step.message ? {
      id: 'tmp-' + Date.now(), role: 'user', speaker_id: null, content: step.message, created_at: new Date().toISOString(),
    } : null;
    if (mine) this.lines.push(mine);
    this.busy = true;
    this.typing = this.pair?.find(p => p.id === step.speakerId) ?? null;
    this.afterRender();

    this.sendSub = this.subscriptions.sendChat(this.encounter.id, step.message, { speakerId: step.speakerId, after })
      .subscribe({
        next: res => {
          this.queue.shift();
          this.busy = false;
          this.typing = null;
          if (mine) mine.id = 'sent-' + (res.request_id || Date.now());
          this.lines.push({
            id: res.message_id || 'reply-' + Date.now(), role: 'assistant', speaker_id: res.speaker_id || step.speakerId,
            content: res.reply, created_at: res.timestamp || new Date().toISOString(),
          });
          this.afterRender();
          if (this.queue.length) this.pauseTimer = setTimeout(() => this.pump(), AUTO_STEP_PAUSE_MS);
          else this.autoRunning = false;
        },
        error: err => this.onStepError(step, mine, err),
      });
  }

  private onStepError(step: EncounterStep, mine: EncounterLine | null, err: any): void {
    this.busy = false;
    this.typing = null;
    if (mine) this.lines = this.lines.filter(line => line !== mine);
    if (err?.needsPass) {
      this.offerPass = err.usage;
      // El texto del lector espera en el campo (como en el chat de un personaje); los turnos
      // automáticos esperan en la cola. Al activar el pase sigue lo que quedó pendiente.
      if (step.message) {
        this.queue = [];
        this.autoRunning = false;
        if (!this.draft.trim()) this.draft = step.message;
      }
      this.afterRender();
      return;
    }
    if (step.message) {
      // Falló el turno que llevaba el texto del lector: vuelve al campo y la ronda se cancela.
      this.queue = [];
      this.autoRunning = false;
      if (!this.draft.trim()) this.draft = step.message;
      this.error = err?.error?.message || 'No llegó la respuesta. Intenta de nuevo; no se duplicará el cobro.';
    } else {
      this.canRetry = true;
      const name = this.pair?.find(p => p.id === step.speakerId)?.name || 'El personaje';
      this.error = err?.error?.message || `${name} no alcanzó a responder.`;
    }
    this.afterRender();
  }

  private lastSpeakerId(): string | null {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].role === 'assistant') return this.lines[i].speaker_id;
    }
    return null;
  }

  private lastSavedId(): string | null {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (!this.lines[i].id.startsWith('tmp-')) return this.lines[i].id;
    }
    return null;
  }

  editTopic(): void {
    this.topicDraft = this.encounter?.topic || '';
    this.editingTopic = true;
  }

  saveTopic(): void {
    if (!this.encounter || this.savingTopic) return;
    const topic = this.topicDraft.trim();
    if (topic === this.encounter.topic) {
      this.editingTopic = false;
      return;
    }
    this.savingTopic = true;
    this.encounters.setTopic(this.encounter.id, topic).subscribe({
      next: updated => {
        this.savingTopic = false;
        this.editingTopic = false;
        if (this.encounter) this.encounter.topic = updated.topic;
      },
      error: () => {
        this.savingTopic = false;
        this.error = 'No pudimos guardar el tema.';
      },
    });
  }

  onTopicKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTopic();
    } else if (event.key === 'Escape') {
      this.editingTopic = false;
    }
  }

  /** Una conversación nueva con los mismos personajes (la anterior queda en Mensajes). */
  restart(): void {
    const pair = this.pair;
    if (!pair || this.restarting) return;
    this.restarting = true;
    this.encounters.create([pair[0].id, pair[1].id], this.encounter?.topic || '', true).subscribe({
      next: encounter => {
        this.restarting = false;
        this.router.navigate(['/encuentro', encounter.id]);
      },
      error: err => {
        this.restarting = false;
        this.error = err?.error?.message || 'No pudimos empezar de nuevo.';
      },
    });
  }

  changeCharacters(): void {
    const pair = this.pair;
    this.router.navigate(['/encuentro'], pair ? { queryParams: { a: pair[0].id, b: pair[1].id } } : {});
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  /** El campo crece con el texto hasta unas 5 líneas. */
  autosize(): void {
    const el = this.inputEl?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight + 2;
    el.style.height = `${Math.min(full, 132)}px`;
    el.style.overflowY = full > 132 ? 'auto' : 'hidden';
  }

  /** Baja al último mensaje; sin mensajes, la escena inicial se ve desde arriba. */
  private afterRender(): void {
    setTimeout(() => {
      const feed = this.feed?.nativeElement;
      if (feed) feed.scrollTop = this.lines.length || this.typing ? feed.scrollHeight : 0;
      this.autosize();
    });
  }
}
