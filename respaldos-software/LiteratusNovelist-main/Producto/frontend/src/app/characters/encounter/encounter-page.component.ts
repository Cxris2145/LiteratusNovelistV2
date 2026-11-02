import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';

import { EncounterChatComponent } from './encounter-chat/encounter-chat.component';
import { EncounterPickerComponent } from './encounter-picker/encounter-picker.component';

/** Encuentro de personajes: sin id se eligen los dos personajes; con id se conversa. */
@Component({
  selector: 'app-encounter-page',
  standalone: true,
  imports: [CommonModule, EncounterChatComponent, EncounterPickerComponent],
  template: `
    <main class="enc-page" [class.enc-page--chat]="!!encounterId">
      <app-encounter-chat *ngIf="encounterId; else picker" [encounterId]="encounterId"></app-encounter-chat>
      <ng-template #picker><app-encounter-picker [preset]="preset"></app-encounter-picker></ng-template>
    </main>
  `,
  styles: [`
    :host { display: block; }
    /* --navbar-h: alto real del encabezado (lo mide AppComponent). */
    .enc-page { min-height: calc(100dvh - var(--navbar-h, 64px) - var(--bottom-nav-h, 0px)); }
    /* La conversación ocupa el alto disponible y solo se desplaza el feed (sin pie de página: ver
       AppComponent.isEncounterChat). --kb-inset: en iOS el teclado no achica la página
       (keyboard-inset.util.ts); en Android vale 0. Los márgenes laterales siguen al header. */
    .enc-page--chat {
      display: flex;
      box-sizing: border-box;
      height: calc(100dvh - var(--navbar-h, 64px) - var(--bottom-nav-h, 0px) - var(--kb-inset, 0px));
      min-height: 360px;
      padding: 14px var(--home-gutter, 24px) 16px;
    }
    @media (max-height: 820px) {
      .enc-page--chat { padding-top: 10px; padding-bottom: 12px; }
    }
    @media (max-width: 640px) {
      .enc-page--chat { padding: 0; }
    }
  `],
})
export class EncounterPageComponent {
  private readonly route = inject(ActivatedRoute);

  encounterId: string | null = null;
  preset: string[] = [];

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(([params, query]) => {
        this.encounterId = params.get('id');
        this.preset = [query.get('a'), query.get('b')].filter((id): id is string => !!id);
      });
  }
}
