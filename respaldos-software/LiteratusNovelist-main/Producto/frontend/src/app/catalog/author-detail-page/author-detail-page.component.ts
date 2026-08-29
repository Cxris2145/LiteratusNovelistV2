import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-author-detail-page',
  templateUrl: './author-detail-page.component.html',
  styleUrls: ['./author-detail-page.component.css']
})
export class AuthorDetailPageComponent implements OnInit {
  author: any = null;
  isLoading = true;
  errorMsg = '';

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      if (slug) {
        this.loadAuthorDetails(slug);
      }
    });
  }

  loadAuthorDetails(slug: string): void {
    this.isLoading = true;
    this.api.get<any>(`catalog/authors/${slug}/`).subscribe({
      next: (data) => {
        this.author = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading author details:', err);
        this.errorMsg = 'No se pudo cargar la información del autor.';
        this.isLoading = false;
      }
    });
  }

  goToBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }
}
