import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-authors',
  templateUrl: './authors.component.html',
  styleUrls: ['./authors.component.css']
})
export class AuthorsComponent implements OnInit {
  authors: any[] = [];
  filteredAuthors: any[] = [];
  newAuthor: any = { 
    full_name: '', 
    bio: '',
    nationality: '',
    birth_year: null,
    death_year: null,
    wikipedia_url: '',
    themes: ''
  };
  authorPhoto: File | null = null;
  photoPreview: string | null = null;
  editingId: string | null = null;
  previewAuthor: any = null;
  loading = false;
    

  constructor(
    private bookService: DashboardBooksService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadAuthors();
  }

  loadAuthors(): void {
    this.loading = true;
    this.bookService.getAuthors().subscribe({
      next: (data) => {
        this.authors = data;
        this.filteredAuthors = data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  filterAuthors(event: Event): void {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    this.filteredAuthors = this.authors.filter(a => 
      a.full_name.toLowerCase().includes(query) || 
      (a.nationality && a.nationality.toLowerCase().includes(query))
    );
  }

  onPhotoSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.authorPhoto = file;
      const reader = new FileReader();
      reader.onload = () => this.photoPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  saveAuthor(): void {
    if (!this.newAuthor.full_name) return;

    this.loading = true;
    const data = { ...this.newAuthor };
    if (this.editingId) data.id = this.editingId;

    this.bookService.saveFullAuthor(data, this.authorPhoto || undefined).subscribe({
      next: () => {
        this.loadAuthors();
        this.resetForm();
        alert('Autor guardado con éxito');
      },
      error: (err) => {
        this.loading = false;
        alert('Error al guardar: ' + (err.error?.error || 'Desconocido'));
      }
    });
  }

  openPreview(authorId: string): void {
    this.loading = true;
    this.bookService.getAuthorDetail(authorId).subscribe({
      next: (data) => {
        this.previewAuthor = data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }
    

  editAuthor(author: any): void {
    this.editingId = author.id;
    this.newAuthor = { 
      full_name: author.full_name, 
      bio: author.bio || '',
      nationality: author.nationality || '',
      birth_year: author.birth_year,
      death_year: author.death_year,
      wikipedia_url: author.wikipedia_url || '',
      themes: author.themes || ''
    };
    this.photoPreview = author.photo;
    this.authorPhoto = null; // Fix: reset photo when editing another author
  }

  deleteAuthor(id: string): void {
    if (confirm('¿Eliminar este autor? Se quitará de todos sus libros.')) {
      this.bookService.deleteAuthor(id).subscribe(() => this.loadAuthors());
    }
  }

  resetForm(): void {
    this.editingId = null;
    this.newAuthor = { 
      full_name: '', 
      bio: '',
      nationality: '',
      birth_year: null,
      death_year: null,
      wikipedia_url: '',
      themes: ''
    };
    this.authorPhoto = null;
    this.photoPreview = null;
  }
    

}
