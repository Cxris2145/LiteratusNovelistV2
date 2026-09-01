import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
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
  remainingMessages = 3;
  limitReached = false;

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
    const url = this.avatarId
      ? `ai/demo-chat/?avatar_id=${this.avatarId}`
      : `ai/demo-chat/`;

    this.api.get<any>(url).subscribe({
      next: (data) => {
        this.avatar = data;
        this.remainingMessages = data.remaining_messages ?? 3;
        this.limitReached = this.remainingMessages <= 0;
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
    const msg = this.inputText.trim();
    if (!msg || this.isSending || this.limitReached) return;

    this.messages.push({ role: 'user', content: msg });
    this.inputText = '';
    this.isSending = true;

    const payload: any = { message: msg };
    if (this.avatarId) payload.avatar_id = this.avatarId;

    this.api.post<any>('ai/demo-chat/', payload).subscribe({
      next: (res) => {
        this.messages.push({ role: 'assistant', content: res.reply });
        this.remainingMessages = res.remaining_messages ?? 0;
        if (this.remainingMessages <= 0) this.limitReached = true;
        this.isSending = false;
        setTimeout(() => this.scrollToBottom(), 60);

        if (this.isCallMode && !this.isMuted) {
          this.speakChatReply(res.reply);
        }
      },
      error: (err) => {
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

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  private scrollToBottom(): void {
    const el = document.querySelector('.dchat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  goBack(): void { this.router.navigate(['/characters']); }
  goToRegister(): void { 
    if (this.avatar && this.avatar.book_slug) {
      this.router.navigate(['/register'], { queryParams: { returnUrl: `/book/${this.avatar.book_slug}` } });
    } else {
      this.router.navigate(['/register']);
    }
  }

  toggleCallMode() {
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
