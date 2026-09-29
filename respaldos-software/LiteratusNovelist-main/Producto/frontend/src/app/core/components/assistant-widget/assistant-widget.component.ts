import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { slideUpPanelAnimation } from '../../animations';
import { AssistantService, AssistantConversation, AssistantMessage } from '../../services/assistant.service';
import { SpeechRecognitionService } from '../../services/speech-recognition.service';
import { MaguitoState } from '../maguito/maguito.component';

@Component({
  selector: 'app-assistant-widget',
  templateUrl: './assistant-widget.component.html',
  styleUrls: ['./assistant-widget.component.css'],
  animations: [slideUpPanelAnimation]
})
export class AssistantWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
  private assistant = inject(AssistantService);
  private speechService = inject(SpeechRecognitionService);
  private destroy$ = new Subject<void>();

  @ViewChild('messagesEl') private messagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('bubbleLottie') private bubbleLottie?: ElementRef<HTMLDivElement>;

  isOpen = false;
  isHistoryOpen = false;
  conversations: AssistantConversation[] = [];
  activeConversationId: string | null = null;
  messages: AssistantMessage[] = [];
  isSending = false;
  isListening = false;
  unreadCount = 0;
  draft = '';

  isBouncing = false;
  /** Maguito en la cabecera: saluda al abrir y celebra cuando llega una respuesta. */
  mascotState: MaguitoState = 'chat';
  private lastUnreadCount = 0;
  private shouldScrollOnNextCheck = false;
  private lottieAnim?: any;

  get currentSection(): string {
    return this.assistant.currentSection;
  }

  ngOnInit(): void {
    this.assistant.isOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      if (v && !this.isOpen) this.mascotState = 'chat';
      this.isOpen = v;
    });
    this.assistant.isHistoryOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isHistoryOpen = v);
    this.assistant.conversations$.pipe(takeUntil(this.destroy$)).subscribe(v => this.conversations = v);
    this.assistant.activeConversationId$.pipe(takeUntil(this.destroy$)).subscribe(v => this.activeConversationId = v);
    this.assistant.isSending$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      if (this.isSending && !v) this.mascotState = 'success';
      this.isSending = v;
    });
    this.assistant.messages$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      this.messages = v;
      this.shouldScrollOnNextCheck = true;
    });
    this.assistant.unreadCount$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      if (v > this.lastUnreadCount) this.triggerBounce();
      this.lastUnreadCount = v;
      this.unreadCount = v;
    });

    this.assistant.bootstrap();
    this.loadMascot();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollOnNextCheck && this.messagesEl) {
      this.shouldScrollOnNextCheck = false;
      const el = this.messagesEl.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  ngOnDestroy(): void {
    if (this.isListening) {
      this.speechService.stopListening();
      this.isListening = false;
    }
    this.destroy$.next();
    this.destroy$.complete();
    this.lottieAnim?.destroy?.();
  }

  private loadMascot(): void {
    // Carga diferida, igual que el héroe de Inicio: lottie-web no debe pesar en el bundle inicial.
    setTimeout(() => {
      if (!this.bubbleLottie) return;
      import('lottie-web').then(({ default: lottie }) => {
        if (this.destroy$.isStopped || !this.bubbleLottie) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.lottieAnim = lottie.loadAnimation({
          container: this.bubbleLottie.nativeElement,
          renderer: 'svg',
          loop: !reducedMotion,
          autoplay: !reducedMotion,
          path: 'assets/lottie/magic.json'
        });
      });
    }, 0);
  }

  toggle(): void {
    this.assistant.toggleOpen();
  }

  minimize(): void {
    if (this.isListening) {
      this.speechService.stopListening();
      this.isListening = false;
    }
    this.assistant.minimize();
  }

  close(): void {
    if (this.isListening) {
      this.speechService.stopListening();
      this.isListening = false;
    }
    this.assistant.close();
  }

  toggleVoiceInput(): void {
    if (this.isListening) {
      this.speechService.stopListening();
      this.isListening = false;
      return;
    }

    this.isListening = true;
    this.speechService.startListening();

    const partialSub = this.speechService.partialTranscript$.subscribe(text => {
      if (text && this.isListening) {
        this.draft = text;
      }
    });

    const finalSub = this.speechService.transcript$.subscribe(finalText => {
      if (finalText && this.isListening) {
        this.draft = finalText;
        this.isListening = false;
        this.speechService.stopListening();
        partialSub.unsubscribe();
        finalSub.unsubscribe();
      }
    });

    // Auto-timeout tras 10 segundos
    setTimeout(() => {
      if (this.isListening) {
        this.isListening = false;
        this.speechService.stopListening();
        partialSub.unsubscribe();
        finalSub.unsubscribe();
      }
    }, 10000);
  }

  toggleHistory(): void {
    this.assistant.toggleHistory();
  }

  newConversation(): void {
    this.assistant.startNewConversation();
  }

  selectConversation(conversation: AssistantConversation): void {
    this.assistant.selectConversation(conversation);
  }

  send(): void {
    const text = this.draft;
    this.draft = '';
    this.assistant.sendMessage(text);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.draft.trim() && !this.isSending) this.send();
    }
  }

  trackByMessage(index: number, msg: AssistantMessage): string {
    return msg.id || `${index}-${msg.content.slice(0, 10)}`;
  }

  trackByConversation(index: number, conv: AssistantConversation): string {
    return conv.id;
  }

  private triggerBounce(): void {
    this.isBouncing = true;
    setTimeout(() => this.isBouncing = false, 900);
  }
}
