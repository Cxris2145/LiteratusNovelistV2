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
    { id: 'default', label: 'Classic Dark' },
    { id: 'neon', label: 'Cyber Neon' },
    { id: 'light-gallery', label: 'Light Gallery' }
  ];
  selectedTheme = 'default';

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
          this.avatarColor = profile.avatar_color || '#3b82f6';
          this.selectedTheme = profile.theme || 'default';
          this.updateInitials();
          if (profile.ink_balance !== undefined) {
            this.chatService.updateInkBalance(profile.ink_balance);
          }
          this.settingsService.setThemeDirectly(this.selectedTheme);
        }
      }
    });
  }

  updateInitials() {
    const name = this.profileForm.get('username')?.value;
    this.userInitials = name ? name.charAt(0).toUpperCase() : 'V';
  }

  onFileSelected(event: any) {
    // Se ha deshabilitado la subida de avatares temporalmente.
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
