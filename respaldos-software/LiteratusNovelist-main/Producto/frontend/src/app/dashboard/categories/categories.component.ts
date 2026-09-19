import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-categories-admin',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.css']
})
export class CategoriesAdminComponent implements OnInit {
  genres: any[] = [];
  filteredGenres: any[] = [];
  loading = true;
  searchQuery = '';
  showModal = false;
  editingGenre: any = null;
  selectedFile: File | null = null;
  formName = '';
  formDescription = '';
  saving = false;
  toastMessage = '';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadGenres();
  }

  loadGenres(): void {
    this.loading = true;
    this.dashboardService.getAdminGenres().subscribe({
      next: (data) => {
        this.genres = data;
        this.filteredGenres = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  filterGenres(): void {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredGenres = this.genres;
      return;
    }
    this.filteredGenres = this.genres.filter(g =>
      g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q))
    );
  }

  openCreateModal(): void {
    this.editingGenre = null;
    this.formName = '';
    this.formDescription = '';
    this.selectedFile = null;
    this.showModal = true;
  }

  openEditModal(genre: any): void {
    this.editingGenre = genre;
    this.formName = genre.name;
    this.formDescription = genre.description || '';
    this.selectedFile = null;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingGenre = null;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  save(): void {
    if (!this.formName.trim()) {
      alert('El nombre de la categoría es obligatorio.');
      return;
    }
    this.saving = true;
    const payload = {
      name: this.formName.trim(),
      description: this.formDescription.trim()
    };

    this.dashboardService.saveGenre(payload, this.selectedFile || undefined, this.editingGenre?.id).subscribe({
      next: (res) => {
        this.saving = false;
        this.closeModal();
        this.toastMessage = res.message || 'Categoría guardada exitosamente.';
        this.loadGenres();
        setTimeout(() => this.toastMessage = '', 4000);
      },
      error: (err) => {
        this.saving = false;
        alert(err.error?.error || 'Error al guardar la categoría.');
      }
    });
  }

  delete(genre: any): void {
    if (!confirm(`¿Eliminar la categoría "${genre.name}"? Los libros asociados no se borrarán.`)) return;
    this.dashboardService.deleteGenre(genre.id).subscribe({
      next: (res) => {
        this.toastMessage = res.message || 'Categoría eliminada.';
        this.genres = this.genres.filter(g => g.id !== genre.id);
        this.filterGenres();
        setTimeout(() => this.toastMessage = '', 4000);
      },
      error: () => alert('Error al eliminar la categoría.')
    });
  }
}
