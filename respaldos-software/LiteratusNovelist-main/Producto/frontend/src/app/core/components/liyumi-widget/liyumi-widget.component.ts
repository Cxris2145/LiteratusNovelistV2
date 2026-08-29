import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LiyumiService, LiyumiState, LiyumiMessage } from '../../services/liyumi.service';

const ONBOARDING_MESSAGES: string[] = [
  '¡Hola! Soy Liyumi 🐢 Tu guía literaria.',
  '📚 Aquí puedes leer clásicos e interactuar con los personajes mediante IA.',
  '🎙️ En cada libro puedes escuchar la sinopsis con mi voz.',
  '✨ ¡Que disfrutes la lectura aumentada!'
];

@Component({
  selector: 'app-liyumi-widget',
  templateUrl: './liyumi-widget.component.html',
  styleUrls: ['./liyumi-widget.component.css']
})
export class LiyumiWidgetComponent implements OnInit, OnDestroy {
  private liyumi = inject(LiyumiService);
  private destroy$ = new Subject<void>();

  state: LiyumiState = 'idle';
  message: LiyumiMessage | null = null;
  isTalking = false;
  isOpen = false;

  isOnboarding = false;
  private onboardingIndex = 0;
  private onboardingTimer: any;

  ngOnInit(): void {
    this.liyumi.state$.pipe(takeUntil(this.destroy$)).subscribe(s => this.state = s);
    this.liyumi.message$.pipe(takeUntil(this.destroy$)).subscribe(m => this.message = m);
    this.liyumi.isTalking$.pipe(takeUntil(this.destroy$)).subscribe(t => this.isTalking = t);
    this.liyumi.isOpen$.pipe(takeUntil(this.destroy$)).subscribe(o => this.isOpen = o);

    // Check onboarding
    const seen = localStorage.getItem('liyumi_onboarding_done');
    if (!seen) {
      setTimeout(() => this.startOnboarding(), 1500);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.onboardingTimer);
  }

  toggleWidget(): void {
    this.liyumi.toggleOpen();
    if (!this.isOpen) {
      // Opening
      if (!this.message) {
        this.liyumi.speak({ text: '¿En qué puedo ayudarte hoy, lector? 📖', duration: 0 });
      }
    } else {
      this.liyumi.clearMessage();
    }
  }

  closeWidget(): void {
    this.liyumi.close();
    this.liyumi.clearMessage();
  }

  dismissMessage(): void {
    this.liyumi.clearMessage();
  }

  private startOnboarding(): void {
    this.isOnboarding = true;
    this.liyumi.open();
    this.showNextOnboardingMessage();
  }

  private showNextOnboardingMessage(): void {
    if (this.onboardingIndex >= ONBOARDING_MESSAGES.length) {
      this.isOnboarding = false;
      this.liyumi.clearMessage();
      localStorage.setItem('liyumi_onboarding_done', '1');
      return;
    }
    this.liyumi.speak({
      text: ONBOARDING_MESSAGES[this.onboardingIndex],
      duration: 0
    });
    this.onboardingIndex++;
  }

  nextOnboardingStep(): void {
    this.showNextOnboardingMessage();
  }

  skipOnboarding(): void {
    this.isOnboarding = false;
    this.liyumi.clearMessage();
    localStorage.setItem('liyumi_onboarding_done', '1');
    clearTimeout(this.onboardingTimer);
  }
}
