import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { GuideDialogComponent } from '../guide-dialog/guide-dialog.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  openGuide() {
    this.dialog.open(GuideDialogComponent, {
      panelClass: 'guide-custom-dialog-panel',
      autoFocus: false,
      maxWidth: '92vw',
      width: '580px'
    });
  }
}

