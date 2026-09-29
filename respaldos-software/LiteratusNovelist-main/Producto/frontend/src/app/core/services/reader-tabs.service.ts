import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { AuthService } from './auth.service';

/** Un libro abierto en el lector, mostrado como pestaña (igual que en un navegador). */
export interface ReaderTab {
  /** id del inventario: la ruta del lector es /reader/<id>. */
  id: string;
  title: string;
  author?: string;
  cover?: string | null;
}

/**
 * Pestañas de libros abiertos en el lector. Se guardan en localStorage por usuario:
 * cambiar de pestaña abre ese libro donde quedó (el progreso lo guarda el lector).
 */
@Injectable({ providedIn: 'root' })
export class ReaderTabsService {
  private auth = inject(AuthService);

  private readonly MAX_TABS = 8;
  private tabsSubject = new BehaviorSubject<ReaderTab[]>([]);
  readonly tabs$ = this.tabsSubject.asObservable();
  /** Clave de localStorage leída por última vez (cambia al entrar otra cuenta). */
  private loadedKey: string | null = null;

  get tabs(): ReaderTab[] {
    this.sync();
    return this.tabsSubject.value;
  }

  /** Relee las pestañas si cambió el usuario desde la última lectura. */
  sync(): void {
    const key = this.storageKey();
    if (key !== this.loadedKey) {
      this.loadedKey = key;
      this.tabsSubject.next(this.read());
    }
  }

  /** Abre (o actualiza) la pestaña de un libro. Si hay demasiadas, cierra la más antigua. */
  open(tab: ReaderTab): void {
    const tabs = this.tabs.slice();
    const index = tabs.findIndex(t => t.id === tab.id);
    if (index >= 0) {
      tabs[index] = { ...tabs[index], ...tab };
    } else {
      tabs.push(tab);
      while (tabs.length > this.MAX_TABS) tabs.shift();
    }
    this.save(tabs);
  }

  /**
   * Cierra una pestaña. Devuelve la pestaña que debería quedar activa si se cerró la
   * actual (la de la derecha, o si no la de la izquierda), o null si no quedan.
   */
  close(id: string): ReaderTab | null {
    const tabs = this.tabs.slice();
    const index = tabs.findIndex(t => t.id === id);
    if (index < 0) return null;
    tabs.splice(index, 1);
    this.save(tabs);
    return tabs[index] || tabs[index - 1] || null;
  }

  private storageKey(): string | null {
    const user = this.auth.currentUser();
    return user ? `reader-open-tabs:${user.id}` : null;
  }

  private read(): ReaderTab[] {
    const key = this.storageKey();
    if (!key) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.filter(t => t && typeof t.id === 'string') : [];
    } catch {
      return [];
    }
  }

  private save(tabs: ReaderTab[]): void {
    this.tabsSubject.next(tabs);
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(tabs));
    } catch {
      // Sin localStorage (modo privado) las pestañas duran solo esta sesión.
    }
  }
}
