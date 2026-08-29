import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-book-editor',
  templateUrl: './book-editor.component.html',
  styleUrls: ['./book-editor.component.css']
})
export class BookEditorComponent implements OnInit {
  bookForm: FormGroup;
  isEditing = false;
  bookId: string | null = null;
  
  epubFile: File | null = null;
  coverFile: File | null = null;
  coverPreview: string | null = null;
  
  chapters: any[] = [];
  editingChapter: number | null = null;
  
  authorsList: any[] = [];
  genresList: any[] = [];
  avatars: any[] = [];
    
  editionId: string | null = null;
  editingAvatar: any = null;
  avatarFile: File | null = null;
  avatarPreview: string | null = null;
  pdfFile: File | null = null;
  
  loading = false;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private bookService: DashboardBooksService,
    private route: ActivatedRoute,
    public router: Router,
    private sanitizer: DomSanitizer
  ) {
    this.bookForm = this.fb.group({
      title: ['', Validators.required],
      author_name: [''], // Campo oculto o de respaldo
      author_id: ['', Validators.required], // Selección obligatoria
      synopsis: ['', Validators.required],
      price: [990, [Validators.required, Validators.min(0)]],
      language: ['es', Validators.required],
      difficulty_level: ['intermediate', Validators.required],
      copyright_notice: ['Este libro electrónico está libre de restricciones de derechos de autor en Chile (según la Ley N° 17.336 de Propiedad Intelectual). Si no se encuentra en Chile, debe consultar las leyes locales para verificar que el contenido de este libro electrónico esté libre de restricciones en su país de residencia. Literatus Novelist promueve el acceso a la cultura respetando siempre los derechos vigentes.'],
      tags: [''],
      genres: [[]], // Array de IDs de géneros
      status: ['draft', Validators.required],
      is_published: [true],
      is_featured: [false]
    });
    
  }

  ngOnInit(): void {
    this.loadAuthors();
    this.loadGenres();
    this.bookId = this.route.snapshot.paramMap.get('id');
    if (this.bookId) {
      this.isEditing = true;
      this.loadBookData();
    } else {
      this.loadDraft();
    }
  }

  loadAuthors(): void {
    this.bookService.getAuthors().subscribe(list => {
      this.authorsList = list;
    });
  }

  loadGenres(): void {
    this.bookService.getGenres().subscribe(list => {
      // Si la respuesta es paginada (DRF standard) o array plano
      this.genresList = (list as any).results || list;
    });
  }
    

  loadBookData(): void {
    this.loading = true;
    this.bookService.getBookDetail(this.bookId!).subscribe({
      next: (book) => {
        this.bookForm.patchValue({
          title: book.title,
          author_name: book.authors[0]?.name || '',
          author_id: book.authors[0]?.id || '',
          synopsis: book.synopsis,
          price: book.edition?.price || 990,
          language: book.edition?.language || 'es',
          difficulty_level: book.difficulty_level || 'intermediate',
          copyright_notice: book.copyright_notice || '',
          tags: book.tags.join(', '),
          genres: book.genres?.map((g: any) => g.id) || [],
          status: book.status || 'published',
          is_published: book.is_published,
          is_featured: book.is_featured
        });
        this.chapters = book.chapters;
        this.coverPreview = book.cover;
        this.avatars = book.avatars || [];
        this.editionId = book.edition?.id || null;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  onEpubSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.epubFile = file;
      this.parseEpub(file);
    }
  }

  parseEpub(file: File): void {
    this.loading = true;
    this.bookService.parseEpub(file).subscribe({
      next: (res) => {
        this.bookForm.patchValue({
          title: res.detected_title,
          author_name: res.detected_author
        });
        this.chapters = res.chapters;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        alert('Error al procesar el EPUB. Intenta con otro archivo.');
      }
    });
  }

  onCoverSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.coverFile = file;
      const reader = new FileReader();
      reader.onload = () => this.coverPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  removeCover(): void {
    this.coverFile = null;
    this.coverPreview = null;
  }

  onPdfSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.pdfFile = file;
    }
  }

  deleteBook(): void {
    if (!this.bookId) return;
    if (confirm('¿ESTÁS SEGURO? Esta acción eliminará permanentemente el libro, todos sus capítulos y personajes. Esta acción no se puede deshacer.')) {
      this.loading = true;
      this.bookService.deleteBook(this.bookId).subscribe({
        next: () => {
          this.loading = false;
          alert('Libro eliminado correctamente.');
          this.router.navigate(['/dashboard/books']);
        },
        error: (err) => {
          this.loading = false;
          alert('Error al eliminar: ' + (err.error?.error || 'Desconocido'));
        }
      });
    }
  }

  openChapterEditor(index: number): void {
    this.editingChapter = index;
  }

  removeChapter(index: number): void {
    if (confirm('¿Eliminar este capítulo?')) {
      this.chapters.splice(index, 1);
      // Reordenar
      this.chapters.forEach((c, i) => c.order = i + 1);
    }
  }

  onSceneImageSelected(event: any): void {
    const file = event.target.files[0];
    if (!file || this.editingChapter === null) return;

    this.loading = true;
    this.bookService.uploadChapterImage(file).subscribe({
      next: (res) => {
        const imgHtml = `\n<img src="${res.url}" class="scene-image" alt="Escena de la novela">\n`;
        
        // Obtenemos el textarea y su posición de cursor actual si es posible, 
        // o simplemente lo añadimos al final.
        const textarea = document.querySelector('.code-editor') as HTMLTextAreaElement;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const currentContent = this.chapters[this.editingChapter!].content_html || '';
          this.chapters[this.editingChapter!].content_html = 
            currentContent.substring(0, start) + imgHtml + currentContent.substring(end);
            
          // Mover cursor
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + imgHtml.length, start + imgHtml.length);
          }, 50);
        } else {
          this.chapters[this.editingChapter!].content_html += imgHtml;
        }
        
        this.loading = false;
        // Limpiar el input file para permitir subir la misma imagen de nuevo
        event.target.value = '';
      },
      error: () => {
        this.loading = false;
        alert('Error al subir la imagen de escena.');
      }
    });
  }

  saveBook(): void {
    if (this.bookForm.invalid) {
      this.bookForm.markAllAsTouched();
      return;
    }
    if (!this.isEditing && !this.epubFile) {
      alert('Se requiere el archivo EPUB para crear un nuevo libro.');
      return;
    }

    this.saving = true;
    const data = {
      ...this.bookForm.value,
      chapters: this.chapters
    };

    this.bookService.saveBook(
      data, 
      this.epubFile || undefined, 
      this.coverFile || undefined,
      this.bookId || undefined,
      this.pdfFile || undefined
    ).subscribe({
      next: () => {
        localStorage.removeItem('book_editor_draft');
        alert('¡Libro guardado con éxito!');
        this.router.navigate(['/dashboard/books']);
      },
      error: (err) => {
        this.saving = false;
        alert('Error al guardar: ' + (err.error?.error || 'Desconocido'));
      }
    });
  }

  saveDraft(): void {
    const draft = {
      form: this.bookForm.value,
      chapters: this.chapters,
      timestamp: new Date().getTime()
    };
    localStorage.setItem('book_editor_draft', JSON.stringify(draft));
    console.log('Borrador guardado localmente');
  }

  loadDraft(): void {
    const raw = localStorage.getItem('book_editor_draft');
    if (raw) {
      const draft = JSON.parse(raw);
      // Solo cargar si es reciente (menos de 24h)
      if (new Date().getTime() - draft.timestamp < 24 * 60 * 60 * 1000) {
        if (confirm('Tienes un borrador sin guardar. ¿Deseas recuperarlo?')) {
          this.bookForm.patchValue(draft.form);
          this.chapters = draft.chapters;
        }
      }
    }
  }
    

  // --- AVATAR METHODS ---
  openAvatarEditor(avatar: any = null): void {
    this.avatarFile = null;
    this.avatarPreview = avatar ? avatar.avatar_image : null;
    this.editingAvatar = avatar ? { ...avatar } : {
      name: '',
      description: '',
      system_prompt: '',
      behavioral_context: '',
      sample_dialogues: '',
      greeting_message: '',
      unlock_at_chapter: 0,
      is_major_character: true,
      is_author: false
    };
  }

  onAvatarImageSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.avatarFile = file;
      const reader = new FileReader();
      reader.onload = () => this.avatarPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  saveAvatar(): void {
    if (!this.editionId) {
      alert('Debes guardar el libro primero para poder añadir personajes.');
      return;
    }
    
    this.loading = true;
    this.bookService.saveAvatar(
      this.editingAvatar, 
      this.avatarFile || undefined, 
      this.editionId, 
      this.editingAvatar.id
    ).subscribe({
      next: (res) => {
        this.loading = false;
        alert('Personaje guardado.');
        this.loadBookData(); // Recargar datos para ver el personaje actualizado
        this.editingAvatar = null;
      },
      error: (err) => {
        this.loading = false;
        alert('Error al guardar el personaje.');
      }
    });
  }

  /** Devuelve el HTML del capítulo en edición como SafeHtml para el preview */
  getSafePreviewHtml(): SafeHtml {
    if (this.editingChapter === null) return '';
    const html = this.chapters[this.editingChapter]?.content_html || '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  removeAvatar(avatarId: string): void {
    if (confirm('¿Eliminar este personaje?')) {
      this.loading = true;
      this.bookService.deleteAvatar(avatarId).subscribe({
        next: () => {
          this.loading = false;
          this.loadBookData();
        },
        error: () => {
          this.loading = false;
          alert('Error al eliminar personaje.');
        }
      });
    }
  }
}
