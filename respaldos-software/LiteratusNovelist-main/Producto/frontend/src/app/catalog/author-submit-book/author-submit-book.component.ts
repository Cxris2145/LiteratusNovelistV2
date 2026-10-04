import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthorSubmissionService, AuthorSubmissionItem, AuthorRequirementsResponse } from '../../core/services/author-submission.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { environment } from '../../../environments/environment';

interface ManualChapter {
  title: string;
  order: number;
  content: string;
}

@Component({
  selector: 'app-author-submit-book',
  templateUrl: './author-submit-book.component.html',
  styleUrls: ['./author-submit-book.component.css']
})
export class AuthorSubmitBookComponent implements OnInit {
  activeTab: 'submit' | 'my-submissions' | 'guidelines' = 'submit';

  // Formulario
  title = '';
  authorName = '';
  authorBio = '';
  synopsis = '';
  difficultyLevel = 'intermediate';
  selectedGenres: string[] = [];
  tags = '';
  submissionDeclaration = false;

  contentMode: 'file' | 'manual' = 'file';
  manualChapters: ManualChapter[] = [
    { title: 'Capítulo 1: Inicio', order: 1, content: '' }
  ];

  coverFile: File | null = null;
  coverPreview: string | null = null;
  manuscriptFile: File | null = null;
  manuscriptFileName = '';
  manuscriptFormat: 'epub' | 'pdf' | null = null;

  // Catálogos auxiliares
  availableGenres: any[] = [];
  requirementsData: AuthorRequirementsResponse | null = null;

  // Seguimiento
  mySubmissions: AuthorSubmissionItem[] = [];
  loadingSubmissions = false;
  submitting = false;
  submissionSuccess = false;
  submittedBookResult: any = null;

  difficultyOptions = [
    { value: 'beginner', label: 'Iniciación (Lectura ágil, vocabulario accesible)' },
    { value: 'intermediate', label: 'Intermedio (Narrativa estándar y equilibrada)' },
    { value: 'advanced', label: 'Avanzado (Rigor literario, prosa profunda)' }
  ];

  constructor(
    private authorService: AuthorSubmissionService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.prefillAuthorName();
    this.loadGenres();
    this.loadRequirements();
    this.loadMySubmissions();
  }

