import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-author-detail-page',
  templateUrl: './author-detail-page.component.html',
  styleUrls: ['./author-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthorDetailPageComponent implements OnInit, OnDestroy {
  author: any = null;
  isLoading = true;
  errorMsg = '';

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        const slug = params.get('slug');
        if (slug) {
          this.loadAuthorDetails(slug);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadAuthorDetails(slug: string): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.api.get<any>(`catalog/authors/${slug}/`).subscribe({
      next: (data) => {
        this.author = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading author details:', err);
        this.errorMsg = 'No se pudo cargar la información del autor.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  goToBook(slug: string): void {
    this.router.navigate(['/book', slug]);
  }

  trackByBookSlug(index: number, book: any): any {
    return book.slug ?? book.id ?? index;
  }

  trackByGenreName(index: number, genre: any): any {
    return genre.id ?? genre.slug ?? genre.name ?? index;
  }
}
