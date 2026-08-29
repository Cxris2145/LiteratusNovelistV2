import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-author-editor',
  templateUrl: './author-editor.component.html',
  styleUrls: ['./author-editor.component.css']
})
export class AuthorEditorComponent implements OnInit {
  authorId: string | null = null;
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
  loading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bookService: DashboardBooksService
  ) {}

  ngOnInit(): void {
    this.authorId = this.route.snapshot.paramMap.get('id');
    if (this.authorId) {
      this.loadAuthor();
    }
  }

  loadAuthor(): void {
    this.loading = true;
    this.bookService.getAuthorDetail(this.authorId!).subscribe({
      next: (data) => {
        this.newAuthor = { 
          full_name: data.full_name, 
          bio: data.bio || '',
          nationality: data.nationality || '',
          birth_year: data.birth_year,
          death_year: data.death_year,
          wikipedia_url: data.wikipedia_url || '',
          themes: data.themes || ''
        };
        this.photoPreview = data.photo;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        alert('Error al cargar autor');
        this.router.navigate(['/dashboard/authors']);
      }
    });
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
    if (this.authorId) data.id = this.authorId;

    this.bookService.saveFullAuthor(data, this.authorPhoto || undefined).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard/authors']);
      },
      error: (err) => {
        this.loading = false;
        alert('Error al guardar: ' + (err.error?.error || 'Desconocido'));
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard/authors']);
  }
}
