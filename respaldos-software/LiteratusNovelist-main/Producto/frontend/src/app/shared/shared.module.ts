import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import {
  LucideSparkles, LucideFlame, LucideStar, LucideShoppingCart, LucideBookOpen, LucidePenTool,
  LucideLock, LucideLandmark, LucideShieldCheck, LucideCreditCard, LucideUser, LucideUsers,
  LucideLogOut, LucideBarChart2, LucideHome, LucideCheck, LucideX, LucideFileText,
  LucidePlus, LucidePlay, LucidePause, LucideSquare, LucideInfo, LucideSearch,
  LucideBookmark, LucideHelpCircle, LucideMessageSquare, LucidePackage, LucideCrown, LucideCheckCircle,
  LucideLibrary, LucideXCircle, LucideRefreshCcw, LucideMessageCircle, LucideClock, LucideVolume2,
  LucideEye, LucideEyeOff, LucideDownload, LucideLogIn, LucideVolumeX,
} from '@lucide/angular';

import { MaguitoComponent } from '../core/components/maguito/maguito.component';
import { AvatarFrameComponent } from '../core/components/avatar-frame/avatar-frame.component';
import { AudioVisualizerComponent } from '../core/components/audio-visualizer/audio-visualizer.component';
import { CosmeticPreviewComponent } from '../core/components/cosmetic-preview/cosmetic-preview.component';
import { AIUsageMeterComponent } from '../core/components/ai-usage-meter/ai-usage-meter.component';
import { InkDayPassComponent } from '../core/components/ink-day-pass/ink-day-pass.component';
import { ScrollRevealDirective } from '../core/directives/scroll-reveal.directive';
import { CountUpDirective } from '../core/directives/count-up.directive';
import { TiltDirective } from '../core/directives/tilt.directive';

const LUCIDE = [
  LucideSparkles, LucideFlame, LucideStar, LucideShoppingCart, LucideBookOpen, LucidePenTool,
  LucideLock, LucideLandmark, LucideShieldCheck, LucideCreditCard, LucideUser, LucideUsers,
  LucideLogOut, LucideBarChart2, LucideHome, LucideCheck, LucideX, LucideFileText,
  LucidePlus, LucidePlay, LucidePause, LucideSquare, LucideInfo, LucideSearch,
  LucideBookmark, LucideHelpCircle, LucideMessageSquare, LucidePackage, LucideCrown, LucideCheckCircle,
  LucideLibrary, LucideXCircle, LucideRefreshCcw, LucideMessageCircle, LucideClock, LucideVolume2,
  LucideEye, LucideEyeOff, LucideDownload, LucideLogIn, LucideVolumeX,
];

const SHARED_MODULES = [
  CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
  MatMenuModule, MatIconModule, MatButtonModule, MatDividerModule, MatDialogModule, MatSnackBarModule,
];

const SHARED_DECLARATIONS = [
  MaguitoComponent, AvatarFrameComponent, AudioVisualizerComponent, CosmeticPreviewComponent,
  ScrollRevealDirective, CountUpDirective, TiltDirective,
];

/**
 * Lo que usan a la vez la estructura de la app (encabezado, pie) y las páginas que se cargan
 * al abrirlas (lector, La Taberna, juegos, personajes, compras, cuenta). Cada módulo de página
 * importa este en vez de repetir la lista.
 */
@NgModule({
  declarations: SHARED_DECLARATIONS,
  imports: [...SHARED_MODULES, ...LUCIDE, AIUsageMeterComponent, InkDayPassComponent],
  exports: [...SHARED_MODULES, ...LUCIDE, AIUsageMeterComponent, InkDayPassComponent, ...SHARED_DECLARATIONS],
})
export class SharedModule {}
