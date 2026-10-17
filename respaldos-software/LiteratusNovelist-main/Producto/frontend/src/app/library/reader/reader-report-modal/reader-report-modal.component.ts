import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';

export interface ReportContextData {
  bookId: string;
  bookTitle?: string;
  chapterId: string;
  chapterTitle?: string;
  chapterOrder?: number;
  selectedText?: string;
  contextSnippet?: string;
  startWordIndex?: number | null;
  endWordIndex?: number | null;
  paragraphIndex?: number | null;
  audioTimestamp?: number | null;
  voiceName?: string;
}

@Component({
  selector: 'app-reader-report-modal',
  templateUrl: './reader-report-modal.component.html',
  styleUrls: ['./reader-report-modal.component.css']
})
export class ReaderReportModalComponent implements OnInit {
  @Input() context!: ReportContextData;
  @Output() close = new EventEmitter<void>();
  @Output() reportSent = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private notify = inject(NotificationService);

  reportForm!: FormGroup;
  isSubmitting = false;

  readonly errorCategories = [
    { id: 'typo', label: 'Tipeo u ortografía', icon: 'spellcheck', isAudio: false },
    { id: 'cut_word', label: 'Palabra cortada / guión', icon: 'content_cut', isAudio: false },
    { id: 'repeated_text', label: 'Párrafo repetido', icon: 'content_copy', isAudio: false },
    { id: 'missing_content', label: 'Texto incompleto', icon: 'indeterminate_check_box', isAudio: false },
    { id: 'format_glitch', label: 'Formato visual roto', icon: 'web_stories', isAudio: false },
    { id: 'audio_desync', label: 'Audio desincronizado', icon: 'sync_problem', isAudio: true },
    { id: 'audio_glitch', label: 'Corte o ruido en audio', icon: 'volume_off', isAudio: true },
    { id: 'audio_pronunciation', label: 'Pronunciación incorrecta', icon: 'record_voice_over', isAudio: true },
    { id: 'other', label: 'Otro detalle', icon: 'help_outline', isAudio: false },
  ];

  readonly severityOptions = [
    { id: 'low', label: 'Baja', desc: 'Detalle menor' },
    { id: 'medium', label: 'Media', desc: 'Afecta la lectura' },
    { id: 'high', label: 'Alta', desc: 'Impide continuar' },
  ];

  ngOnInit(): void {
    const hasAudio = this.context.audioTimestamp != null && this.context.audioTimestamp > 0;
    const initialCategory = hasAudio ? 'audio_desync' : 'typo';

    this.reportForm = this.fb.group({
      error_type: [initialCategory, Validators.required],
      severity: ['medium', Validators.required],
      user_comment: ['', [Validators.maxLength(500)]]
    });
  }

  formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  submitReport(): void {
    if (this.reportForm.invalid || this.isSubmitting) return;

    this.isSubmitting = true;

    const clientMetadata = {
      isNativeApp: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
      userAgent: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      theme: document.body.getAttribute('data-theme') || 'default',
      timestamp: new Date().toISOString()
    };

    const payload = {
      book: this.context.bookId,
      chapter: this.context.chapterId,
      error_type: this.reportForm.value.error_type,
      severity: this.reportForm.value.severity,
      user_comment: (this.reportForm.value.user_comment || '').trim(),
      selected_text: (this.context.selectedText || '').trim(),
      context_snippet: (this.context.contextSnippet || '').trim(),
      start_word_index: this.context.startWordIndex ?? null,
      end_word_index: this.context.endWordIndex ?? null,
      paragraph_index: this.context.paragraphIndex ?? null,
      audio_timestamp_seconds: this.context.audioTimestamp ?? null,
      voice_name: this.context.voiceName || '',
      client_metadata: clientMetadata
    };

    this.api.post('catalog/reports/', payload).subscribe({
      next: () => {
        this.notify.success('¡Muchas gracias! Tu reporte fue enviado al equipo editorial.', 'Reporte de error');
        this.isSubmitting = false;
        this.reportSent.emit();
        this.close.emit();
      },
      error: (err) => {
        console.error('Error enviando reporte:', err);
        const errMsg = err?.error?.chapter || err?.error?.detail || 'No se pudo enviar el reporte. Por favor reintenta.';
        this.notify.error(errMsg, 'Error');
        this.isSubmitting = false;
      }
    });
  }
}
