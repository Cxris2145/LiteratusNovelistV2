import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-character-hub',
  templateUrl: './character-hub.component.html',
  styleUrls: ['./character-hub.component.css']
})
export class CharacterHubComponent implements OnInit, OnDestroy {
  chatService = inject(ChatService);
  api = inject(ApiService);
  router = inject(Router);
  auth = inject(AuthService);

  // Datos para las secciones
  allCharacters: any[] = [];
  heroCharacters: any[] = []; // Los del carrusel principal
  featuredCharacters: any[] = []; // Más populares
  recentCharacters: any[] = []; // Últimas sesiones
  filteredCharacters: any[] = []; // Resultado de búsqueda

  isLoading = true;
  searchQuery = '';
  isSearching = false;

  // Control del Carrusel Hero
  currentHeroIndex = 0;
  private carouselSub?: Subscription;

  // Skeleton
  skeletonArray = Array(6).fill(0);

  ngOnInit() {
    this.loadAllData();
    this.startHeroCarousel();
  }

  ngOnDestroy() {
    if (this.carouselSub) this.carouselSub.unsubscribe();
  }

  loadAllData() {
    this.isLoading = true;
    
    // 1. Cargar Destacados (Popularidad)
    this.chatService.getGlobalAvatars('', 'popularity').subscribe({
      next: (data) => {
        this.featuredCharacters = data.slice(0, 12);
        this.allCharacters = data;
        // Seleccionar 5 aleatorios para el Hero Carousel
        this.heroCharacters = [...data].sort(() => 0.5 - Math.random()).slice(0, 5);
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });

    // 2. Cargar Recientes (Backend nuevo endpoint)
    this.chatService.getRecentAvatars().subscribe({
      next: (data) => this.recentCharacters = data,
      error: (err) => console.warn("No se pudieron cargar recientes", err)
    });
  }

  startHeroCarousel() {
    this.carouselSub = interval(5000).subscribe(() => {
      if (this.heroCharacters.length > 0) {
        this.currentHeroIndex = (this.currentHeroIndex + 1) % this.heroCharacters.length;
      }
    });
  }

  setHeroIndex(idx: number) {
    this.currentHeroIndex = idx;
    // Reiniciar intervalo si el usuario interactúa
    if (this.carouselSub) {
      this.carouselSub.unsubscribe();
      this.startHeroCarousel();
    }
  }

  onSearchChange() {
    if (!this.searchQuery.trim()) {
      this.isSearching = false;
      this.filteredCharacters = [];
      return;
    }

    this.isSearching = true;
    this.isLoading = true;
    this.chatService.getGlobalAvatars(this.searchQuery).subscribe({
      next: (data) => {
        this.filteredCharacters = data;
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });
  }

  openChat(character: any) {
    if (!character) return;

    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/demo-chat', character.id]);
      return;
    }

    if (!character.book_slug) {
      this.router.navigate(['/demo-chat', character.id]);
      return;
    }

    // Verificar si el usuario ya posee el libro
    this.api.get<any>(`library/inventory/check/?slug=${character.book_slug}`).subscribe({
      next: (res: any) => {
        if (res.owned) {
          // Si lo tiene, ir al lector con el personaje pre-seleccionado
          this.router.navigate(['/reader', res.inventory_id], { 
            queryParams: { chatWith: character.id } 
          });
        } else {
          // Si no lo tiene, ir a la vista del libro (sinopsis)
          this.router.navigate(['/book', character.book_slug]);
        }
      },
      error: (err: any) => {
        console.error("Error verificando propiedad", err);
        // Fallback: ir a la sinopsis
        this.router.navigate(['/book', character.book_slug]);
      }
    });
  }
}
