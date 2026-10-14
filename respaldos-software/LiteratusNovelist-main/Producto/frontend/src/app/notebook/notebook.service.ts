import { Injectable, NgZone, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';

import { ApiService } from '../core/services/api.service';
import { userStorageKey } from '../core/services/auth.service';
import {
  NotebookDigest, NotebookGeometry, NotebookPrefs, NotebookSaveState, NotebookTab, NotebookTabMeta,
  NotebookVisibility,
} from './notebook.models';

type Editable = Partial<Pick<NotebookTab, 'title' | 'content' | 'drawing'>>;

interface Draft {
  fields: Editable;
  base: number;
}

interface ReaderJump {
  (chapterId: string, word: number, lastWord?: number): void;
}

const SAVE_DELAY_MS = 900;
const RETRY_MS = 6000;
export const DEFAULT_PREFS: NotebookPrefs = { font: 'Plus Jakarta Sans', size: 16, zoom: 100, paper: 'theme' };

/**
 * Cuaderno flotante (botón de cuaderno): pestañas, guardado y puente con el lector.
 *
 * La ventana (editor, dibujo, PDF) se descarga recién la primera vez que se abre; este servicio
 * es liviano y vive siempre. Todo se guarda en la cuenta: cada cambio se envía ~1 s después de
 * dejar de escribir, en orden, con la revisión en la que se basó. Si otro dispositivo guardó
 * antes, el servidor responde 409 y el cuaderno pregunta qué versión conservar. Sin conexión,
 * lo escrito queda como borrador en este navegador hasta poder enviarlo.
 */
@Injectable({ providedIn: 'root' })
export class NotebookService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  readonly visibility$ = new BehaviorSubject<NotebookVisibility>('closed');
  readonly tabs$ = new BehaviorSubject<NotebookTabMeta[]>([]);
  readonly activeId$ = new BehaviorSubject<string | null>(null);
  readonly saveStates$ = new BehaviorSubject<Record<string, NotebookSaveState>>({});
  /** Versión del servidor de una pestaña en conflicto (otro dispositivo guardó antes). */
  readonly conflicts$ = new BehaviorSubject<Record<string, NotebookTab>>({});
  /** Una pestaña cambió desde fuera del editor (se eligió la versión del servidor): hay que recargarla. */
  readonly replaced$ = new Subject<NotebookTab>();
  readonly errors$ = new Subject<string>();
  readonly prefs$ = new BehaviorSubject<NotebookPrefs>(this.readPrefs());

  private readonly cache = new Map<string, NotebookTab>();
  private readonly loading = new Map<string, Promise<NotebookTab>>();
  private readonly dirty = new Map<string, Editable>();
  private readonly inFlight = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly readers = new Map<string, ReaderJump>();
  private tabsLoaded: Promise<void> | null = null;
  private currentReader: string | null = null;

  constructor() {
    const saved = this.readJson<{ visibility?: NotebookVisibility; active?: string }>('literatus_notebook_state');
    if (saved?.visibility === 'open' || saved?.visibility === 'minimized') {
      this.activeId$.next(saved.active || null);
      this.visibility$.next(saved.visibility);
    }
    this.visibility$.subscribe(() => this.persistState());
    this.activeId$.subscribe(() => this.persistState());
    // Al cerrar o recargar la página, lo que aún no se envió queda como borrador.
    window.addEventListener('pagehide', () => this.dirty.forEach((_, id) => this.writeDraft(id)));
  }

  // ── Ventana ───────────────────────────────────────────────────────────────

  get visibility(): NotebookVisibility {
    return this.visibility$.value;
  }

  /** Botón del cuaderno: abre (en el lector, la pestaña de ese libro), minimiza o restaura. */
  toggle(): void {
    if (this.visibility === 'open') {
      this.minimize();
    } else if (this.visibility === 'minimized') {
      this.visibility$.next('open');
    } else if (this.currentReader) {
      this.openForBook(this.currentReader);
    } else {
      this.open();
    }
  }

  open(): void {
    this.visibility$.next('open');
  }

  minimize(): void {
    this.flushAll();
    this.visibility$.next('minimized');
  }

  close(): void {
    this.flushAll();
    this.visibility$.next('closed');
  }

  /** Abre la pestaña de un libro de la biblioteca (la crea la primera vez). */
  async openForBook(inventoryId: string): Promise<void> {
    this.visibility$.next('open');
    try {
      await this.loadTabs();
      const tab = await firstValueFrom(this.api.post<NotebookTab>('library/notebook/for-book/', { inventory: inventoryId }));
      this.remember(tab);
      this.activeId$.next(tab.id);
    } catch (error) {
      this.errors$.next(this.message(error, 'No se pudo abrir la pestaña de este libro.'));
    }
  }

  // ── Pestañas ──────────────────────────────────────────────────────────────

  loadTabs(force = false): Promise<void> {
    if (!this.tabsLoaded || force) {
      this.tabsLoaded = firstValueFrom(this.api.get<NotebookTabMeta[]>('library/notebook/')).then(tabs => {
        this.tabs$.next(tabs);
        const active = this.activeId$.value;
        if (!active || !tabs.some(tab => tab.id === active)) this.activeId$.next(tabs[0]?.id || null);
      }).catch(error => {
        this.tabsLoaded = null;
        throw error;
      });
    }
    return this.tabsLoaded;
  }

  /** Contenido completo de una pestaña (con el borrador local si quedó algo sin enviar). */
  getTab(id: string): Promise<NotebookTab> {
    const cached = this.cache.get(id);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(id);
    if (!pending) {
      pending = firstValueFrom(this.api.get<NotebookTab>(`library/notebook/${id}/`)).then(tab => {
        this.cache.set(id, tab);
        this.applyDraft(tab);
        return tab;
      }).finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }

  peekTab(id: string): NotebookTab | undefined {
    return this.cache.get(id);
  }

  async createTab(title = 'Sin título'): Promise<void> {
    try {
      const tab = await firstValueFrom(this.api.post<NotebookTab>('library/notebook/', { title }));
      this.remember(tab);
      this.activeId$.next(tab.id);
    } catch (error) {
      this.errors$.next(this.message(error, 'No se pudo crear la pestaña.'));
    }
  }

  async deleteTab(id: string): Promise<void> {
    this.cancelSave(id);
    try {
      await firstValueFrom(this.api.delete(`library/notebook/${id}/`));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 404)) {
        this.errors$.next(this.message(error, 'No se pudo borrar la pestaña.'));
        return;
      }
    }
    const tabs = this.tabs$.value;
    const index = tabs.findIndex(tab => tab.id === id);
    const rest = tabs.filter(tab => tab.id !== id);
    this.cache.delete(id);
    this.clearDraft(id);
    this.tabs$.next(rest);
    if (this.activeId$.value === id) this.activeId$.next(rest[Math.min(index, rest.length - 1)]?.id || null);
  }

  reorder(ids: string[]): void {
    const byId = new Map(this.tabs$.value.map(tab => [tab.id, tab]));
    this.tabs$.next(ids.map((id, position) => ({ ...byId.get(id)!, position })).filter(tab => !!tab.id));
    this.api.post<NotebookTabMeta[]>('library/notebook/reorder/', { ids }).subscribe({
      error: () => this.errors$.next('No se pudo guardar el orden de las pestañas.'),
    });
  }

  digest(inventoryId: string): Observable<NotebookDigest> {
    return this.api.get<NotebookDigest>(`library/inventory/${inventoryId}/notebook-digest/`);
  }

  // ── Guardado ──────────────────────────────────────────────────────────────

  /** El editor cambió algo: se guarda solo al dejar de escribir. */
  update(id: string, fields: Editable, immediate = false): void {
    const tab = this.cache.get(id);
    if (!tab) return;
    Object.assign(tab, fields);
    if (fields.title !== undefined) this.patchMeta(id, { title: fields.title });
    this.dirty.set(id, { ...this.dirty.get(id), ...fields });
    if (this.conflicts$.value[id]) return; // se envía cuando el usuario elija qué versión conservar
    this.setState(id, 'pending');
    this.schedule(id, immediate ? 0 : SAVE_DELAY_MS);
  }

  flushAll(): void {
    for (const id of Array.from(this.dirty.keys())) this.schedule(id, 0);
  }

  /** Conflicto: conservar lo de este dispositivo (se guarda encima) o tomar la otra versión. */
  resolveConflict(id: string, keep: 'mine' | 'theirs'): void {
    const server = this.conflicts$.value[id];
    const tab = this.cache.get(id);
    if (!server || !tab) return;
    const { [id]: _, ...rest } = this.conflicts$.value;
    this.conflicts$.next(rest);
    if (keep === 'theirs') {
      this.cancelSave(id);
      this.clearDraft(id);
      Object.assign(tab, server);
      this.patchMeta(id, { title: server.title, revision: server.revision });
      this.setState(id, 'saved');
      this.replaced$.next(tab);
      return;
    }
    tab.revision = server.revision;
    this.dirty.set(id, { title: tab.title, content: tab.content, drawing: tab.drawing });
    this.setState(id, 'pending');
    this.schedule(id, 0);
  }

  private schedule(id: string, delay: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.flush(id), delay));
  }

  private cancelSave(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.dirty.delete(id);
  }

  private flush(id: string): void {
    this.timers.delete(id);
    const fields = this.dirty.get(id);
    const tab = this.cache.get(id);
    if (!fields || !tab || this.inFlight.has(id)) return; // si hay un envío en curso, sigue al terminar
    this.dirty.delete(id);
    this.writeDraft(id, fields);
    this.inFlight.add(id);
    this.setState(id, 'saving');
    this.api.patch<NotebookTab>(`library/notebook/${id}/`, { ...fields, base_revision: tab.revision }).subscribe({
      next: saved => {
        this.inFlight.delete(id);
        tab.revision = saved.revision;
        tab.updated_at = saved.updated_at;
        this.patchMeta(id, { title: saved.title, revision: saved.revision, updated_at: saved.updated_at });
        this.clearDraft(id);
        if (this.dirty.has(id)) {
          this.writeDraft(id); // lo escrito mientras se enviaba, ahora sobre la revisión nueva
          this.schedule(id, 0);
        } else {
          this.setState(id, 'saved');
        }
      },
      error: (error: HttpErrorResponse) => {
        this.inFlight.delete(id);
        this.dirty.set(id, { ...fields, ...this.dirty.get(id) });
        if (error.status === 409 && error.error?.tab) {
          this.conflicts$.next({ ...this.conflicts$.value, [id]: error.error.tab });
          this.setState(id, 'conflict');
        } else if (error.status === 400 || error.status === 403) {
          this.setState(id, 'error');
          this.errors$.next(this.message(error, 'No se pudo guardar esta pestaña.'));
        } else if (error.status === 404) {
          this.cancelSave(id);
          this.clearDraft(id);
        } else {
          this.setState(id, 'offline');
          this.schedule(id, RETRY_MS);
        }
      },
    });
  }

  private setState(id: string, state: NotebookSaveState): void {
    this.zone.run(() => this.saveStates$.next({ ...this.saveStates$.value, [id]: state }));
  }

  // ── Borradores locales (solo hasta que el servidor confirma) ─────────────

  private applyDraft(tab: NotebookTab): void {
    const draft = this.drafts()[tab.id];
    if (!draft) return;
    if (draft.base === tab.revision) {
      this.update(tab.id, draft.fields);
    } else {
      // El servidor avanzó mientras esto quedaba sin enviar: que el usuario elija.
      const server = { ...tab };
      Object.assign(tab, draft.fields);
      this.dirty.set(tab.id, draft.fields);
      this.conflicts$.next({ ...this.conflicts$.value, [tab.id]: server });
      this.setState(tab.id, 'conflict');
    }
  }

  private writeDraft(id: string, fields?: Editable): void {
    const tab = this.cache.get(id);
    const pending = { ...fields, ...this.dirty.get(id) };
    if (!tab || !Object.keys(pending).length) return;
    const drafts = this.drafts();
    drafts[id] = { fields: { ...drafts[id]?.fields, ...pending }, base: drafts[id]?.base ?? tab.revision };
    this.writeJson('literatus_notebook_drafts', drafts);
  }

  private clearDraft(id: string): void {
    const drafts = this.drafts();
    if (!drafts[id]) return;
    delete drafts[id];
    this.writeJson('literatus_notebook_drafts', drafts);
  }

  private drafts(): Record<string, Draft> {
    return this.readJson<Record<string, Draft>>('literatus_notebook_drafts') || {};
  }

  // ── Lector ────────────────────────────────────────────────────────────────

  /** El lector abierto se registra para que "Ir al pasaje" salte sin recargar el libro. */
  registerReader(inventoryId: string, jump: ReaderJump): () => void {
    this.readers.set(inventoryId, jump);
    this.currentReader = inventoryId;
    return () => {
      if (this.readers.get(inventoryId) === jump) this.readers.delete(inventoryId);
      if (this.currentReader === inventoryId) this.currentReader = null;
    };
  }

  goToPassage(inventoryId: string, chapterId: string, word: number, lastWord?: number): void {
    if (window.matchMedia('(max-width: 640px)').matches) this.minimize(); // en el celular tapa el libro
    const jump = this.readers.get(inventoryId);
    if (jump) {
      jump(chapterId, word, lastWord);
      return;
    }
    const range = lastWord !== undefined && lastWord > word ? `${word}-${lastWord}` : `${word}`;
    this.router.navigate(['/reader', inventoryId], { queryParams: { ir: `${chapterId}:${range}` } });
  }

  // ── Preferencias y estado de la ventana ───────────────────────────────────

  setPrefs(changes: Partial<NotebookPrefs>): void {
    const prefs = { ...this.prefs$.value, ...changes };
    prefs.size = Math.min(Math.max(Math.round(prefs.size), 12), 28);
    prefs.zoom = Math.min(Math.max(Math.round(prefs.zoom / 10) * 10, 50), 200);
    this.prefs$.next(prefs);
    this.writeJson('literatus_notebook_prefs', prefs);
  }

  readGeometry(): unknown {
    return this.readJson('literatus_notebook_window');
  }

  saveGeometry(geometry: NotebookGeometry): void {
    this.writeJson('literatus_notebook_window', geometry);
  }

  private readPrefs(): NotebookPrefs {
    return { ...DEFAULT_PREFS, ...(this.readJson<Partial<NotebookPrefs>>('literatus_notebook_prefs') || {}) };
  }

  private persistState(): void {
    this.writeJson('literatus_notebook_state', { visibility: this.visibility$.value, active: this.activeId$.value });
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private remember(tab: NotebookTab): void {
    if (!this.cache.has(tab.id)) {
      this.cache.set(tab.id, tab);
      this.applyDraft(tab);
    }
    const tabs = this.tabs$.value;
    const { content: _content, drawing: _drawing, ...meta } = tab;
    this.tabs$.next(tabs.some(t => t.id === tab.id)
      ? tabs.map(t => (t.id === tab.id ? { ...t, ...meta } : t))
      : [...tabs, meta]);
  }

  private patchMeta(id: string, changes: Partial<NotebookTabMeta>): void {
    this.tabs$.next(this.tabs$.value.map(tab => (tab.id === id ? { ...tab, ...changes } : tab)));
  }

  private message(error: unknown, fallback: string): string {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    if (typeof body?.detail === 'string') return body.detail;
    const first = body && typeof body === 'object' ? Object.values(body)[0] : null;
    return Array.isArray(first) && typeof first[0] === 'string' ? first[0] : fallback;
  }

  private readJson<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(userStorageKey(key)) || 'null');
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    try {
      localStorage.setItem(userStorageKey(key), JSON.stringify(value));
    } catch {
      // sin espacio o almacenamiento bloqueado: el guardado en la cuenta sigue funcionando
    }
  }
}
