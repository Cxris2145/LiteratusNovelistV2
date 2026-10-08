import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { SettingsService } from '../../core/services/settings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../core/services/notification.service';
import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { copyText } from '../../community/clipboard.util';
import { todayIsoDate } from '../../core/utils/birth-date.util';

export const TAGLINE_MAX = 80;
export const BIO_MAX = 1000;

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  authService = inject(AuthService);
  api = inject(ApiService);
  chatService = inject(ChatService);
  fb = inject(FormBuilder);
  snackBar = inject(MatSnackBar);
  notificationService = inject(NotificationService);

  loading = false;
  userInitials = 'V';
  avatarColor: string = '#3b82f6';
  availableColors = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899'];
  
  settingsService = inject(SettingsService);
  availableThemes = [
    { 
      id: 'default', 
      label: 'Azul Tinta', 
      desc: 'Predeterminado · Azul profundo y detalles dorados',
      previewBg: '#15233B',
      previewAccent: '#5E80B3',
      previewBorder: '#263B61'
    },
    { 
      id: 'high-contrast-dark', 
      label: 'Alto Contraste Oscuro', 
      desc: 'Accesible · Negro puro (#000000) y texto blanco',
      previewBg: '#000000',
      previewAccent: '#FCD34D',
      previewBorder: '#FFFFFF'
    },
    { 
      id: 'high-contrast-light', 
      label: 'Alto Contraste Diurno', 
      desc: 'Accesible · Blanco puro (#FFFFFF) y tinta carbón',
      previewBg: '#FFFFFF',
      previewAccent: '#000000',
      previewBorder: '#9CA3AF'
    },
    { 
      id: 'sepia', 
      label: 'Modo Lectura Sepia', 
      desc: 'Cálido · Pergamino suave y descanso visual',
      previewBg: '#FBF0D9',
      previewAccent: '#92400E',
      previewBorder: '#D7BA89'
    },
    { 
      id: 'light-gallery', 
      label: 'Galería Minimalista', 
      desc: 'Claro · Gris luminoso y acento azul zafiro',
      previewBg: '#F8F9FA',
      previewAccent: '#2563EB',
      previewBorder: '#E5E7EB'
    },
    { 
      id: 'neon', 
      label: 'Cyber Neon', 
      desc: 'Nocturno · Negro espacial y cian vibrante',
      previewBg: '#0D0F18',
      previewAccent: '#00FFCC',
      previewBorder: '#1F293D'
    }
  ];
  selectedTheme: string = 'default';

  equippedFrame: string = '';
  equippedTitle: string = '';
  maestroActive = false;
  avatarUrl: string | null = null;
  /** La Taberna: código de amigo y ropa de Maguito (solo lectura aquí). */
  friendCode = '';
  outfit: MaguitoOutfit = {};
  readonly taglineMax = TAGLINE_MAX;
  readonly bioMax = BIO_MAX;
  readonly today = todayIsoDate();
  /** La fecha de nacimiento se registra una sola vez; después queda bloqueada. */
  birthDateLocked = false;

  constructor() {
    this.profileForm = this.fb.group({
      username: ['', Validators.required],
      email: [{value: '', disabled: true}],
      tagline: ['', Validators.maxLength(TAGLINE_MAX)],
      bio: ['', Validators.maxLength(BIO_MAX)],
      country: [''],
      birth_date: ['']
    });
  }

  async copyFriendCode() {
    if (!this.friendCode) return;
    const copied = await copyText('#' + this.friendCode);
    if (copied) this.notificationService.success('Código copiado.', 'La Taberna');
    else this.notificationService.info(`Tu código es #${this.friendCode}.`, 'La Taberna');
  }

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.api.get<any>('users/profile/').subscribe({
      next: (profile) => {
        if (profile) {
          this.profileForm.patchValue({
            username: profile.username || this.authService.currentUser()?.username,
            email: this.authService.currentUser()?.email,
            tagline: profile.tagline || '',
            bio: profile.bio,
            country: profile.country,
            birth_date: profile.birth_date || ''
          });
          this.birthDateLocked = !!profile.birth_date;
          const birthDate = this.profileForm.get('birth_date');
          if (this.birthDateLocked) birthDate?.disable();
          else birthDate?.enable();
          this.friendCode = profile.friend_code || '';
          this.outfit = profile.outfit || {};
          this.avatarUrl = profile.avatar || null;
          this.avatarColor = profile.avatar_color || '#3b82f6';
          this.selectedTheme = profile.theme || 'default';
          this.equippedFrame = profile.equipped_frame || '';
          this.equippedTitle = profile.equipped_title || '';
          this.maestroActive = !!profile.subscription_cosmetics?.maestro;
          this.updateInitials();
          if (profile.ink_balance !== undefined) {
            this.chatService.updateInkBalance(profile.ink_balance);
          }
          this.settingsService.setThemeDirectly(this.selectedTheme);
        }
      }
    });
  }

  getSelectedThemeLabel(): string {
    return this.availableThemes.find(t => t.id === this.selectedTheme)?.label || 'Azul Tinta';
  }

  updateInitials() {
    const name = this.profileForm.get('username')?.value;
    this.userInitials = name ? name.charAt(0).toUpperCase() : 'V';
  }

  onFileSelected(event: any) {
    const file: File = event.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.notificationService.warning('Por favor selecciona una imagen válida (JPG, PNG, WEBP).', 'Formato no Válido');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.notificationService.warning('La imagen es demasiado pesada (máximo 8MB).', 'Tamaño Excedido');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para optimizar resolución de avatar a máx 320x320
        const maxDim = 320;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          this.avatarUrl = canvas.toDataURL('image/jpeg', 0.88);
          this.profileForm.markAsDirty();
          this.notificationService.info('Foto cargada en la vista previa. Haz clic en "Guardar Cambios" para confirmar.', 'Foto Actualizada');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.avatarUrl = null;
    this.profileForm.markAsDirty();
    this.notificationService.info('Foto eliminada. Haz clic en "Guardar Cambios" para confirmar.', 'Foto Removida');
  }

  previewTheme(themeId: string) {
    this.selectedTheme = themeId;
    this.settingsService.setThemeDirectly(themeId);
  }

  onSubmit() {
    if (this.profileForm.invalid) return;
    this.loading = true;

    const payload: Record<string, unknown> = {
      tagline: this.profileForm.get('tagline')?.value || '',
      bio: this.profileForm.get('bio')?.value || '',
      country: this.profileForm.get('country')?.value || '',
      avatar: this.avatarUrl || '',
      avatar_color: this.avatarColor,
      theme: this.selectedTheme
    };
    const birthDate = this.profileForm.get('birth_date')?.value;
    if (!this.birthDateLocked && birthDate) payload['birth_date'] = birthDate;

    this.api.patch('users/profile/', payload).subscribe({
      next: (res) => {
        this.loading = false;
        this.notificationService.success('Perfil actualizado exitosamente.', 'Perfil');
        // Actualizar el estado global
        this.chatService.notifyProfileUpdate();
        this.loadProfile();
      },
      error: (err) => {
        this.loading = false;
        console.error("Error actualizando perfil", err);
        const fieldError = err.error && typeof err.error === 'object' ? Object.values(err.error).flat()[0] : null;
        this.notificationService.error(typeof fieldError === 'string' ? fieldError : 'Error al guardar los cambios.', 'Error');
      }
    });
  }
}
