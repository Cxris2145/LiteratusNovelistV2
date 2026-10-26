import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';
import {
  ActivityEvent, ChildActivity, ChildChatDetail, ChildChats, ChildGames, ChildOverview, ChildReading, ChildWriting,
  GuardianAction, ParentalService,
} from '../../core/services/parental.service';
import { NotificationService } from '../../core/services/notification.service';
import { GuardianActionDialogComponent, GuardianActionDialogData } from '../guardian-action-dialog/guardian-action-dialog.component';
import {
  apiErrorMessage, dayHeading, formatDate, formatMinutes, formatShortDate, formatTime, initialOf, localDayKey, relativeTime,
} from '../parental-format';

export type HistoryTab = 'resumen' | 'lectura' | 'juegos' | 'escritura' | 'actividad' | 'ajustes';

export const HISTORY_TABS: { id: HistoryTab; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: 'space_dashboard' },
  { id: 'lectura', label: 'Lectura', icon: 'menu_book' },
  { id: 'juegos', label: 'Juegos', icon: 'sports_esports' },
  { id: 'escritura', label: 'Lo que escribe', icon: 'edit_note' },
  { id: 'actividad', label: 'Actividad', icon: 'history' },
  { id: 'ajustes', label: 'Ajustes', icon: 'tune' },
];

interface DayGroup { key: string; heading: string; events: ActivityEvent[]; }

