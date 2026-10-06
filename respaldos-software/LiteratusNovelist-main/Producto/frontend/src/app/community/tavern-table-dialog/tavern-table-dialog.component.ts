import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { CommunityService, FriendCard, TavernChatMessage, TavernInvitation } from '../../core/services/community.service';
import { GamificationService } from '../../core/services/gamification.service';
import { TavernTableAction } from '../tavern-table/tavern-table.types';

interface Reading {
  id: string; book_title?: string; author_name?: string;
  edition?: { book?: { title?: string } };
  progress?: { completion_percentage: number | string; updated_at?: string };
}
interface WeeklyMission {
  id: string; current_count: number; is_completed: boolean; progress_percentage: number;
  mission: { title: string; description: string; target_count: number; ink_reward: number; xp_reward: number; reset_type: string };
}
export interface TavernTableDialogData {
  action: TavernTableAction;
  friends: FriendCard[];
  outgoing: TavernInvitation[];
}
export interface TavernTableDialogResult { message?: TavernChatMessage; toast?: boolean; addFriend?: boolean; }

@Component({
  selector: 'app-tavern-table-dialog', standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatDialogModule],
  templateUrl: './tavern-table-dialog.component.html',
  styleUrls: ['../community-shared.css', './tavern-table-dialog.component.css'],
})
export class TavernTableDialogComponent implements OnInit, OnDestroy {
  readonly data = inject<TavernTableDialogData>(MAT_DIALOG_DATA);
  readonly dialog = inject<MatDialogRef<TavernTableDialogComponent, TavernTableDialogResult>>(MatDialogRef);
  private api = inject(ApiService);
  private community = inject(CommunityService);
  private gamification = inject(GamificationService);
  private destroy$ = new Subject<void>();
  readonly title: Record<TavernTableAction, string> = {
    book: 'Una lectura para compartir',
    invite: 'Una ronda entre amigos',
    rewards: 'Tu cofre de la semana',
    cat: 'El gato de la taberna',
    potions: 'Pociones mágicas',
    hourglass: 'Tiempo de lectura',
  };
  readonly icon: Record<TavernTableAction, string> = {
    book: 'auto_stories',
    invite: 'sports_bar',
    rewards: 'redeem',
    cat: 'pets',
    potions: 'science',
    hourglass: 'hourglass_bottom',
  };
  readings: Reading[] = [];
  missions: WeeklyMission[] = [];
  selectedId = '';
  quote = '';
  loading = false;
  busy = '';
  error = '';
  sent = new Set<string>();
  toasted = new Set<string>();

  get selected(): Reading | undefined { return this.readings.find(item => item.id === this.selectedId); }
  bookTitle(item: Reading): string { return item.book_title || item.edition?.book?.title || 'Mi lectura'; }
  progress(item: Reading): number { return Math.max(0, Math.min(100, Number(item.progress?.completion_percentage) || 0)); }

  ngOnInit(): void {
    this.data.outgoing.forEach(item => this.sent.add(item.user.friend_code));
    this.data.friends.filter(friend => friend.brindis_given).forEach(friend => this.toasted.add(friend.friend_code));
    this.load();
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  load(): void {
    this.error = '';
    if (this.data.action === 'invite') return;
    this.loading = true;
    if (this.data.action === 'book') {
      this.api.get<Reading[] | { results: Reading[] }>('library/inventory/').pipe(takeUntil(this.destroy$)).subscribe({
        next: response => {
          const readings = Array.isArray(response) ? response : response.results;
          this.readings = [...readings].sort((a, b) => {
            const active = (item: Reading) => this.progress(item) > 0 && this.progress(item) < 100 ? 1 : 0;
            return active(b) - active(a) || (b.progress?.updated_at || '').localeCompare(a.progress?.updated_at || '');
          });
          this.selectedId = this.readings[0]?.id || ''; this.loading = false;
        },
        error: () => { this.loading = false; this.error = 'No pudimos abrir tu biblioteca. Inténtalo de nuevo.'; },
      });
    } else {
      this.gamification.getMissions().pipe(takeUntil(this.destroy$)).subscribe({
        next: missions => { this.missions = missions.filter(item => item.mission?.reset_type === 'weekly'); this.loading = false; },
        error: () => { this.loading = false; this.error = 'No pudimos consultar tus misiones. Inténtalo de nuevo.'; },
      });
    }
  }

  share(): void {
    if (!this.selected || this.busy) return;
    const title = this.bookTitle(this.selected).slice(0, 120);
    const quote = this.quote.trim();
    const content = quote ? `De «${title}»: “${quote}”` : `Estoy leyendo «${title}». ¿Quién se suma a conversar? 📖`;
    this.busy = 'share'; this.error = '';
    this.community.sendMessage(content).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => this.dialog.close({ message: result.message }),
      error: err => { this.busy = ''; this.error = err.error?.message || 'No se pudo compartir. Tu cita sigue aquí para volver a intentarlo.'; },
    });
  }

  invite(friend: FriendCard): void {
    if (this.busy || this.sent.has(friend.friend_code)) return;
    this.busy = friend.friend_code; this.error = '';
    this.community.inviteToTavern(friend.friend_code).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.sent.add(friend.friend_code); this.busy = ''; },
      error: err => { this.busy = ''; this.error = err.error?.message || 'No pudimos enviar la invitación. Inténtalo de nuevo.'; },
    });
  }

  toast(friend: FriendCard): void {
    if (this.busy || this.toasted.has(friend.friend_code)) return;
    this.busy = friend.friend_code; this.error = '';
    this.community.giveBrindis(friend.friend_code).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.dialog.close({ toast: true }),
      error: err => { this.busy = ''; this.error = err.error?.message || 'No pudimos completar el brindis. Inténtalo de nuevo.'; },
    });
  }
}
