import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CommunityProfile, CommunityResult, CommunityService, TavernCard } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { prefersReducedMotion } from '../../core/utils/motion.util';

/**
 * Perfil de otro lector en /tavern/amigo/:code. Si es tu amigo ves todo y puedes brindar;
 * si no, solo su Maguito, su nombre y el botón para invitarlo.
 */
@Component({
  selector: 'app-friend-profile',
  templateUrl: './friend-profile.component.html',
  styleUrls: ['../community-shared.css', './friend-profile.component.css'],
})
export class FriendProfileComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private community = inject(CommunityService);
  private notification = inject(NotificationService);
  private destroy$ = new Subject<void>();

  profile: CommunityProfile | TavernCard | null = null;
  loading = true;
  notFound = false;
  busy = false;
  confirmingRemove = false;
  /** Dispara la animación de las jarras al brindar. */
  cheers = false;
  private code = '';

  get full(): CommunityProfile | null {
    return this.profile?.full ? this.profile : null;
  }

  get minimal(): TavernCard | null {
    return this.profile && !this.profile.full ? this.profile : null;
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.code = (params.get('code') || '').replace(/^#/, '').toUpperCase();
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.notFound = false;
    this.confirmingRemove = false;
    this.community.profile(this.code).subscribe({
      next: profile => {
        if (profile.relation === 'self') {
          this.router.navigate(['/tavern'], { replaceUrl: true });
          return;
        }
        this.profile = profile;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notFound = true;
      },
    });
  }

  toggleBrindis(): void {
    const friend = this.full;
    if (!friend || this.busy) return;
    const giving = !friend.brindis_given;
    this.run(giving ? this.community.giveBrindis(friend.friend_code) : this.community.removeBrindis(friend.friend_code), result => {
      friend.brindis_given = !!result.given;
      friend.stats = { ...friend.stats, brindis: result.brindis_count ?? friend.stats.brindis };
      if (giving && !prefersReducedMotion()) {
        this.cheers = false;
        setTimeout(() => this.cheers = true);
        setTimeout(() => this.cheers = false, 1300);
      }
    });
  }

  requestAction(): void {
    const card = this.minimal;
    if (!card || this.busy) return;
    if (card.relation === 'incoming' && card.request_id) {
      this.run(this.community.accept(card.request_id), () => this.load());
    } else if (card.relation === 'outgoing' && card.request_id) {
      this.run(this.community.cancel(card.request_id), () => { card.relation = 'none'; card.request_id = null; });
    } else {
      this.run(this.community.sendRequest({ friend_code: card.friend_code }), result => {
        if (result.state === 'accepted') this.load();
        else { card.relation = 'outgoing'; card.request_id = result.id ?? null; }
      });
    }
  }

  requestLabel(card: TavernCard): string {
    if (card.relation === 'incoming') return 'Aceptar solicitud';
    if (card.relation === 'outgoing') return 'Cancelar solicitud';
    return 'Enviar solicitud';
  }

  removeFriend(): void {
    const friend = this.full;
    if (!friend) return;
    this.run(this.community.unfriend(friend.friend_code), () => this.router.navigate(['/tavern']));
  }

  private run(request: Observable<CommunityResult>, done: (result: CommunityResult) => void): void {
    this.busy = true;
    request.subscribe({
      next: result => {
        this.busy = false;
        done(result);
        this.community.changed$.next();
        if (result.message) this.notification.success(result.message, 'Taberna');
      },
      error: err => {
        this.busy = false;
        this.notification.error(err.error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.', 'Taberna');
      },
    });
  }
}