/** Historial de un hijo para su tutor, por pestañas (cada una pide su sección al abrirse). */
@Component({
  selector: 'app-child-history',
  templateUrl: './child-history.component.html',
  styleUrls: ['../parental-shared.css', './child-history.component.css']
})
export class ChildHistoryComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private parental = inject(ParentalService);
  private dialog = inject(MatDialog);
  private notifications = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  readonly tabs = HISTORY_TABS;
  readonly formatMinutes = formatMinutes;
  readonly formatDate = formatDate;
  readonly formatShortDate = formatShortDate;
  readonly formatTime = formatTime;
  readonly relativeTime = relativeTime;
  readonly initialOf = initialOf;

  childId = '';
  tab: HistoryTab = 'resumen';

  overview: ChildOverview | null = null;
  reading: ChildReading | null = null;
  games: ChildGames | null = null;
  writing: ChildWriting | null = null;
  chats: ChildChats | null = null;
  activity: ChildActivity | null = null;
  activityGroups: DayGroup[] = [];

  loadingOverview = true;
  notFound = false;
  sectionLoading = false;
  sectionError = '';
  overviewError = '';

  /** Conversaciones con personajes abiertas (se piden al desplegarlas). */
  openChats = new Set<string>();
  chatDetails: Record<string, ChildChatDetail | 'loading' | 'error'> = {};
  openInterrogations = new Set<string>();

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('childId') || '';
      if (id !== this.childId) {
        this.childId = id;
        this.reset();
        this.loadOverview();
      }
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const wanted = params.get('seccion') as HistoryTab | null;
      this.tab = this.tabs.some(t => t.id === wanted) ? wanted as HistoryTab : 'resumen';
      this.loadSection();
    });
  }

  get childName(): string {
    const child = this.overview?.child;
    return child ? (child.first_name || child.username) : '';
  }

  selectTab(tab: HistoryTab): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { seccion: tab === 'resumen' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private reset(): void {
    this.overview = this.reading = this.games = this.writing = this.chats = this.activity = null;
    this.activityGroups = [];
    this.openChats.clear();
    this.openInterrogations.clear();
    this.chatDetails = {};
    this.notFound = false;
  }

  loadOverview(): void {
    this.loadingOverview = true;
    this.overviewError = '';
    this.parental.overview(this.childId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.overview = data;
        this.loadingOverview = false;
      },
      error: err => {
        this.loadingOverview = false;
        this.notFound = err?.status === 404;
        this.overviewError = apiErrorMessage(err, 'No pudimos cargar su historial. Inténtalo de nuevo.');
      }
    });
  }

  /** Pide la sección de la pestaña activa la primera vez que se abre. */
  loadSection(force = false): void {
    if (!this.childId) return;
    this.sectionError = '';
    const fail = (err: unknown) => {
      this.sectionLoading = false;
      this.sectionError = apiErrorMessage(err, 'No pudimos cargar esta sección. Inténtalo de nuevo.');
    };
    const done = () => this.sectionLoading = false;
    const keep = takeUntilDestroyed<any>(this.destroyRef);

    if (this.tab === 'lectura' && (force || !this.reading)) {
      this.sectionLoading = true;
      this.parental.section<ChildReading>(this.childId, 'reading').pipe(keep)
        .subscribe({ next: data => { this.reading = data; done(); }, error: fail });
    } else if (this.tab === 'juegos' && (force || !this.games)) {
      this.sectionLoading = true;
      this.parental.section<ChildGames>(this.childId, 'games').pipe(keep)
        .subscribe({ next: data => { this.games = data; done(); }, error: fail });
    } else if (this.tab === 'escritura' && (force || !this.writing || !this.chats)) {
      this.sectionLoading = true;
      forkJoin({
        writing: this.parental.section<ChildWriting>(this.childId, 'writing'),
        chats: this.parental.section<ChildChats>(this.childId, 'chats'),
      }).pipe(keep).subscribe({
        next: ({ writing, chats }) => { this.writing = writing; this.chats = chats; done(); },
        error: fail,
      });
    } else if (this.tab === 'actividad' && (force || !this.activity)) {
      this.sectionLoading = true;
      this.parental.section<ChildActivity>(this.childId, 'activity').pipe(keep).subscribe({
        next: data => {
          this.activity = data;
          this.activityGroups = this.groupByDay(data.events);
          done();
        },
        error: fail,
      });
    }
  }

  private groupByDay(events: ActivityEvent[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const event of events) {
      const key = localDayKey(event.at);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, heading: dayHeading(event.at), events: [] };
        groups.push(group);
      }
      group.events.push(event);
    }
    return groups;
  }

  // ── Gráficos simples ──

  barHeight(minutes: number, days: { minutes: number }[]): number {
    const max = Math.max(...days.map(d => d.minutes), 1);
    return minutes ? Math.max(6, Math.round((minutes / max) * 100)) : 0;
  }

  readingDaysSummary(days: { minutes: number }[]): string {
    const active = days.filter(d => d.minutes > 0).length;
    const total = days.reduce((sum, d) => sum + d.minutes, 0);
    return `Leyó ${active} de los últimos ${days.length} días, ${formatMinutes(total)} en total.`;
  }

  percent(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }

  startedUnits(games: ChildGames) {
    const units = games.senda.units;
    const lastStarted = units.reduce((last, unit, i) => unit.levels_completed > 0 ? i : last, -1);
    // Las unidades con avance y la siguiente, para no listar las 30.
    return units.slice(0, Math.max(lastStarted + 2, 1));
  }

  // ── Chats ──

  toggleChat(sessionId: string): void {
    if (this.openChats.has(sessionId)) {
      this.openChats.delete(sessionId);
      return;
    }
    this.openChats.add(sessionId);
    const current = this.chatDetails[sessionId];
    if (current && current !== 'error') return;
    this.chatDetails[sessionId] = 'loading';
    this.parental.chat(this.childId, sessionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => this.chatDetails[sessionId] = detail,
      error: () => this.chatDetails[sessionId] = 'error',
    });
  }

  chatDetail(sessionId: string): ChildChatDetail | null {
    const detail = this.chatDetails[sessionId];
    return typeof detail === 'object' ? detail : null;
  }

  toggleInterrogation(id: string): void {
    if (this.openInterrogations.has(id)) this.openInterrogations.delete(id);
    else this.openInterrogations.add(id);
  }

  // ── Ajustes ──

  openAction(action: GuardianAction): void {
    const child = this.overview?.child;
    if (!child || this.dialog.openDialogs.length) return;
    this.dialog.open<GuardianActionDialogComponent, GuardianActionDialogData, boolean>(GuardianActionDialogComponent, {
      data: { action, childId: child.id, childName: this.childName, username: child.username, hasOwnEmail: child.has_own_email },
      panelClass: 'account-dialog-panel',
      width: '480px',
      maxWidth: 'calc(100vw - 24px)',
      autoFocus: 'first-tabbable',
      ariaLabelledBy: 'ga-title',
    }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ok => {
      if (!ok) return;
      if (action === 'password') {
        this.notifications.success(`${this.childName} ya puede entrar con su contraseña nueva.`, 'Control parental');
        return;
      }
      this.notifications.success(action === 'unlink'
        ? `La cuenta de ${this.childName} ya no está a tu cargo.`
        : `La cuenta de ${this.childName} se eliminó.`, 'Control parental');
      this.router.navigate(['/control-parental']);
    });
  }
}
