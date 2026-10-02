import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { SettingsService } from '../../core/services/settings.service';
import { MatSnackBar } from '@angular/material/snack-bar';

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

  constructor() {
    this.profileForm = this.fb.group({
      username: ['', Validators.required],
      email: [{value: '', disabled: true}],
      bio: [''],
      country: ['']
    });
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
            bio: profile.bio,
            country: profile.country
          });
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
      this.snackBar.open('Por favor selecciona una imagen válida (JPG, PNG, WEBP).', 'Cerrar', { duration: 3500 });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.snackBar.open('La imagen es demasiado pesada (máx 8MB).', 'Cerrar', { duration: 3500 });
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
          this.snackBar.open('Foto cargada en la vista previa. Haz clic en "Guardar Cambios" para confirmar.', 'Entendido', { duration: 4500 });
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.avatarUrl = null;
    this.profileForm.markAsDirty();
    this.snackBar.open('Foto eliminada. Haz clic en "Guardar Cambios" para confirmar.', 'Entendido', { duration: 4000 });
  }

  previewTheme(themeId: string) {
    this.selectedTheme = themeId;
    this.settingsService.setThemeDirectly(themeId);
  }

  onSubmit() {
    if (this.profileForm.invalid) return;
    this.loading = true;

    const payload = {
      bio: this.profileForm.get('bio')?.value || '',
      country: this.profileForm.get('country')?.value || '',
      avatar: this.avatarUrl || '',
      avatar_color: this.avatarColor,
      theme: this.selectedTheme
    };

    this.api.patch('users/profile/', payload).subscribe({
      next: (res) => {
        this.loading = false;
        this.snackBar.open('Perfil actualizado exitosamente', 'Cerrar', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        // Actualizar el estado global
        this.chatService.notifyProfileUpdate();
        this.loadProfile();
      },
      error: (err) => {
        this.loading = false;
        console.error("Error actualizando perfil", err);
        this.snackBar.open('Error al guardar los cambios', 'Cerrar', { duration: 3000 });
      }
    });
  }
}
