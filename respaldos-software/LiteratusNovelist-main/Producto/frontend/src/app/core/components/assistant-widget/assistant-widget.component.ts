import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { slideUpPanelAnimation } from '../../animations';
import { AssistantService, AssistantConversation, AssistantMessage } from '../../services/assistant.service';

@Component({
  selector: 'app-assistant-widget',
  templateUrl: './assistant-widget.component.html',
  styleUrls: ['./assistant-widget.component.css'],
  animations: [slideUpPanelAnimation]
})
export class AssistantWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
  private assistant = inject(AssistantService);
  private destroy$ = new Subject<void>();

  @ViewChild('messagesEl') private messagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('bubbleLottie') private bubbleLottie?: ElementRef<HTMLDivElement>;

  isOpen = false;
  isHistoryOpen = false;
  conversations: AssistantConversation[] = [];
  activeConversationId: string | null = null;
  messages: AssistantMessage[] = [];
  isSending = false;
  unreadCount = 0;
  draft = '';

  isBouncing = false;
  private lastUnreadCount = 0;
  private shouldScrollOnNextCheck = false;
  private lottieAnim?: any;

  get currentSection(): string {
    return this.assistant.currentSection;
  }

  ngOnInit(): void {
    this.assistant.isOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isOpen = v);
    this.assistant.isHistoryOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isHistoryOpen = v);
    this.assistant.conversations$.pipe(takeUntil(this.destroy$)).subscribe(v => this.conversations = v);
    this.assistant.activeConversationId$.pipe(takeUntil(this.destroy$)).subscribe(v => this.activeConversationId = v);
    this.assistant.isSending$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isSending = v);
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
    this.assistant.minimize();
  }

  close(): void {
    this.assistant.close();
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