  prefillAuthorName(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.authorName = user.username || user.email?.split('@')[0] || '';
    }
  }

  loadGenres(): void {
    this.http.get<any>(`${environment.apiUrl}catalog/genres/`).subscribe({
      next: (res) => {
        const results = Array.isArray(res) ? res : (res?.results || []);
        this.availableGenres = results;
      },
      error: () => {
        // Fallback en caso de que no responda inmediatamente
        this.availableGenres = [
          { name: 'Ficción' },
          { name: 'Fantasía' },
          { name: 'Misterio y Suspenso' },
          { name: 'Ciencia Ficción' },
          { name: 'Novela Histórica' },
          { name: 'Filosofía y Ensayo' },
          { name: 'Poesía' },
          { name: 'Romance' },
          { name: 'Aventura' }
        ];
      }
    });
  }

  loadRequirements(): void {
    this.authorService.getRequirements().subscribe({
      next: (res) => {
        this.requirementsData = res;
      },
      error: () => {}
    });
  }

  loadMySubmissions(): void {
    this.loadingSubmissions = true;
    this.authorService.getMySubmissions().subscribe({
      next: (res) => {
        this.mySubmissions = res.submissions || [];
        this.loadingSubmissions = false;
      },
      error: () => {
        this.loadingSubmissions = false;
      }
    });
  }

  // --- Validación en Vivo de Criterios Mínimos ---
  get hasValidTitle(): boolean {
    return this.title.trim().length >= 3;
  }

  get hasValidSynopsis(): boolean {
    return this.synopsis.trim().length >= 50;
  }

  get synopsisLength(): number {
    return this.synopsis.trim().length;
  }

  get hasCover(): boolean {
    return this.coverFile !== null;
  }

  get hasGenres(): boolean {
    return this.selectedGenres.length >= 1;
  }

  get hasContent(): boolean {
    if (this.contentMode === 'file') {
      return this.manuscriptFile !== null;
    }
    return this.manualChapters.some(c => c.content.trim().length >= 50);
  }

  get hasDeclaration(): boolean {
    return this.submissionDeclaration === true;
  }

  get meetsAllCriteria(): boolean {
    return (
      this.hasValidTitle &&
      this.hasValidSynopsis &&
      this.hasCover &&
      this.hasGenres &&
      this.hasContent &&
      this.hasDeclaration
    );
  }

  get passedCriteriaCount(): number {
    let count = 0;
    if (this.hasValidTitle) count++;
    if (this.hasValidSynopsis) count++;
    if (this.hasCover) count++;
    if (this.hasGenres) count++;
    if (this.hasContent) count++;
    if (this.hasDeclaration) count++;
    return count;
  }

  // --- Manejo de Archivos ---
  onCoverSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.notificationService.error('El archivo de portada debe ser una imagen válida (JPG, PNG o WEBP).', 'Formato no válido');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.notificationService.error('La portada no debe superar los 5 MB.', 'Archivo muy pesado');
      return;
    }

    this.coverFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.coverPreview = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeCover(): void {
    this.coverFile = null;
    this.coverPreview = null;
  }

  onManuscriptSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.epub')) {
      this.manuscriptFormat = 'epub';
    } else if (lowerName.endsWith('.pdf')) {
      this.manuscriptFormat = 'pdf';
    } else {
      this.notificationService.error('El manuscrito debe ser un archivo .EPUB o .PDF.', 'Formato no admitido');
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      this.notificationService.error('El manuscrito excede el límite máximo de 40 MB.', 'Archivo muy pesado');
      return;
    }

    this.manuscriptFile = file;
    this.manuscriptFileName = file.name;
    this.notificationService.info(`Manuscrito ${this.manuscriptFormat.toUpperCase()} adjuntado correctamente.`, 'Manuscrito');
  }

  removeManuscript(): void {
    this.manuscriptFile = null;
    this.manuscriptFileName = '';
    this.manuscriptFormat = null;
  }

  // --- Géneros ---
  toggleGenre(name: string): void {
    const idx = this.selectedGenres.indexOf(name);
    if (idx > -1) {
      this.selectedGenres.splice(idx, 1);
    } else {
      if (this.selectedGenres.length >= 4) {
        this.notificationService.warning('Puedes seleccionar hasta un máximo de 4 géneros.', 'Límite de géneros');
        return;
      }
      this.selectedGenres.push(name);
    }
  }

  isGenreSelected(name: string): boolean {
    return this.selectedGenres.includes(name);
  }

  // --- Capítulos Manuales ---
  addChapter(): void {
    const nextNum = this.manualChapters.length + 1;
    this.manualChapters.push({
      title: `Capítulo ${nextNum}`,
      order: nextNum,
      content: ''
    });
  }

  removeChapter(index: number): void {
    if (this.manualChapters.length <= 1) {
      this.notificationService.warning('Debes mantener al menos un capítulo inicial.', 'Capítulos');
      return;
    }
    this.manualChapters.splice(index, 1);
    // Reordenar índices
    this.manualChapters.forEach((ch, i) => ch.order = i + 1);
  }

  // --- Envío del Formulario ---
  submitBook(): void {
    if (!this.meetsAllCriteria) {
      this.notificationService.warning('Por favor completa todos los requisitos mínimos obligatorios antes de enviar a curaduría.', 'Requisitos Incompletos');
      return;
    }

    this.submitting = true;
    const formData = new FormData();
    formData.append('title', this.title.trim());
    formData.append('author_name', this.authorName.trim() || 'Autor Anónimo');
    formData.append('bio', this.authorBio.trim());
    formData.append('synopsis', this.synopsis.trim());
    formData.append('difficulty_level', this.difficultyLevel);
    formData.append('genres', JSON.stringify(this.selectedGenres));
    formData.append('tags', this.tags.trim());
    formData.append('submission_declaration', 'true');

    if (this.coverFile) {
      formData.append('cover', this.coverFile);
    }

    if (this.contentMode === 'file' && this.manuscriptFile) {
      if (this.manuscriptFormat === 'epub') {
        formData.append('epub', this.manuscriptFile);
      } else if (this.manuscriptFormat === 'pdf') {
        formData.append('pdf_file', this.manuscriptFile);
      }
    } else if (this.contentMode === 'manual') {
      formData.append('chapters', JSON.stringify(this.manualChapters));
    }

    this.authorService.submitBook(formData).subscribe({
      next: (res) => {
        this.submitting = false;
        this.submissionSuccess = true;
        this.submittedBookResult = res.book;
        this.notificationService.success('¡Tu manuscrito ha sido recibido y enviado a Curaduría Editorial!', 'Envío Exitoso');
        this.loadMySubmissions();
      },
      error: (err) => {
        this.submitting = false;
        const msg = err.error?.detail || err.error?.message || 'Ocurrió un error al enviar tu obra. Verifica los campos requeridos.';
        this.notificationService.error(msg, 'Error en el Envío');
      }
    });
  }

  resetForm(): void {
    this.title = '';
    this.synopsis = '';
    this.selectedGenres = [];
    this.tags = '';
    this.submissionDeclaration = false;
    this.coverFile = null;
    this.coverPreview = null;
    this.manuscriptFile = null;
    this.manuscriptFileName = '';
    this.manuscriptFormat = null;
    this.contentMode = 'file';
    this.manualChapters = [{ title: 'Capítulo 1: Inicio', order: 1, content: '' }];
    this.submissionSuccess = false;
    this.submittedBookResult = null;
    this.prefillAuthorName();
  }
}
