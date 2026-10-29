import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { switchMap } from 'rxjs/operators';
import { KokoroTtsService } from '../../core/services/kokoro-tts.service';
import { SpeechRecognitionService } from '../../core/services/speech-recognition.service';

export interface DemoMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-demo-chat-page',
  templateUrl: './demo-chat-page.component.html',
  styleUrls: ['./demo-chat-page.component.css']
})
export class DemoChatPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  public auth = inject(AuthService);

  /** Verdadero solo si tiene cuenta real (no es guest/prueba). Usado en el template. */
  get isRealUser(): boolean {
    return this.auth.isLoggedIn() && !this.auth.isGuest();
  }
  private subscriptions = inject(SubscriptionService);
  sessionId: string | null = null;
  chatError = '';
  /** Sin plan ni pase: oferta del pase del día sobre el campo de escribir. */
  offerPass: any = null;
  private destroy$ = new Subject<void>();
  public kokoroVoice = inject(KokoroTtsService);
  public speechService = inject(SpeechRecognitionService);

  isCallMode = false;
  isMuted = false;
  isVideoSpeaking = false;
  activeTalkingFrame = 1;
  partialTranscript = '';
  audioLevel = 0;

  avatarId: string | null = null;
  avatar: any = null;
  avatarLoading = true;

  messages: DemoMessage[] = [];
  inputText = '';
  isSending = false;
  remainingMessages = 0;
  limitReached = false;
  showAuthModal = false;

  openAuthModal(): void {
    this.showAuthModal = true;
  }

  closeAuthModal(): void {
    this.showAuthModal = false;
  }

  ngOnInit(): void {
    window.scrollTo(0, 0);
    this.avatarId = this.route.snapshot.paramMap.get('avatarId');
    this.loadAvatar();

    this.speechService.transcript$.pipe(takeUntil(this.destroy$)).subscribe(text => {
      if (text) {
        this.inputText = text;
        this.sendMessage();
      }
    });

    this.speechService.partialTranscript$.pipe(takeUntil(this.destroy$)).subscribe(text => {
      this.partialTranscript = text;
    });

    this.speechService.audioLevel$.pipe(takeUntil(this.destroy$)).subscribe(level => {
      this.audioLevel = level;
    });
  }

  private loadAvatar(): void {
    if (this.isRealUser && !this.avatarId) {
      this.api.get<any>('ai/demo-chat/').pipe(takeUntil(this.destroy$)).subscribe({ next: avatar => {
        this.avatarId = avatar.id; this.loadAvatar();
      }, error: () => { this.avatarLoading = false; this.router.navigate(['/characters']); } });
      return;
    }
    if (this.isRealUser && this.avatarId) {
      this.api.get<any>(`ai/avatars/${this.avatarId}/`).pipe(
        switchMap(avatar => { this.avatar = avatar; return this.api.get<any>(`ai/sessions/?avatar_id=${this.avatarId}`); }),
        switchMap(session => { this.sessionId = session.id; return this.api.get<any[]>(`ai/sessions/${session.id}/messages/`); }),
        takeUntil(this.destroy$)
      ).subscribe({ next: messages => { this.messages = messages; this.avatarLoading = false; },
        error: err => { this.avatarLoading = false; this.chatError = err.error?.detail || err.error?.error || 'No se pudo abrir esta conversación.'; } });
      return;
    }
    const url = this.avatarId
      ? `ai/demo-chat/?avatar_id=${this.avatarId}`
      : `ai/demo-chat/`;

    this.api.get<any>(url).subscribe({
      next: (data) => {
        this.avatar = data;
        this.remainingMessages = 0;
        this.limitReached = !this.auth.isLoggedIn() || this.auth.isGuest();
        // Start with greeting
        if (data.greeting_message) {
          this.messages = [{ role: 'assistant', content: data.greeting_message }];
        }
        this.avatarLoading = false;
      },
      error: () => {
        this.avatarLoading = false;
        this.router.navigate(['/characters']);
      }
    });
  }

  sendMessage(): void {
    // Bloquear si no hay sesion o si es cuenta de prueba (guest)
    if (!this.auth.isLoggedIn() || this.auth.isGuest()) {
      this.openAuthModal();
      return;
    }
    const msg = this.inputText.trim();
    if (!msg || this.isSending || this.limitReached || !this.sessionId) return;
    this.chatError = '';

    this.messages.push({ role: 'user', content: msg });
    this.inputText = '';
    this.isSending = true;

    const payload: any = { message: msg };
    if (this.avatarId) payload.avatar_id = this.avatarId;

    const request = this.sessionId ? this.subscriptions.sendChat(this.sessionId, msg) : this.api.post<any>('ai/demo-chat/', payload);
    request.subscribe({
      next: (res) => {
        this.messages.push({ role: 'assistant', content: res.reply });
        if (!this.sessionId) { this.remainingMessages = res.remaining_messages ?? 0; this.limitReached = this.remainingMessages <= 0; }
        this.isSending = false;
        setTimeout(() => this.scrollToBottom(), 60);

        if (this.isCallMode && !this.isMuted) {
          this.speakChatReply(res.reply);
        }
      },
      error: (err) => {
        if (this.sessionId) {
          this.messages.pop(); this.inputText = msg; this.isSending = false;
          if (err.needsPass) { this.offerPass = err.usage; return; }
          this.chatError = err.error?.message || 'No se pudo confirmar la respuesta. Intenta de nuevo; no se duplicará el cargo.';
          return;
        }
        const errData = err?.error;
        if (errData?.error === 'DEMO_LIMIT_REACHED') {
          this.limitReached = true;
          this.remainingMessages = 0;
          this.messages.push({ role: 'assistant', content: errData.message });
        } else {
          this.messages.push({
            role: 'assistant',
            content: 'El viento sopla fuerte hoy y mi voz se pierde. Intenta de nuevo.'
          });
        }
        this.isSending = false;
        setTimeout(() => this.scrollToBottom(), 60);
      }
    });
  }

  /** Pase activado: el mensaje que quedó en el campo se envía solo. */
  onPassActivated(): void {
    this.offerPass = null;
    this.sendMessage();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  private scrollToBottom(): void {
    const el = document.querySelector('.dchat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  goBack(): void { this.router.navigate(['/characters']); }
  goToLogin(): void {
    const returnUrl = this.avatarId ? `/chat/${this.avatarId}` : '/chat';
    this.router.navigate(['/login'], { queryParams: { returnUrl } });
  }
  goToRegister(): void { 
    const returnUrl = this.avatarId ? `/chat/${this.avatarId}` : '/chat';
    this.router.navigate(['/register'], { queryParams: { returnUrl } });
  }

  toggleCallMode() {
    if (!this.auth.isLoggedIn() || this.auth.isGuest()) {
      this.openAuthModal();
      return;
    }
    this.isCallMode = !this.isCallMode;
    if (this.isCallMode) {
      this.speechService.startListening();
    } else {
      this.speechService.stopListening();
      this.kokoroVoice.stop();
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.kokoroVoice.stop();
    }
  }

  getMangaFrameUrl(): string {
    if (!this.avatar || !this.avatar.avatar_image_url) {
      return '';
    }
    const url = this.avatar.avatar_image_url;
    if (!url.includes('manga_assets')) {
      return url;
    }
    
    let base = url;
    if (base.endsWith('calm.webp') || base.endsWith('calm.png')) {
      base = base.substring(0, base.lastIndexOf('/') + 1);
    } else {
      if (!base.endsWith('/')) base += '/';
    }

    if (this.isSending) {
      return base + 'thinking.webp';
    } else if (this.isVideoSpeaking) {
      return base + `talking_${this.activeTalkingFrame}.webp`;
    }
    return base + 'calm.webp';
  }

  private speakChatReply(text: string) {
    const charName = this.avatar?.name || 'Unknown';
    const nameLower = charName.toLowerCase();
    
    let voiceId = 'ef_dora';
    if (nameLower.includes('alcalde') || nameLower.includes('rey') || nameLower.includes('padre') || nameLower.includes('señor')) {
      voiceId = 'em_santa';
    } else if (nameLower.includes('príncipe') || nameLower.includes('principe') || nameLower.includes('autor') || nameLower.includes('joven') || nameLower.includes('niño')) {
      voiceId = 'em_alex';
    }

    this.kokoroVoice.speak(text, this.avatarId || 1, 0, voiceId);
    
    this.kokoroVoice.isSpeaking$.pipe(takeUntil(this.destroy$)).subscribe(speaking => {
      this.isVideoSpeaking = speaking;
      if (speaking) {
        this.activeTalkingFrame = Math.floor(Math.random() * 3) + 1;
      }
    });
  }

  ngOnDestroy(): void {
    this.speechService.stopListening();
    this.kokoroVoice.stop();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
