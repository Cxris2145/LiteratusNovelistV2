import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApiService } from '../../core/services/api.service';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-dashboard-layout',
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.css']
})
export class DashboardLayoutComponent implements OnInit {
  sidebarCollapsed = false;
  mobileSidebarOpen = false;
  pageTitle = 'Visión General';
  currentDate = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  stats: any = null;
  cachedBooks: any[] = [];
  cachedAuthors: any[] = [];
  topbarSearchQuery = '';
  searchResults: any[] = [];

  private pageTitles: Record<string, string> = {
    '/dashboard/overview': 'Visión General',
    '/dashboard/reports': 'Centro de Reportes',
    '/dashboard/books': 'Biblioteca de Libros',
    '/dashboard/books/new': 'Nuevo Libro',
    '/dashboard/curation': 'Curaduría & Aprobaciones',
    '/dashboard/authors': 'Gestión de Autores',
    '/dashboard/authors/new': 'Nuevo Autor',
    '/dashboard/avatars': 'Personajes IA',
    '/dashboard/categories': 'Categorías & Géneros',
    '/dashboard/users': 'Usuarios & Roles',
    '/dashboard/gamification': 'Centro de Gamificación',
    '/dashboard/ink': 'Economía de Tinta',
    '/dashboard/transactions': 'Ventas & Pagos Webpay',
    '/dashboard/ai-chats': 'Uso de IA & Personajes',
    '/dashboard/audit': 'Registro de Auditoría',
    '/dashboard/settings': 'Configuración General',
  };

  themes = ['default', 'neon', 'light-gallery'];
  currentTheme = 'default';

  constructor(
    private router: Router, 
    private auth: AuthService, 
    private settingsService: SettingsService,
    private api: ApiService,
    private dashboardService: DashboardBooksService
  ) {}

  get currentUserProfile() {
    return this.auth.currentUser();
  }

  ngOnInit(): void {
    this.updateTitleFromUrl(this.router.url);

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.updateTitleFromUrl(e.urlAfterRedirects);
      this.mobileSidebarOpen = false;
      this.searchResults = [];
      this.topbarSearchQuery = '';
    });

    this.settingsService.currentTheme$.subscribe(theme => {
      this.currentTheme = theme;
    });

    this.loadStats();
    this.preloadSearchData();
  }

  loadStats(): void {
    this.api.get<any>('dashboard/stats/').subscribe({
      next: (data) => {
        this.stats = data;
      },
      error: () => {}
    });
  }

  preloadSearchData(): void {
    this.dashboardService.getBooks().subscribe({
      next: (books) => this.cachedBooks = books || [],
      error: () => {}
    });
    this.dashboardService.getAuthors().subscribe({
      next: (authors) => this.cachedAuthors = authors || [],
      error: () => {}
    });
  }

  onTopbarSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value.toLowerCase().trim();
    if (!q || q.length < 2) {
      this.searchResults = [];
      return;
    }

    const results: any[] = [];

    // Secciones del sistema
    const modules = [
      { title: 'Visión General', route: '/dashboard/overview', type: 'Módulo', icon: 'space_dashboard' },
      { title: 'Biblioteca de Libros', route: '/dashboard/books', type: 'Módulo', icon: 'auto_stories' },
      { title: 'Subir Nuevo Libro', route: '/dashboard/books/new', type: 'Acción', icon: 'post_add' },
      { title: 'Curaduría & Aprobaciones', route: '/dashboard/curation', type: 'Módulo', icon: 'verified' },
      { title: 'Gestión de Autores', route: '/dashboard/authors', type: 'Módulo', icon: 'history_edu' },
      { title: 'Personajes IA', route: '/dashboard/avatars', type: 'Módulo', icon: 'face' },
      { title: 'Categorías & Géneros', route: '/dashboard/categories', type: 'Módulo', icon: 'category' },
      { title: 'Usuarios & Roles', route: '/dashboard/users', type: 'Módulo', icon: 'group' },
      { title: 'Gamificación & Logros', route: '/dashboard/gamification', type: 'Módulo', icon: 'military_tech' },
      { title: 'Economía de Tinta', route: '/dashboard/ink', type: 'Módulo', icon: 'water_drop' },
      { title: 'Ventas & Transacciones', route: '/dashboard/transactions', type: 'Módulo', icon: 'payments' },
      { title: 'Métricas de IA', route: '/dashboard/ai-chats', type: 'Módulo', icon: 'psychology' },
      { title: 'Registro de Auditoría', route: '/dashboard/audit', type: 'Módulo', icon: 'history' },
      { title: 'Centro de Reportes PDF/CSV', route: '/dashboard/reports', type: 'Módulo', icon: 'analytics' },
      { title: 'Configuración General', route: '/dashboard/settings', type: 'Módulo', icon: 'settings' },
    ];

    for (const m of modules) {
      if (m.title.toLowerCase().includes(q)) {
        results.push({ title: m.title, subtitle: 'Acceso directo', route: m.route, type: m.type, icon: m.icon });
      }
    }

    // Libros coincidentes
    const matchingBooks = this.cachedBooks.filter(b => b.title?.toLowerCase().includes(q)).slice(0, 5);
    for (const b of matchingBooks) {
      results.push({
        title: b.title,
        subtitle: (b.authors || []).join(', ') || 'Libro del catálogo',
        route: `/dashboard/books/${b.id}/edit`,
        type: 'Libro',
        icon: 'book'
      });
    }

    // Autores coincidentes
    const matchingAuthors = this.cachedAuthors.filter(a => a.full_name?.toLowerCase().includes(q)).slice(0, 3);
    for (const a of matchingAuthors) {
      results.push({
        title: a.full_name,
        subtitle: `${a.books_count || 0} libros asociados`,
        route: '/dashboard/authors',
        type: 'Autor',
        icon: 'person'
      });
    }

    this.searchResults = results.slice(0, 8);
  }

  selectSearchResult(res: any): void {
    this.searchResults = [];
    this.topbarSearchQuery = '';
    this.router.navigateByUrl(res.route);
  }

  private updateTitleFromUrl(url: string): void {
    const cleanUrl = url.split('?')[0];
    for (const [route, title] of Object.entries(this.pageTitles)) {
      if (cleanUrl === route || cleanUrl.startsWith(route + '/')) {
        this.pageTitle = title;
        return;
      }
    }
    this.pageTitle = 'Centro de Control Nexus';
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen = !this.mobileSidebarOpen;
  }

  setThemeDirect(theme: string): void {
    this.settingsService.updateSettings({ theme }).subscribe();
  }

  logout(): void {
    this.auth.clearTokens();
    this.router.navigate(['/']);
  }
}
