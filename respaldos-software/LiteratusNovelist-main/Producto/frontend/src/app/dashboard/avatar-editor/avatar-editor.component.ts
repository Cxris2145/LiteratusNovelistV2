import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styleUrls: ['./avatar-editor.component.css']
})
export class AvatarEditorComponent implements OnInit {
  // IDs de contexto
  avatarId: string | null = null;
  bookId: string | null = null;
  editionId: string | null = null;
  isNew = false;

  // Estado de carga y guardado
  loading = true;
  saving = false;
  errorMsg = '';
  successMsg = '';

  // Archivos multimedia
  avatarFile: File | null = null;
  avatarPreview: string | null = null;
  
  speakingFile1: File | null = null;
  speakingPreview1: string | null = null;

  speakingFile2: File | null = null;
  speakingPreview2: string | null = null;

  speakingFile3: File | null = null;
  speakingPreview3: string | null = null;

  thinkingFile: File | null = null;
  thinkingPreview: string | null = null;

  // Modelo completo del personaje
  avatar: any = {
    name: '',
    description: '',
    system_prompt: '',
    behavioral_context: '',
    sample_dialogues: '',
    greeting_message: '¡Hola!',
    temperature: 0.70,
    model_name: 'gemini-2.5-flash',
    unlock_at_chapter: 0,
    is_major_character: true,
    is_author: false,
    chat_count: 0,
  };

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private bookService: DashboardBooksService
  ) {}

  ngOnInit(): void {
    this.avatarId = this.route.snapshot.paramMap.get('avatarId');
    this.bookId = this.route.snapshot.paramMap.get('id');

    if (this.avatarId && this.avatarId !== 'new') {
      this.isNew = false;
      this.loadAvatarData();
    } else {
      this.isNew = true;
      this.loading = false;
      this.loadEditionId();
    }
  }

  loadEditionId(): void {
    if (!this.bookId) return;
    this.bookService.getBookDetail(this.bookId).subscribe({
      next: (book) => {
        this.editionId = book.edition?.id || null;
      }
    });
  }

  loadAvatarData(): void {
    this.loading = true;
    this.bookService.getAvatarDetail(this.avatarId!).subscribe({
      next: (av) => {
        this.avatar = {
          id: av.id,
          edition_id: av.edition_id,
          name: av.name || '',
          description: av.description || '',
          system_prompt: av.system_prompt || '',
          behavioral_context: av.behavioral_context || '',
          sample_dialogues: av.sample_dialogues || '',
          greeting_message: av.greeting_message || '¡Hola!',
          temperature: av.temperature ?? 0.70,
          model_name: av.model_name || 'gemini-2.5-flash',
          unlock_at_chapter: av.unlock_at_chapter ?? 0,
          is_major_character: av.is_major_character ?? true,
          is_author: av.is_author ?? false,
          chat_count: av.chat_count || 0,
          avatar_image: av.avatar_image || null,
          image_speaking_1: av.image_speaking_1 || null,
          image_speaking_2: av.image_speaking_2 || null,
          image_speaking_3: av.image_speaking_3 || null,
          image_thinking: av.image_thinking || null,
        };
        this.avatarPreview = av.avatar_image || null;
        this.speakingPreview1 = av.image_speaking_1 || null;
        this.speakingPreview2 = av.image_speaking_2 || null;
        this.speakingPreview3 = av.image_speaking_3 || null;
        this.thinkingPreview = av.image_thinking || null;
        this.editionId = av.edition_id || null;
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'No se pudo cargar el personaje. Error: ' + (err.status || 'desconocido');
        this.loading = false;
      }
    });
  }

  onImageSelected(event: any, type: 'avatar' | 'speaking1' | 'speaking2' | 'speaking3' | 'thinking'): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      if (type === 'avatar') {
        this.avatarFile = file;
        reader.onload = () => this.avatarPreview = reader.result as string;
      } else if (type === 'speaking1') {
        this.speakingFile1 = file;
        reader.onload = () => this.speakingPreview1 = reader.result as string;
      } else if (type === 'speaking2') {
        this.speakingFile2 = file;
        reader.onload = () => this.speakingPreview2 = reader.result as string;
      } else if (type === 'speaking3') {
        this.speakingFile3 = file;
        reader.onload = () => this.speakingPreview3 = reader.result as string;
      } else if (type === 'thinking') {
        this.thinkingFile = file;
        reader.onload = () => this.thinkingPreview = reader.result as string;
      }
      reader.readAsDataURL(file);
    }
  }

  removeImage(type: 'avatar' | 'speaking1' | 'speaking2' | 'speaking3' | 'thinking'): void {
    if (type === 'avatar') {
      this.avatarFile = null;
      this.avatarPreview = null;
    } else if (type === 'speaking1') {
      this.speakingFile1 = null;
      this.speakingPreview1 = null;
    } else if (type === 'speaking2') {
      this.speakingFile2 = null;
      this.speakingPreview2 = null;
    } else if (type === 'speaking3') {
      this.speakingFile3 = null;
      this.speakingPreview3 = null;
    } else if (type === 'thinking') {
      this.thinkingFile = null;
      this.thinkingPreview = null;
    }
  }

  save(): void {
    if (!this.avatar.name.trim()) {
      this.errorMsg = 'El nombre del personaje es obligatorio.';
      return;
    }
    const targetEditionId = this.editionId || this.avatar.edition_id;
    if (!targetEditionId && this.isNew) {
      this.errorMsg = 'No se encontró la edición del libro. Guarda el libro primero.';
      return;
    }

    this.saving = true;
    this.errorMsg = '';
    this.successMsg = '';

    this.bookService.saveAvatar(
      this.avatar,
      this.avatarFile || undefined,
      targetEditionId,
      this.isNew ? undefined : this.avatarId!,
      this.speakingFile1 || undefined,
      this.speakingFile2 || undefined,
      this.speakingFile3 || undefined,
      this.thinkingFile || undefined
    ).subscribe({
      next: () => {
        this.saving = false;
        this.successMsg = '¡Personaje guardado correctamente!';
        setTimeout(() => this.router.navigate(['/dashboard/books', this.bookId, 'edit']), 1500);
      },
      error: (err) => {
        this.saving = false;
        this.errorMsg = 'Error al guardar: ' + (err.error?.error || 'Desconocido');
      }
    });
  }

  deleteAvatar(): void {
    if (!this.avatarId || this.isNew) return;
    if (confirm(`¿Estás seguro de que quieres eliminar a "${this.avatar.name}"? Esta acción es irreversible.`)) {
      this.saving = true;
      this.bookService.deleteAvatar(this.avatarId).subscribe({
        next: () => {
          this.saving = false;
          alert('Personaje eliminado correctamente.');
          this.goBack();
        },
        error: (err) => {
          this.saving = false;
          alert('Error al eliminar: ' + (err.error?.error || 'Desconocido'));
        }
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard/books', this.bookId, 'edit']);
  }
}
