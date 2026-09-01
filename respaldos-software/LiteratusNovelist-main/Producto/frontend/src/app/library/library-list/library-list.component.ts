import { Component, OnInit, inject, ElementRef, ViewChild } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import lottie from 'lottie-web';

@Component({
  selector: 'app-library-list',
  templateUrl: './library-list.component.html',
  styleUrls: ['./library-list.component.css']
})
export class LibraryListComponent implements OnInit {
  private api = inject(ApiService);

  inventoryItems: any[] = [];
  isLoading = true;
  errorMsg = '';

  private _libritoContainer?: ElementRef;
  @ViewChild('libritoContainer') set libritoContainer(el: ElementRef) {
    if (el && !this._libritoContainer) {
      this._libritoContainer = el;
      lottie.loadAnimation({
        container: el.nativeElement,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'assets/lottie/librito.json'
      });
    }
  }

  ngOnInit(): void {
    this.fetchInventory();
  }

  fetchInventory(): void {
    this.isLoading = true;
    this.api.get<any[]>('library/inventory/').subscribe({
      next: (res: any) => {
        // Asegurarnos de que asigne el arreglo correcto ya sea de paginación o directo
        this.inventoryItems = Array.isArray(res) ? res : (res.results || []);
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.errorMsg = 'No pudimos cargar tu biblioteca. Intenta de nuevo más tarde.';
        this.isLoading = false;
      }
    });
  }
}
