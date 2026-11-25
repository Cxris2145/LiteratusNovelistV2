import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { GUIDE_DIALOG_CONFIG, GuideDialogComponent } from '../guide-dialog/guide-dialog.component';
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
    if (this.dialog.getDialogById(GUIDE_DIALOG_CONFIG.id!)) return;
    this.dialog.open(GuideDialogComponent, GUIDE_DIALOG_CONFIG);
  }
}

