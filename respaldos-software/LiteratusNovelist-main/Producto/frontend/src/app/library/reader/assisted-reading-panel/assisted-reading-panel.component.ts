import { ChangeDetectionStrategy, Component, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AssistedReadingService } from '../../../core/services/assisted-reading.service';

@Component({
  selector: 'app-assisted-reading-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assisted-reading-panel.component.html',
  styleUrls: ['./assisted-reading-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistedReadingPanelComponent {
  ar = inject(AssistedReadingService);
  @Output() closePanel = new EventEmitter<void>();
  showAdvanced = false;
  
  // Speed options for display
  speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  
  // Color options
  colors = [
    { id: 'yellow', name: 'Amarillo suave', preview: 'rgba(234, 179, 8, 0.35)' },
    { id: 'blue', name: 'Azul suave', preview: 'rgba(59, 130, 246, 0.35)' },
    { id: 'green', name: 'Verde suave', preview: 'rgba(34, 197, 94, 0.35)' },
    { id: 'orange', name: 'Naranja suave', preview: 'rgba(249, 115, 22, 0.35)' },
    { id: 'gray', name: 'Gris', preview: 'rgba(156, 163, 175, 0.35)' },
  ];

  trackByIndex(index: number): number {
    return index;
  }

  trackByColorId(index: number, color: { id: string; name: string; preview: string }): string {
    return color.id;
  }
}
