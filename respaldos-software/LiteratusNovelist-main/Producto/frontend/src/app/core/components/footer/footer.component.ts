import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { GuideDialogComponent } from '../guide-dialog/guide-dialog.component';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  private dialog = inject(MatDialog);

  openGuide() {
    this.dialog.open(GuideDialogComponent, {
      panelClass: 'guide-custom-dialog-panel',
      autoFocus: false,
      maxWidth: '92vw',
      width: '580px'
    });
  }
}

