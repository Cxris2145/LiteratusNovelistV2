import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { APP_THEMES, SettingsService } from '../../core/services/settings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { DeleteAccountDialogComponent, DeleteAccountDialogData } from './delete-account-dialog/delete-account-dialog.component';
import { NotificationService } from '../../core/services/notification.service';
import { MaguitoOutfit } from '../../core/components/maguito/maguito-outfit';
import { MaguitoCustomColors, sameMaguitoColors } from '../../core/components/maguito/maguito-colors';
import { MaguitoColorPickerComponent } from '../../core/components/maguito-color-picker/maguito-color-picker.component';
import { MaguitoThemeService } from '../../core/services/maguito-theme.service';
import { copyText } from '../../community/clipboard.util';
import { todayIsoDate } from '../../core/utils/birth-date.util';
import { ParentalService } from '../../core/services/parental.service';

export const TAGLINE_MAX = 80;
export const BIO_MAX = 1000;

type ProfileTab = 'datos' | 'paleta' | 'maguito';

export const PROFILE_TABS: readonly { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'datos', label: 'Tus datos', icon: 'badge' },
  { id: 'paleta', label: 'Apariencia', icon: 'palette' },
  { id: 'maguito', label: 'Tu Maguito', icon: 'auto_fix_high' },
];

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
  private dialog = inject(MatDialog);
  private parental = inject(ParentalService);
  private maguitoTheme = inject(MaguitoThemeService);
  @ViewChild(MaguitoColorPickerComponent) private maguitoPicker?: MaguitoColorPickerComponent;
  /** Cuenta a cargo de un tutor (control parental): quién la administra. */
  guardianName = '';
  loading = false;
  readonly tabs = PROFILE_TABS;
  selectedTab: ProfileTab = 'datos';
  /** Hacia dónde entra el panel al cambiar de pestaña (null en la primera carga: sin animación). */
  tabDirection: 'forward' | 'back' | null = null;
  userInitials = 'V';
  /** Confirmaciones breves: código copiado, foto recién cambiada y "Cambios guardados". */
  codeCopied = false;
  avatarFresh = false;
  justSaved = false;
  private timers: Record<'code' | 'avatar' | 'saved', ReturnType<typeof setTimeout> | undefined> =
    { code: undefined, avatar: undefined, saved: undefined };

  avatarColor: string = '#3b82f6';
  availableColors = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899'];
  
  settingsService = inject(SettingsService);
  availableThemes = APP_THEMES;
  selectedTheme: string = 'default';

  equippedFrame: string = '';
  equippedTitle: string = '';
  maestroActive = false;
  avatarUrl: string | null = null;
  /** La Taberna: código de amigo y ropa de Maguito (solo lectura aquí). */
  friendCode = '';
  outfit: MaguitoOutfit = {};
  /** El color elegido en la pestaña Tu Maguito (null = clásico) y el que está guardado. */
  maguitoColors: Partial<MaguitoCustomColors> | null = null;
  private savedMaguitoColors: Partial<MaguitoCustomColors> | null = null;
  savingMaguito = false;
  readonly taglineMax = TAGLINE_MAX;
  readonly bioMax = BIO_MAX;
  readonly today = todayIsoDate();
  /** La fecha de nacimiento se registra una sola vez; después queda bloqueada. */
  birthDateLocked = false;

  constructor() {
    this.profileForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: [{value: '', disabled: true}],
      tagline: ['', Validators.maxLength(TAGLINE_MAX)],
      bio: ['', Validators.maxLength(BIO_MAX)],
      country: [''],
      birth_date: [''],
      is_public: [true],
      show_friends: [true],
      show_books: [true],
      show_reviews: [true]
    });
    // La paleta muestra el tema activo, también si se cambia desde el menú del avatar
    // (así "Guardar Cambios" no reenvía un tema viejo).
    this.settingsService.currentTheme$.pipe(takeUntilDestroyed())
      .subscribe(theme => this.selectedTheme = theme);
    inject(DestroyRef).onDestroy(() => Object.values(this.timers).forEach(clearTimeout));
  }

  /** El ex libris de arriba muestra lo que se está escribiendo, antes de guardar. */
  get displayName(): string {
    return (this.profileForm.get('username')?.value || '').trim() || 'Tu nombre';
  }

  get taglineValue(): string {
    return (this.profileForm.get('tagline')?.value || '').trim();
  }

  get bioLength(): number {
    return this.profileForm.get('bio')?.value?.length || 0;
  }

  get isPublic(): boolean {
    return this.profileForm.get('is_public')?.value !== false;
  }

  get usernameInvalid(): boolean {
    const control = this.profileForm.get('username');
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  get tabIndex(): number {
    return this.tabs.findIndex(tab => tab.id === this.selectedTab);
  }

  /** La barra de guardar sigue a la vista mientras guarda y un momento después, para confirmar. */
  get saveBarVisible(): boolean {
    return this.profileForm.dirty || this.loading || this.justSaved;
  }

  selectTab(id: ProfileTab) {
    if (id === this.selectedTab) return;
    this.tabDirection = this.tabs.findIndex(tab => tab.id === id) > this.tabIndex ? 'forward' : 'back';
    this.selectedTab = id;
  }

  /** Flechas, Inicio y Fin recorren las pestañas (patrón de pestañas de WAI-ARIA). */
  onTabKeydown(event: KeyboardEvent) {
    const last = this.tabs.length - 1;
    const next = { ArrowRight: this.tabIndex + 1, ArrowLeft: this.tabIndex - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = (next + this.tabs.length) % this.tabs.length;
    this.selectTab(this.tabs[index].id);
    const buttons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]');
    buttons[index]?.focus();
  }

  private flash(key: 'code' | 'avatar' | 'saved', ms: number) {
    const field = ({ code: 'codeCopied', avatar: 'avatarFresh', saved: 'justSaved' } as const)[key];
    this[field] = true;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this[field] = false, ms);
  }

  async copyFriendCode() {
    if (!this.friendCode) return;
    const copied = await copyText('#' + this.friendCode);
    if (copied) this.flash('code', 1800);
    else this.notificationService.info(`Tu código es #${this.friendCode}.`, 'La Taberna');
  }

  get maguitoChanged(): boolean {
    return !sameMaguitoColors(this.maguitoColors, this.savedMaguitoColors);
  }

  saveMaguitoColors() {
    if (!this.maguitoChanged || this.savingMaguito) return;
    this.savingMaguito = true;
    const colors = this.maguitoColors;
    this.maguitoTheme.save(colors).subscribe({
      next: outfit => {
        this.savingMaguito = false;
        this.outfit = outfit;
        this.savedMaguitoColors = colors;
        this.maguitoPicker?.celebrate();
        this.notificationService.success('Tus amigos ya ven a tu Maguito con este color.', 'Tu Maguito');
      },
      error: () => {
        this.savingMaguito = false;
        this.notificationService.error('No se pudo guardar el color. Inténtalo de nuevo.', 'Tu Maguito');
      },
    });
  }

  ngOnInit() {
    this.loadProfile();
    if (!this.isGuest) {
      // Si falla (p. ej. un servidor sin el control parental), el perfil sigue como siempre.
      this.parental.status().subscribe({
        next: status => this.guardianName = status.guardian ? (status.guardian.first_name || status.guardian.username) : '',
        error: () => {},
      });
    }
  }

  /** Cuenta de prueba: no tiene contraseña con qué eliminarla; cerrar sesión ya la borra. */
  get isGuest(): boolean {
    return !!this.authService.currentUser()?.is_guest;
  }

  logout() {
    this.authService.logout();
  }

  openDeleteAccount() {
    if (this.dialog.openDialogs.length) return;
    this.dialog.open<DeleteAccountDialogComponent, DeleteAccountDialogData>(DeleteAccountDialogComponent, {
      data: { email: this.authService.currentUser()?.email || '' },
      panelClass: 'account-dialog-panel',
      width: '480px',
      maxWidth: 'calc(100vw - 24px)',
      autoFocus: '#da-password',
      ariaLabelledBy: 'da-title',
    });
  }

  loadProfile() {
    this.api.get<any>('users/profile/').subscribe({
      next: (profile) => {
        if (profile) {
          const loadedUsername = profile.username || this.authService.currentUser()?.username || '';
          this.profileForm.patchValue({
            username: loadedUsername,
            email: this.authService.currentUser()?.email,
            tagline: profile.tagline || '',
            bio: profile.bio,
            country: profile.country,
            birth_date: profile.birth_date || '',
            is_public: profile.is_public !== false,
            show_friends: profile.show_friends !== false,
            show_books: profile.show_books !== false,
            show_reviews: profile.show_reviews !== false
          });
          const current = this.authService.currentUser();
          if (current && profile.username && current.username !== profile.username) {
            this.authService.setUser({ ...current, username: profile.username });
          }
          this.birthDateLocked = !!profile.birth_date;
          const birthDate = this.profileForm.get('birth_date');
          if (this.birthDateLocked) birthDate?.disable();
          else birthDate?.enable();
          this.friendCode = profile.friend_code || '';
          this.outfit = profile.outfit || {};
          this.maguitoColors = this.savedMaguitoColors = this.outfit.colors || null;
          this.avatarUrl = profile.avatar || null;
          this.avatarColor = profile.avatar_color || '#3b82f6';
          this.equippedFrame = profile.equipped_frame || '';
          this.equippedTitle = profile.equipped_title || '';
          this.maestroActive = !!profile.subscription_cosmetics?.maestro;
          this.updateInitials();
          if (profile.ink_balance !== undefined) {
            this.chatService.updateInkBalance(profile.ink_balance);
          }
          this.settingsService.applySavedTheme(profile.theme || 'default');
        }
      }
    });
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
          // La barra de guardar aparece sola: la foto queda en vista previa hasta "Guardar cambios".
          this.avatarUrl = canvas.toDataURL('image/jpeg', 0.88);
          this.profileForm.markAsDirty();
          this.flash('avatar', 700);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  removeAvatar() {
    this.avatarUrl = null;
    this.profileForm.markAsDirty();
    this.flash('avatar', 700);
  }

  selectAvatarColor(color: string) {
    if (color === this.avatarColor) return;
    this.avatarColor = color;
    this.profileForm.markAsDirty();
  }

  previewTheme(themeId: string) {
    if (themeId === this.selectedTheme) return;
    this.selectedTheme = themeId;
    this.settingsService.setThemeDirectly(themeId);
    this.profileForm.markAsDirty();
  }

  /** Vuelve a lo guardado: datos, foto, color y tema (loadProfile reaplica el tema del servidor). */
  discardChanges() {
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();
    this.loadProfile();
  }

  onSubmit() {
    if (this.profileForm.invalid) {
      if (this.profileForm.get('username')?.invalid) {
        this.notificationService.warning('Por favor ingresa un nombre de usuario válido (mínimo 3 caracteres).', 'Validación');
      }
      return;
    }
    this.loading = true;

    const newUsername = this.profileForm.get('username')?.value?.trim();

    const payload: Record<string, unknown> = {
      username: newUsername || '',
      tagline: this.profileForm.get('tagline')?.value || '',
      bio: this.profileForm.get('bio')?.value || '',
      country: this.profileForm.get('country')?.value || '',
      avatar: this.avatarUrl || '',
      avatar_color: this.avatarColor,
      theme: this.selectedTheme,
      is_public: this.profileForm.get('is_public')?.value !== false,
      show_friends: this.profileForm.get('show_friends')?.value !== false,
      show_books: this.profileForm.get('show_books')?.value !== false,
      show_reviews: this.profileForm.get('show_reviews')?.value !== false
    };
    const birthDate = this.profileForm.get('birth_date')?.value;
    if (!this.birthDateLocked && birthDate) payload['birth_date'] = birthDate;

    this.api.patch('users/profile/', payload).subscribe({
      next: (res: any) => {
        this.loading = false;
        const savedUsername = res?.username || newUsername;
        if (savedUsername) {
          const currentUser = this.authService.currentUser();
          if (currentUser) {
            this.authService.setUser({
              ...currentUser,
              username: savedUsername
            });
          }
        }
        this.updateInitials();
        this.profileForm.markAsPristine();
        this.flash('saved', 2200);
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
