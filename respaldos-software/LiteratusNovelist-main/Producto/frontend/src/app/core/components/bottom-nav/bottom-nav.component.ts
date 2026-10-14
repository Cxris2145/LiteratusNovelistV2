import { Component, HostListener, Input, OnDestroy, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { NAV_ITEMS, NavItem } from '../main-nav/nav-items';

interface BottomItem extends NavItem {
  /** Etiqueta corta para la barra (el ancho de un celular da para ~10 letras). */
  short?: string;
}

const PRIMARY: Record<string, string> = {
  '/catalog': 'Explorar',
  '/library': 'Biblioteca',
  '/tavern': 'Taberna',
  '/characters': 'Personajes',
};

/**
 * Barra inferior del celular: las cuatro secciones más usadas a mano del pulgar y "Más"
 * con el resto. Reemplaza en pantallas angostas a la fila de secciones del encabezado,
 * donde solo se veían 4 de 10 sin pista de que había más.
 */
@Component({
  selector: 'app-bottom-nav',
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.css',
})
export class BottomNavComponent implements OnDestroy {
  private readonly router = inject(Router);

  @Input() rewardReady: boolean | null = false;

  readonly primary: BottomItem[] = Object.keys(PRIMARY)
    .map(link => NAV_ITEMS.find(item => item.link === link)!)
    .map(item => ({ ...item, short: PRIMARY[item.link] }));
  readonly more: BottomItem[] = [
    ...NAV_ITEMS.filter(item => !PRIMARY[item.link]),
    { label: 'Planes', icon: 'workspace_premium', link: '/planes', match: ['/planes'] },
    // En el celular estos dos salen del encabezado (no cabían) y viven aquí.
    { label: 'Favoritos', icon: 'favorite', link: '/favorites', match: ['/favorites'] },
    { label: 'Carrito', icon: 'shopping_cart', link: '/cart', match: ['/cart', '/checkout'] },
  ];

  isMoreOpen = false;
  private url = this.router.url;
  private readonly sub: Subscription = this.router.events
    .pipe(filter(e => e instanceof NavigationEnd))
    .subscribe(e => {
      this.url = (e as NavigationEnd).urlAfterRedirects;
      this.isMoreOpen = false;
    });

  isActive(item: NavItem): boolean {
    return item.match.some(prefix => this.url.startsWith(prefix));
  }

  get isMoreActive(): boolean {
    return this.more.some(item => this.isActive(item));
  }

  toggleMore(): void {
    this.isMoreOpen = !this.isMoreOpen;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isMoreOpen = false;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
