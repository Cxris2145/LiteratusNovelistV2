import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

export interface GenreItem {
  id: string;
  name: string;
  slug: string;
  cover_image?: string;
}

export interface AuthorItem {
  id: string;
  full_name: string;
  slug: string;
  photo?: string;
  nationality?: string;
}

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css']
})
export class OnboardingComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private notification = inject(NotificationService);

  // Stepper: 1 = Rol, 2 = Preferencias
  currentStep: 1 | 2 = 1;

  // Paso 1: Rol
  selectedRole: 'reader' | 'author' | null = null;

  // Paso 2: Géneros y Autores
  availableGenres: GenreItem[] = [];
  selectedGenres: GenreItem[] = [];
  isLoadingGenres = false;

  // Autores
  authorSearchTerm = '';
  authorSearchResults: AuthorItem[] = [];
  selectedAuthors: AuthorItem[] = [];
  popularAuthors: AuthorItem[] = [];
  isSearchingAuthors = false;
  private searchSubject = new Subject<string>();

  // Estados de carga y error
  isSubmitting = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadGenres();
    this.loadPopularAuthors();
    this.setupAuthorSearch();
  }

  // --- Navegación de Pasos ---
  goToStep2(): void {
    if (!this.selectedRole) {
      this.errorMessage = 'Debes seleccionar tu vocación (Lector o Autor) para continuar.';
      return;
    }
    this.errorMessage = '';
    this.currentStep = 2;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToStep1(): void {
    this.errorMessage = '';
    this.currentStep = 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Selección de Rol ---
  selectRole(role: 'reader' | 'author'): void {
    this.selectedRole = role;
    this.errorMessage = '';
  }

  // --- Carga de Géneros ---
  loadGenres(): void {
    this.isLoadingGenres = true;
    this.http.get<any>(`${environment.apiUrl}catalog/genres/`).subscribe({
      next: (res) => {
        const results = Array.isArray(res) ? res : (res?.results || []);
        this.availableGenres = results.map((g: any) => ({
          id: g.id || g.slug,
          name: g.name,
          slug: g.slug,
          cover_image: g.cover_image
        }));
        this.isLoadingGenres = false;
      },
      error: () => {
        this.isLoadingGenres = false;
        // Fallback robusto con géneros clave
        this.availableGenres = [
          { id: 'ficcion-clasica', name: 'Novela clásica', slug: 'ficcion-clasica' },
          { id: 'accion-y-aventura', name: 'Aventura y viajes', slug: 'accion-y-aventura' },
          { id: 'ciencia-ficcion', name: 'Ciencia ficción y fantasía', slug: 'ciencia-ficcion' },
          { id: 'terror', name: 'Terror y misterio', slug: 'terror' },
          { id: 'romantica', name: 'Romántica', slug: 'romantica' },
          { id: 'ficcion-historica', name: 'Novela histórica', slug: 'ficcion-historica' },
          { id: 'cuentos', name: 'Cuentos e infantil', slug: 'cuentos' },
          { id: 'teatro', name: 'Teatro', slug: 'teatro' },
          { id: 'poesia', name: 'Poesía y épica', slug: 'poesia' },
          { id: 'filosofia', name: 'Filosofía y ensayo', slug: 'filosofia' },
        ];
      }
    });
  }

  toggleGenre(genre: GenreItem): void {
    const index = this.selectedGenres.findIndex(g => g.id === genre.id || g.slug === genre.slug);
    if (index > -1) {
      this.selectedGenres.splice(index, 1);
    } else {
      this.selectedGenres.push(genre);
    }
  }

  isGenreSelected(genre: GenreItem): boolean {
    return this.selectedGenres.some(g => g.id === genre.id || g.slug === genre.slug);
  }

  // --- Carga y Búsqueda de Autores ---
  loadPopularAuthors(): void {
    this.http.get<any>(`${environment.apiUrl}catalog/authors/?page_size=8`).subscribe({
      next: (res) => {
        const results = Array.isArray(res) ? res : (res?.results || []);
        this.popularAuthors = results.map((a: any) => ({
          id: a.id,
          full_name: a.full_name || a.name,
          slug: a.slug,
          photo: a.photo,
          nationality: a.nationality
        }));
      },
      error: () => {}
    });
  }

  setupAuthorSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((term) => {
        if (!term || term.trim().length < 2) {
          this.isSearchingAuthors = false;
          return of([]);
        }
        this.isSearchingAuthors = true;
        return this.http.get<any>(`${environment.apiUrl}catalog/authors/?search=${encodeURIComponent(term.trim())}`).pipe(
          catchError(() => of([]))
        );
      })
    ).subscribe((res) => {
      this.isSearchingAuthors = false;
      const results = Array.isArray(res) ? res : (res?.results || []);
      this.authorSearchResults = results.map((a: any) => ({
        id: a.id,
        full_name: a.full_name || a.name,
        slug: a.slug,
        photo: a.photo,
        nationality: a.nationality
      })).filter((a: AuthorItem) => !this.isAuthorSelected(a));
    });
  }

  onAuthorSearchInput(event: any): void {
    const val = event.target?.value || '';
    this.authorSearchTerm = val;
    this.searchSubject.next(val);
  }

  selectAuthor(author: AuthorItem): void {
    if (!this.isAuthorSelected(author)) {
      this.selectedAuthors.push(author);
    }
    this.authorSearchTerm = '';
    this.authorSearchResults = [];
  }

  removeAuthor(author: AuthorItem): void {
    this.selectedAuthors = this.selectedAuthors.filter(a => a.id !== author.id);
  }

  isAuthorSelected(author: AuthorItem): boolean {
    return this.selectedAuthors.some(a => a.id === author.id);
  }

  // --- Validación del Formulario ---
  get isStep2Valid(): boolean {
    return this.selectedGenres.length >= 3;
  }

  // --- Envío Final al Backend ---
  completeOnboarding(): void {
    if (!this.selectedRole) {
      this.currentStep = 1;
      this.errorMessage = 'Por favor selecciona tu rol.';
      return;
    }

    if (this.selectedGenres.length < 3) {
      this.errorMessage = 'Debes seleccionar al menos 3 géneros literarios preferidos.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const payload = {
      role: this.selectedRole,
      favorite_genres: this.selectedGenres.map(g => g.id),
      followed_authors: this.selectedAuthors.map(a => a.id)
    };

    this.http.post<any>(`${environment.apiUrl}users/onboarding/`, payload).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        // Invalida la caché de recomendaciones para que 'Explorar' cargue inmediatamente las preferencias
        this.api.invalidate('catalog/books/recommendations');
        // Actualizar el estado de usuario en AuthService (Signals y LocalStorage)
        this.auth.updateUserOnboarding(this.selectedRole!);
        
        const roleLabel = this.selectedRole === 'author' ? 'Autor' : 'Lector';
        this.notification.success(
          `¡Bienvenido a Literatus Novelist como ${roleLabel}! Tu biblioteca y preferencias han sido configuradas.`,
          'Configuración Completa'
        );

        // Si es autor, se le ofrece descubrir la plataforma o ir directo a publicar
        if (this.selectedRole === 'author') {
          this.router.navigate(['/home']);
        } else {
          this.router.navigate(['/home']);
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.message || 'Ocurrió un error al guardar tus preferencias. Por favor intenta nuevamente.';
        this.notification.error(this.errorMessage, 'Error');
      }
    });
  }
}
