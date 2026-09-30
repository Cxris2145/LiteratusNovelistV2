import { Component, OnInit, inject, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone, HostListener, ViewChild, ElementRef } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AudioService } from '../../core/services/audio.service';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import lottie from 'lottie-web';
import { environment } from '../../../environments/environment';
import { KokoroTtsService } from '../../core/services/kokoro-tts.service';
import { ChatService } from '../../core/services/chat.service';
import { SpeechRecognitionService } from '../../core/services/speech-recognition.service';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { WasmTtsService } from '../../core/services/wasm-tts.service';
import { NativeTtsService } from '../../core/services/native-tts.service';
import { StatusBar } from '@capacitor/status-bar';
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar';
import { Capacitor } from '@capacitor/core';
import { ReadingSessionService } from '../../core/services/reading-session.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ReaderTabsService } from '../../core/services/reader-tabs.service';
import { ReaderBlock, parseChapterBlocks } from '../../core/utils/chapter-parser.util';
import { VocabularyJump } from './vocabulary-panel/vocabulary-panel.component';

export interface ProgressData {
  percentage: number;
  wordId: string;
  timestamp: number;
  scrollPercent?: number;
}

/** Marcador de página guardado en el backend (UserBookmark). */
interface PageBookmark {
  id: string;
  chapterId: string;
  chapterIndex: number;
  /** Primera palabra visible de la página marcada (`word-N`). */
  wordIdx: number;
  snippet: string;
  createdAt: string;
  /** "Pág. 34": se calcula al abrir el índice (medir cada vez que Angular revisa la vista sería caro). */
  pageLabel?: string;
}

@Component({
  selector: 'app-reader',
  templateUrl: './reader.component.html',
  // La vista libro (tapa, papel, barras, línea del libro, índice con marcadores) va aparte.
  styleUrls: ['./reader.component.css', './reader-book.component.css'],
  animations: [
    // Panel TOC (derecha) y Panel de Personajes (izquierda)
    trigger('slideFromRight', [
      state('in', style({ transform: 'translateX(0%)' })),
      state('out', style({ transform: 'translateX(100%)' })),
      transition('in <=> out', animate('350ms ease-in-out')),
    ]),
    trigger('slideFromLeft', [
      state('in', style({ transform: 'translateX(0%)' })),
      state('out', style({ transform: 'translateX(-100%)' })),
      transition('in <=> out', animate('350ms ease-in-out')),
    ]),
  ]
})
export class ReaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  public audioService = inject(AudioService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  public kokoroVoice = inject(KokoroTtsService);
  public chatService = inject(ChatService);
  public speechService = inject(SpeechRecognitionService);
  public wasmVoice = inject(WasmTtsService);
  public nativeTts = inject(NativeTtsService);
  private readingSession = inject(ReadingSessionService);
  private favorites = inject(FavoritesService);
  private readerTabs = inject(ReaderTabsService);

  // ── LECTURA ──────────────────────────────────────────────────────

  inventoryId: string = '';
  currentPage: number = 1;
  totalPages: number = 1;
  chapters: any[] = [];
  safeChapterHtml: SafeHtml = '';
  chapterTitle: string = 'Cargando libro...';
  bookTitle: string = 'Cargando...';
  authorName: string = '';
  bookSlug: string = '';
  hasPremiumNarration: boolean = false;
  progressId: number | null = null;

  // ── VISTA DE DOBLE PÁGINA (LIBRO REAL) ─────────────────────────
  // El texto del capítulo corre en columnas CSS (una por página) y cada pliego es un
  // desplazamiento horizontal de .reading-canvas; el lomo es el column-gap.
  isDoublePageView: boolean = true;
  currentSpreadIndex: number = 0;
  totalSpreads: number = 1;
  currentLeftPageNum: number = 1;
  currentRightPageNum: number = 2;
  isPageFlipping: boolean = false;
  flipDirection: 'next' | 'prev' = 'next';
  /** Páginas visibles a la vez: 2 en escritorio, 1 en pantallas angostas. */
  columnsPerSpread: number = 2;
  /** Pliego a mostrar cuando termine de renderizarse el capítulo (Infinity = el último). */
  private pendingSpreadIndex: number | null = null;
  /** Igual, pero como fracción del capítulo (al reanudar el progreso guardado). */
  private pendingSpreadFraction: number | null = null;

  // ── LÍNEA DEL LIBRO (deslizador de páginas de todo el libro) ─────
  // Solo el capítulo abierto está maquetado: sus páginas son exactas y las del resto se
  // estiman por los renglones de sus párrafos (ver recomputeBookPages).
  bookPageCurrent: number = 1;
  bookPageTotal: number = 1;
  sliderPreviewLabel: string = '';
  /** Página bajo el dedo mientras se arrastra la línea del libro (null si no se arrastra). */
  private sliderDragPage: number | null = null;
  private chapterTextLengths: number[] = [];
  private chapterParagraphLengths: number[][] = [];
  private chapterPageEstimates: number[] = [];
  chapterStartPages: number[] = [];
  /** Páginas exactas de los capítulos ya maquetados con la letra y el ancho actuales. */
  private measuredChapterPages = new Map<number, number>();
  private measuredLayoutKey: string = '';

  // ── MARCADORES DE PÁGINA ─────────────────────────────────────────
  bookmarks: PageBookmark[] = [];
  currentSpreadBookmark: PageBookmark | null = null;
  isBookmarkBusy: boolean = false;
  tocTab: 'chapters' | 'bookmarks' = 'chapters';
  bookmarkToastText: string = '';
  private bookmarkToastTimer: any = null;

  toastIcon: string = '🔖';
  bookmarkResumeLabel: string = 'Reanudando marcador en';
  private nextJumpLabel: string = '';
  /** Primera palabra de la página a la vista: al cambiar la letra se vuelve a ella. */
  private spreadAnchorWord: number = -1;
  private flipTimer: any = null;
  private relayoutTimer: any = null;
  private visibleRefreshRaf: number | null = null;

  // ── VOCABULARIO, FAVORITO Y PESTAÑA ──────────────────────────────
  isVocabularyOpen: boolean = false;
  bookCover: string | null = null;

  /** Pestaña que baja línea a línea por el margen mientras habla la narración. */
  @ViewChild('narrationMarker') narrationMarkerRef?: ElementRef<HTMLElement>;
  /** Palabra que está leyendo la narración (-1 si no hay narración en curso). */
  private narrationWordIdx: number = -1;

  // ── UX ───────────────────────────────────────────────────────────
  readonly FONT_MIN = 14;
  readonly FONT_MAX = 32;
  readonly DEFAULT_FONT_SIZE = 20;
  fontSize: number = this.DEFAULT_FONT_SIZE;
  currentTheme: 'dark' | 'light' | 'sepia' | 'nocturno' | 'gris' = 'light';
  // Por defecto, el aspecto de un libro impreso: Times, justificado y con sangría.
  currentFontFamily: 'times' | 'literata' | 'merriweather' | 'garamond' | 'georgia' | 'palatino' | 'outfit' | 'opensans' | 'atkinson' | 'lexend' | 'opendyslexic' | 'cinzel' = 'times';
  isTocOpen: boolean = false;
  lastScrollTop: number = 0;
  isToolbarHidden: boolean = false;
  hideProgressOnScroll: boolean = false;
  bionicReadingActive: boolean = false;
  tapToScrollActive: boolean = false;
  showSceneImages: boolean = true;

  // ── HOJA "Aa" — Ajustes de lectura ───────────────────────────────
  isSettingsOpen: boolean = false;
  settingsTab: 'texto' | 'apariencia' | 'enfoque' = 'texto';
  lineHeight: number = 1.4;                                    // 1.4 (libro) | 1.5 | 1.75 | 2
  readingWidth: 'narrow' | 'medium' | 'wide' = 'medium';
  textAlign: 'left' | 'justify' = 'justify';
  paraSpacing: 'tight' | 'normal' | 'relaxed' = 'tight';       // sin espacio (con sangría) | 1 renglón | 2 renglones
  letterSpacing: number = 0;                                   // em, -0.01 – 0.08
  highContrast: boolean = false;                               // Accesibilidad
  concentrationMode: boolean = false;                          // Enfoque: oculta cromo secundario
  brightness: number = 1;                                      // 0.75 – 1.1
  wordSpacing: number = 0;                                     // em, 0 – 0.6

  // ── LECTURA ASISTIDA (TDAH / neurodivergencias) ──────────────────
  focusMode: 'off' | 'word' | 'sentence' | 'paragraph' = 'off'; // atenúa todo salvo la unidad activa
  rulerActive: boolean = false;                                 // regla horizontal que sigue la línea activa
  rulerY: number = -1000;                                       // posición vertical (px, relativa al canvas) de la regla; fuera de vista por defecto
  rulerColumn: 'left' | 'right' | 'full' = 'full';              // columna activa para vista de doble página
  /** Renglones por página en vista libro: los que caben en el alto disponible (ver fitLinesToPage). */
  linesPerPage: number = 17;
  /** Líneas visibles del capítulo separadas por columna para precisión absoluta */
  private rulerLinesLeft: { top: number; bottom: number; center: number }[] = [];
  private rulerLinesRight: { top: number; bottom: number; center: number }[] = [];
  private rulerLinesAll: { top: number; bottom: number; center: number }[] = [];
  private rulerLineIndex: number = -1;
  private rulerCanvasEl: HTMLElement | null = null;
  private rulerRafId: number | null = null;
  private pendingRulerClientX: number | null = null;
  private pendingRulerClientY: number | null = null;
  readonly highlightColorOptions: { id: 'gold' | 'blue' | 'green' | 'pink'; label: string; hex: string }[] = [
    { id: 'gold', label: 'Dorado', hex: '#eab308' },
    { id: 'blue', label: 'Azul', hex: '#3b82f6' },
    { id: 'green', label: 'Verde', hex: '#22c55e' },
    { id: 'pink', label: 'Rosa', hex: '#ec4899' },
  ];
  highlightColor: 'gold' | 'blue' | 'green' | 'pink' = 'gold';
  longParaSplit: boolean = false;                               // divide visualmente párrafos largos
  private readonly LONG_PARA_CHARS = 420;                       // umbral para considerar un párrafo "largo"

  // Avance automático (auto-scroll tipo teleprompter)
  autoScrollActive: boolean = false;
  autoScrollSpeed: number = 35;                                 // px/segundo, 10–120
  private autoScrollRafId: number | null = null;
  private autoScrollLastTs: number = 0;

  // Temporizador de sesión + recordatorio de pausa
  readonly sessionTimerOptions: number[] = [0, 15, 25, 45];     // minutos; 0 = desactivado
  sessionTimerMinutes: number = 0;
  sessionTimeRemainingSec: number = 0;
  sessionTimerRunning: boolean = false;
  showBreakModal: boolean = false;
  private sessionTimerInterval: any = null;

  // Botón flotante "volver a mi lectura" — aparece si el usuario se aleja
  // de su posición de lectura (scroll manual, exploración) más allá de lo visible.
  showBackToReadingBtn: boolean = false;

  readonly fontOptions: { id: ReaderComponent['currentFontFamily']; label: string; group: string; note?: string }[] = [
    { id: 'times', label: 'Times', group: 'Clásicas', note: 'Times New Roman, la de los libros impresos' },
    { id: 'literata', label: 'Literata', group: 'Clásicas', note: 'Diseñada para leer libros en pantalla' },
    { id: 'merriweather', label: 'Merriweather', group: 'Clásicas' },
    { id: 'garamond', label: 'Garamond', group: 'Clásicas' },
    { id: 'georgia', label: 'Georgia', group: 'Clásicas' },
    { id: 'palatino', label: 'Palatino', group: 'Clásicas' },
    { id: 'outfit', label: 'Outfit', group: 'Modernas' },
    { id: 'opensans', label: 'Open Sans', group: 'Modernas' },
    { id: 'atkinson', label: 'Alta legibilidad', group: 'Accesibilidad', note: 'Atkinson Hyperlegible' },
    { id: 'lexend', label: 'Lexend', group: 'Accesibilidad' },
    { id: 'opendyslexic', label: 'OpenDyslexic', group: 'Accesibilidad', note: 'Diseñada para dislexia' },
    { id: 'cinzel', label: 'Cinzel', group: 'Literaria', note: 'Mejor para títulos' },
  ];
  /** Grupos de tipografías — PRECOMPUTADO (no getter): un getter en *ngFor
   *  devuelve arrays nuevos en cada ciclo de detección de cambios y Angular
   *  destruye+recrea todos los botones, tragándose el click (mousedown y mouseup
   *  caen en elementos distintos). fontOptions es readonly, así que esto es fijo. */
  readonly fontGroups: { name: string; fonts: ReaderComponent['fontOptions'] }[] =
    ['Clásicas', 'Modernas', 'Accesibilidad', 'Literaria']
      .map(name => ({ name, fonts: this.fontOptions.filter(f => f.group === name) }))
      .filter(g => g.fonts.length > 0);

  trackFont = (_: number, f: { id: string }) => f.id;
  trackGroup = (_: number, g: { name: string }) => g.name;
  /** Migración de ids antiguos de reader-font-family (compat retro). */
  private readonly FONT_ID_MIGRATION: Record<string, ReaderComponent['currentFontFamily']> = {
    serif: 'merriweather', sans: 'outfit', dyslexic: 'atkinson', medieval: 'cinzel',
    helvetica: 'opensans', garamond: 'garamond', georgia: 'georgia',
    palatino: 'palatino', opensans: 'opensans',
  };

  readonly themeOptions: { id: ReaderComponent['currentTheme']; label: string }[] = [
    { id: 'light', label: 'Claro' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'gris', label: 'Gris suave' },
    { id: 'dark', label: 'Oscuro' },
    { id: 'nocturno', label: 'OLED' },
  ];

  // ── PERSONAJES / CHAT ─────────────────────────────────────────────
  isCharPanelOpen: boolean = false;
  avatars: any[] = [];
  selectedAvatar: any = null;
  showCharProfile: boolean = false;
  isKokoroProcessing = false;
  engineMode$ = this.kokoroVoice.engineMode$;
  kokoroDownloading$ = this.kokoroVoice.isDownloadingModel$;
  kokoroProgress$ = this.kokoroVoice.downloadProgress$;

  toggleKokoroEngine() {
    if (this.kokoroVoice.engineMode$.value === 'local') {
      this.kokoroVoice.setRemoteEngine();
    } else {
      const confirmed = window.confirm('⚠️ Nota: La voz neuronal local descarga un modelo de IA en tu navegador.\n\nSe recomienda tener un equipo con tarjeta gráfica dedicada (GPU) para evitar lentitud. ¿Estás seguro de que deseas continuar y activar el motor local?');
      if (confirmed) {
        this.kokoroVoice.downloadLocalEngine();
      }
    }
  }

  toggleSceneImages() {
    this.showSceneImages = !this.showSceneImages;
    localStorage.setItem('reader-show-images', String(this.showSceneImages));
  }

  setAudioMode(mode: 'native' | 'pro' | 'kokoro' | 'wasm' | 'native-android') {
    if (this.currentAudioMode !== mode) {
      this.stopAudio(true);
      this.currentAudioMode = mode;
    }
  }

  // Getters para separar autor de personajes en el panel
  get authorAvatar(): any {
    return this.avatars.find(a => a.is_author) || null;
  }
  get characterAvatars(): any[] {
    return this.avatars.filter(a => !a.is_author);
  }

  // Chat
  isChatOpen: boolean = false;
  chatSession: any = null;
  chatMessages: any[] = [];
  chatInput: string = '';
  isSendingMessage: boolean = false;
  inkBalance: number = 0;

  // Audio Control
  currentAudioMode: 'native' | 'pro' | 'kokoro' | 'wasm' | 'native-android' = 'native';
  currentWordIndex: number = -1;
  isAudioLoading: boolean = false;
  // Voz neural: aviso visible mientras el servidor genera el capítulo (o si no está disponible)
  narrationNotice: string = '';
  private narrationNoticeTimer: any = null;
  private narrationPollTimer: any = null;
  private narrationRequestId = 0;
  private readonly NARRATION_POLL_MS = 3000;
  private readonly NARRATION_MAX_POLLS = 200; // ~10 minutos
  // WasmTTS (Piper) Voces - Solo dejamos MMS porque Piper no tiene port oficial Web
  wasmVoices = [
    { id: 'Xenova/mms-tts-spa', name: 'MMS Español (Meta) - Pesado' }
  ];

  // Detección de dispositivo móvil
  isMobile: boolean = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Configuración de la Novela
  chapterId: string | null = null;
  isAudioPanelOpen: boolean = false;
  currentChapterPlainText: string = '';
  proErrorMessage: string = '';  // Mensaje de error Pro (no usa alert)
  isFullyRendered: boolean = false; // Bloquea guardado de progreso hasta que todo el DOM exista

  // Economía de Tinta: desbloqueo PERMANENTE de Voz Premium
  readonly PREMIUM_VOICE_INK_COST = 200;  // Coste único de desbloqueo
  isUnlocking: boolean = false;          // Spinner durante transacción

  // Renderizado de palabras (para highlighting nativo de Angular)
  parsedBlocks: ReaderBlock[] = [];
  renderedBlocks: ReaderBlock[] = [];
  titleTokens: any[] = [];
  private totalWordCount: number = 0;

  // ── VOZ Y LLAMADA ────────────────────────────────────────────────
  isCallMode: boolean = false;
  audioLevel: number = 0;
  partialTranscript: string = '';

  private saveProgressSubject = new Subject<number>();
  private destroy$ = new Subject<void>();
  private savedProgressData: ProgressData | null = null;

  chapterScrollPercent: number = 0;
  isNearEnd: boolean = false;
  showBookmarkToast: boolean = false;

  // Resaltado temporal de marcador al reanudar lectura (5 segundos)
  private bookmarkHighlightTimer: any = null;
  private activeBookmarkEl: HTMLElement | null = null;
  public showBookmarkResumeBadge: boolean = false;
  public bookmarkResumeWordText: string = '';

  // Modal para ver imágenes
  showImageModal: boolean = false;
  modalImageSrc: string = '';

  // Modal para reiniciar audio
  showRestartModal: boolean = false;
  lastAudioWordIndex: number = 0;

  // Video Avatar / Manga Avatar
  @ViewChild('avatarVideo') avatarVideoElement!: ElementRef<HTMLVideoElement>;
  showVideoAvatar: boolean = false;
  isVideoSpeaking: boolean = false;
  activeTalkingFrame: number = 1;
  activeThinkingFrame: number = 1;
  private talkingInterval: any;
  private thinkingInterval: any;

  // Estado IA
  aiProvider: string = 'gemini'; // 'gemini', 'deepseek', 'none'
  aiStatus: 'ok' | 'warning' | 'error' = 'ok';

  isInitialDataLoaded = false;
  isLoadingInitialData = false;
  isOverlayActive = true;

  // Screen Wake Lock
  private wakeLock: any = null;
  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      await this.requestWakeLock();
    }
  };

  // Maguito en la pantalla de carga: la animación la hace <app-maguito> (state="loading");
  // aquí solo rotan los textos. Tocar a Maguito pasa al siguiente.
  mascotPoseIndex = 0;
  private loadingTipInterval?: any;

  readonly mascotPoses = [
    { tip: 'Trazando las runas y constelaciones del relato...', sub: 'Dibujando magia en el aire' },
    { tip: 'Revisando los primeros párrafos en el gran libro...', sub: 'Consultando el manuscrito' },
    { tip: '¡Hola! Maguito te saluda, casi todo está listo...', sub: 'Saludando al lector' },
    { tip: 'Invocando los arcanos y la sabiduría literaria...', sub: 'Concentrando energía mágica' },
  ];

  get currentMascotPose() {
    return this.mascotPoses[this.mascotPoseIndex];
  }

  onMascotClick(): void {
    this.mascotPoseIndex = (this.mascotPoseIndex + 1) % this.mascotPoses.length;
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.inventoryId = this.route.snapshot.paramMap.get('id') || '';

    // Mientras carga, los textos de Maguito van cambiando
    this.loadingTipInterval = setInterval(() => {
      if (this.isOverlayActive) this.onMascotClick();
    }, 3800);

    // Pedir Wake Lock para mantener la pantalla encendida
    this.requestWakeLock();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Activar modo inmersivo nativo de OS apenas entra al lector
    this.toggleImmersiveMode(true);

    this.saveProgressSubject.pipe(debounceTime(3000)).subscribe(p => this.syncProgressToBackend(p));

    this.loadInitialData();
    this.loadInkBalance();

    const savedFont = localStorage.getItem('reader-font-family');
    if (savedFont) {
      const validNew = this.fontOptions.map(f => f.id) as string[];
      if (validNew.includes(savedFont)) {
        this.currentFontFamily = savedFont as any;
      } else if (this.FONT_ID_MIGRATION[savedFont]) {
        this.currentFontFamily = this.FONT_ID_MIGRATION[savedFont];
        localStorage.setItem('reader-font-family', this.currentFontFamily); // migrar la clave
      }
    }

    const savedTheme = localStorage.getItem('reader-theme');
    const validThemes = ['dark', 'light', 'sepia', 'nocturno', 'gris'];
    if (savedTheme && validThemes.includes(savedTheme)) {
      this.currentTheme = savedTheme as any;
    }

    const savedDoublePage = localStorage.getItem('reader-double-page');
    this.isDoublePageView = savedDoublePage !== null ? savedDoublePage === 'true' : true;

    const savedFontSize = localStorage.getItem('reader-font-size');
    if (savedFontSize) {
      const parsedSize = parseInt(savedFontSize, 10);
      if (!isNaN(parsedSize) && parsedSize >= this.FONT_MIN && parsedSize <= this.FONT_MAX) {
        this.fontSize = parsedSize;
      } else if (!isNaN(parsedSize)) {
        this.fontSize = Math.min(this.FONT_MAX, Math.max(this.FONT_MIN, parsedSize)); // reencuadrar 12→14
      }
    }

    // Aplicar las variables CSS ahora que cargamos de localStorage
    this.applyTheme();
    this.applyFontSize();
    this.loadReaderPrefs();

    const savedHide = localStorage.getItem('reader-hide-progress');
    if (savedHide !== null) {
      this.hideProgressOnScroll = savedHide === 'true';
    }

    const savedBionic = localStorage.getItem('reader-bionic-reading');
    if (savedBionic !== null) {
      this.bionicReadingActive = savedBionic === 'true';
    }

    const savedShowImages = localStorage.getItem('reader-show-images');
    if (savedShowImages !== null) {
      this.showSceneImages = savedShowImages === 'true';
    }

    // Auto-abrir chat si venimos redirigidos por un personaje
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const avatarId = params['chatWith'];
      if (avatarId) {
        // Esperar a que los avatares carguen para poder iniciar el chat
        const checkAvatars = setInterval(() => {
          if (this.avatars && this.avatars.length > 0) {
            clearInterval(checkAvatars);
            // Usar toString() para comparar UUIDs de forma segura
            const avatar = this.avatars.find(a => String(a.id) === String(avatarId));
            if (avatar) {
              this.startChat(avatar);
            } else {
              console.warn(`Avatar con ID ${avatarId} no encontrado.`);
            }
          }
        }, 200);
        // Timeout de seguridad de 10 segundos
        setTimeout(() => clearInterval(checkAvatars), 10000);
      }
    });

    // Resaltado: escuchar el word index del AudioService (Nativo y Voz Neural)
    this.audioService.currentWordIndex$.pipe(takeUntil(this.destroy$)).subscribe(idx => {
      if (this.currentAudioMode === 'native' || this.currentAudioMode === 'pro') {
        this.onNarrationWord(idx);
      }
    });

    // Resaltado: escuchar el word index de WasmTTS (Piper)
    this.wasmVoice.currentWordIndex$.pipe(takeUntil(this.destroy$)).subscribe(idx => {
      if (this.currentAudioMode === 'wasm') {
        this.onNarrationWord(idx);
      }
    });

    // Suscripciones de Reconocimiento de Voz
    this.speechService.transcript$.pipe(takeUntil(this.destroy$)).subscribe(text => {
      if (text) {
        this.chatInput = text;
        this.sendMessage();
      }
    });

    this.speechService.partialTranscript$.pipe(takeUntil(this.destroy$)).subscribe(text => {
      this.partialTranscript = text;
      this.cdr.detectChanges();
    });

    this.speechService.audioLevel$.pipe(takeUntil(this.destroy$)).subscribe(level => {
      this.audioLevel = level;
      this.cdr.detectChanges();
    });

    this.kokoroVoice.isProcessing$.pipe(takeUntil(this.destroy$)).subscribe(isProc => {
      this.isKokoroProcessing = isProc;
      this.cdr.detectChanges();
    });

    // Sincronizar Avatar animado con KokoroVoice
    this.kokoroVoice.isSpeaking$.pipe(takeUntil(this.destroy$)).subscribe(isSpeaking => {
      this.isVideoSpeaking = isSpeaking;
      if (isSpeaking) {
        if (!this.talkingInterval) {
          this.talkingInterval = setInterval(() => {
            this.activeTalkingFrame = Math.floor(Math.random() * 3) + 1;
            this.cdr.detectChanges();
          }, 2000); // Cambia el frame de manga cada 2s
        }
      } else {
        if (this.talkingInterval) {
          clearInterval(this.talkingInterval);
          this.talkingInterval = null;
        }
      }

      if (this.isCallMode && this.avatarVideoElement?.nativeElement) {
        const video = this.avatarVideoElement.nativeElement;
        if (isSpeaking) {
          video.currentTime = 1;
          video.play();
          video.ontimeupdate = () => {
            if (video.currentTime >= 6) video.currentTime = 1;
          };
        } else {
          video.pause();
          video.currentTime = 0;
          video.ontimeupdate = null;
        }
      }
      this.cdr.detectChanges();
    });

    // Resaltado: escuchar el word index del KokoroVoice
    this.kokoroVoice.currentWordIndex$.pipe(takeUntil(this.destroy$)).subscribe(idx => {
      if (this.currentAudioMode === 'kokoro' && !this.isChatOpen) {
        this.onNarrationWord(idx);
      }
    });

    // Resaltado: escuchar el word index del NativeTts Capacitor
    this.nativeTts.currentWordIndex$.pipe(takeUntil(this.destroy$)).subscribe(idx => {
      if (this.currentAudioMode === 'native-android' && !this.isChatOpen) {
        this.onNarrationWord(idx);
      }
    });

    // Suscribirse a la tinta global
    this.chatService.inkBalance$.pipe(takeUntil(this.destroy$)).subscribe(balance => {
      this.inkBalance = balance;
      this.cdr.detectChanges();
    });


    // Auto-avance de capítulo cuando termina la narración
    this.audioService.chapterEnd$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.lastAudioWordIndex = 0;
      this.saveAudioPosition(); // Guardar antes de avanzar
      if (this.currentPage < this.totalPages) {
        setTimeout(() => {
          this.currentPage++;
          // El capítulo nuevo empieza en su primera página (en vista libro, no en el
          // pliego donde terminó el anterior: la voz partiría desde la mitad).
          this.currentSpreadIndex = 0;
          this.pendingSpreadIndex = null;
          this.pendingSpreadFraction = null;
          this.parseAndRenderChapter();
          this.saveProgressSubject.next(this.currentPage - 1);
          // Iniciar narración del siguiente capítulo automáticamente
          setTimeout(() => this.playAudio(), 600);
        }, 500);
      }
    });

    // Guardar posición al cerrar/salir
    window.addEventListener('beforeunload', () => this.saveAudioPosition());
  }

  ngAfterViewInit() {
    // El seguimiento de la regla de lectura se engancha fuera de la zona de Angular:
    // mousemove dispara decenas de eventos por segundo y, dentro de la zona, cada
    // uno forzaría un ciclo completo de detección de cambios sobre toda la página
    // (cientos de spans .word ya enlazados) — eso es lo que causaba el lag. Aquí
    // se mueve el DOM directamente y sólo se actualiza `rulerY` para que el binding
    // quede consistente si Angular vuelve a renderizar por otro motivo.
    this.ngZone.runOutsideAngular(() => {
      const canvas = document.querySelector('.reading-canvas') as HTMLElement | null;
      if (!canvas) return;
      this.rulerCanvasEl = canvas;
      canvas.addEventListener('mousemove', this.handleRulerMouseMove);
      canvas.addEventListener('mouseleave', this.handleRulerMouseLeave);
    });
  }

  loadInitialData() {
    if (this.isInitialDataLoaded || this.isLoadingInitialData) return;
    this.isLoadingInitialData = true;

    this.api.get<any>(`library/inventory/${this.inventoryId}/`).subscribe({
      next: (inventory) => {
        this.isLoadingInitialData = false;
        this.isInitialDataLoaded = true;
        if (inventory && inventory.progress) {
          this.bookTitle = inventory.book_title || inventory.edition?.book?.title || 'Libro';
          this.authorName = inventory.author_name || inventory.edition?.book?.author_name || '';
          this.currentPage = inventory.progress.current_page || 1;
          this.progressId = inventory.progress.id;
          this.bookSlug = inventory.book_slug;
          this.bookCover = inventory.book_cover || null;
          this.readerTabs.open({ id: this.inventoryId, title: this.bookTitle, author: this.authorName, cover: this.bookCover });

          if (inventory.progress.current_cfi) {
            try {
              this.savedProgressData = JSON.parse(inventory.progress.current_cfi);
            } catch (e) {
              // Legacy cfi
            }
          }
        }

        // Respaldo local de marcador para garantizar sincronización inmediata
        try {
          const localSaved = localStorage.getItem(`bookmark_resume_${this.inventoryId}`);
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (parsed && parsed.wordId) {
              if (!this.savedProgressData) {
                this.savedProgressData = {
                  percentage: 0,
                  wordId: parsed.wordId,
                  timestamp: parsed.timestamp || Date.now()
                };
              } else if (!this.savedProgressData.wordId) {
                this.savedProgressData.wordId = parsed.wordId;
              }
              if (parsed.page && (!inventory || !inventory.progress || !inventory.progress.current_page)) {
                this.currentPage = parsed.page;
              }
            }
          }
        } catch (e) {
          console.warn('Error leyendo marcador local', e);
        }

        // Guardar book ID para el tracking de sesión de logros
        this._bookIdForSession = inventory.edition?.book?.id || null;

        this.loadChapters();

        // Iniciar sesión de lectura para el motor de logros.
        // Se hace DESPUÉS de cargar datos para tener el book ID disponible.
        if (this._bookIdForSession) {
          this.readingSession.startSession(this._bookIdForSession);
        }
      },
      error: (err) => {
        console.error('Error cargando inventario', err);
        this.router.navigate(['/catalog']);
      }
    });
  }

  /** Book UUID para el tracking de sesión de logros */
  private _bookIdForSession: string | null = null;

  ngOnDestroy() {
    if (this.rulerCanvasEl) {
      this.rulerCanvasEl.removeEventListener('mousemove', this.handleRulerMouseMove);
      this.rulerCanvasEl.removeEventListener('mouseleave', this.handleRulerMouseLeave);
      this.rulerCanvasEl = null;
    }
    if (this.rulerRafId !== null) {
      cancelAnimationFrame(this.rulerRafId);
      this.rulerRafId = null;
    }
    this.clearBookmarkHighlight();
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.cancelNarrationRequest();
    clearTimeout(this.narrationNoticeTimer);
    this.audioService.stop();
    this.stopCallMode();
    this.kokoroVoice.stop();
    this.saveAudioPosition();
    this.stopThinkingAnimation();
    this.stopAutoScroll();
    this.clearSessionInterval();
    clearInterval(this.loadingTipInterval);
    clearTimeout(this.flipTimer);
    clearTimeout(this.relayoutTimer);
    clearTimeout(this.bookmarkToastTimer);
    if (this.loadingTipInterval) clearInterval(this.loadingTipInterval);
    if (this.visibleRefreshRaf !== null) cancelAnimationFrame(this.visibleRefreshRaf);

    // Restaurar las barras del OS al salir del lector
    this.toggleImmersiveMode(false);

    // Cerrar sesión de lectura para el motor de logros
    this.readingSession.endSession();

    this.destroy$.next();
    this.destroy$.complete();
  }

  private async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          // El lock se libera automáticamente si el navegador se oculta
        });
      }
    } catch (err: any) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock !== null) {
      this.wakeLock.release().catch(() => { }).finally(() => {
        this.wakeLock = null;
      });
    }
  }

  onCanvasScroll(event: any) {
    if (!this.isFullyRendered) return; // IGNORAR SCROLL HASTA QUE SE TERMINE DE RENDERIZAR TODO PARA NO SOBRESCRIBIR EL PROGRESO

    this.invalidateRulerLines(); // barato (sólo vacía el arreglo); el recálculo real es perezoso
    // En vista libro el lienzo solo se desplaza al cambiar de pliego, y ese progreso ya lo
    // guarda updateSpreadProgress(): medirlo aquí como scroll vertical lo pisaría con un 0.
    if (this.isDoublePageView) return;
    this.updateNarrationMarker();
    this.scheduleVisibleRefresh();
    const el = event.target;
    const currentScrollTop = el.scrollTop;

    // Ocultar/mostrar barra superior al hacer scroll
    if (currentScrollTop > this.lastScrollTop && currentScrollTop > 50) {
      // Scroll hacia abajo
      if (!this.isToolbarHidden) {
        this.isToolbarHidden = true;
      }
    } else {
      // Scroll hacia arriba
      if (this.isToolbarHidden) {
        this.isToolbarHidden = false;
      }
    }
    this.lastScrollTop = currentScrollTop;

    // Calcular porcentaje de scroll del contenedor actual
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const scrollPercent = scrollHeight > 0 ? currentScrollTop / scrollHeight : 0;

    // Actualizar barra de progreso visual y botón "Siguiente"
    this.chapterScrollPercent = Math.min(100, Math.max(0, scrollPercent * 100));
    this.isNearEnd = scrollPercent >= 0.98 || (scrollHeight - currentScrollTop) < 50 || scrollHeight <= 50;

    // Calcular página decimal exacta (ej. 1.5 significa mitad de capítulo 1)
    const exactPage = (this.currentPage - 1) + scrollPercent;

    // No guardamos palabra aquí, solo porcentaje exacto
    this.saveProgressSubject.next(exactPage);

    this.checkBackToReadingVisibility();
  }

  checkIfNearEnd() {
    const el = document.querySelector('.reading-canvas');
    if (el) {
      const scrollHeight = el.scrollHeight - el.clientHeight;
      this.isNearEnd = (scrollHeight <= 50) || ((scrollHeight - el.scrollTop) < 50);
    }
  }

  // Activa o desactiva el modo inmersivo nativo (Oculta Status Bar en Android)
  async toggleImmersiveMode(active: boolean) {
    if (Capacitor.isNativePlatform()) {
      try {
        if (active) {
          await StatusBar.setOverlaysWebView({ overlay: true });
          await StatusBar.hide();
          await NavigationBar.hide();
        } else {
          await StatusBar.show();
          await StatusBar.setOverlaysWebView({ overlay: false });
          await NavigationBar.show();
        }
      } catch (err) {
        console.warn('Plugins not fully supported', err);
      }
    }

    // Intentar Web Fullscreen (oculta también la barra de navegación en Android)
    try {
      if (active && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!active && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) { }
  }

  onCanvasClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Ignorar si el usuario clickeó en un elemento interactivo (palabra, imagen, botón)
    if (target.closest('.word') || target.closest('img') || target.closest('button')) {
      return;
    }

    // En vista de libro real (doble página), clic en los extremos izquierdo/derecho pasa página
    if (this.isDoublePageView) {
      const container = (event.currentTarget as HTMLElement) || target;
      const rect = container.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const width = rect.width;
      if (clickX < width * 0.20) {
        this.turnSpreadPrev();
        return;
      } else if (clickX > width * 0.80) {
        this.turnSpreadNext();
        return;
      }
    }

    // Si no está activado el Toque Fluido, no hacer nada al tocar pantalla vacía
    if (!this.tapToScrollActive) {
      return;
    }

    // Scrollear hacia abajo 90% de la altura visible, para simular un "pasa página" natural
    const el = document.querySelector('.reading-canvas') as HTMLElement;
    if (el) {
      const scrollHeight = el.scrollHeight - el.clientHeight;
      // Si no estamos al final, hacer page down
      if (el.scrollTop < scrollHeight - 10) {

        // 1. Identificar el último bloque visible en la pantalla actual
        const canvasRect = el.getBoundingClientRect();
        const blocks = Array.from(el.querySelectorAll('p, h1, h2, h3, figure'));
        let targetBlock: HTMLElement | null = null;

        for (let i = blocks.length - 1; i >= 0; i--) {
          const rect = blocks[i].getBoundingClientRect();
          // Si el bloque está parcialmente visible
          if (rect.top < canvasRect.bottom - 20) {
            targetBlock = blocks[i] as HTMLElement;
            break;
          }
        }

        let wordsToHighlight: HTMLElement[] = [];
        if (targetBlock) {
          const words = Array.from(targetBlock.querySelectorAll('.word')) as HTMLElement[];
          let lastVisibleWord: HTMLElement | null = null;

          // Encontrar la última palabra que está visible
          for (let i = words.length - 1; i >= 0; i--) {
            const rect = words[i].getBoundingClientRect();
            if (rect.bottom < canvasRect.bottom - 10) {
              lastVisibleWord = words[i];
              break;
            }
          }

          if (lastVisibleWord) {
            // Todas las palabras en la misma "línea" comparten casi el mismo rect.top
            const lineTop = lastVisibleWord.getBoundingClientRect().top;
            wordsToHighlight = words.filter(w => Math.abs(w.getBoundingClientRect().top - lineTop) < 15);
          }
        }

        // 2. Hacer el scroll suave
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: 'smooth' });

        // 3. Aplicar el efecto visual solo a la última línea leída
        if (wordsToHighlight.length > 0) {
          el.querySelectorAll('.tap-highlight-fade').forEach(w => w.classList.remove('tap-highlight-fade'));
          wordsToHighlight.forEach(w => w.classList.add('tap-highlight-fade'));
          setTimeout(() => {
            wordsToHighlight.forEach(w => w.classList.remove('tap-highlight-fade'));
          }, 2500);
        }
      }
    }
  }

  // ── TEMA Y FUENTE ─────────────────────────────────────────────────
  changeFontSize(delta: number) {
    this.fontSize = Math.min(Math.max(this.fontSize + delta, this.FONT_MIN), this.FONT_MAX);
    this.applyFontSize();
    localStorage.setItem('reader-font-size', this.fontSize.toString());
  }

  setFontFamily(font: ReaderComponent['currentFontFamily']) {
    this.currentFontFamily = font;
    localStorage.setItem('reader-font-family', font);
    this.invalidateRulerLines(); // la tipografía cambia el ancho/alto de cada línea
    this.scheduleRelayout();
  }

  setTheme(theme: ReaderComponent['currentTheme']) {
    this.currentTheme = theme;
    this.applyTheme();
    localStorage.setItem('reader-theme', theme);
  }

  setHideProgress(value: boolean) {
    this.hideProgressOnScroll = value;
    localStorage.setItem('reader-hide-progress', String(value));
  }

  setBionicReading(value: boolean) {
    this.bionicReadingActive = value;
    localStorage.setItem('reader-bionic-reading', String(value));
  }

  // ── HOJA "Aa" — Ajustes de lectura ───────────────────────────────
  toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
    if (this.isSettingsOpen) { this.isTocOpen = false; this.isCharPanelOpen = false; }
  }

  resetFontSize() {
    this.fontSize = this.DEFAULT_FONT_SIZE;
    this.applyFontSize();
    localStorage.setItem('reader-font-size', String(this.DEFAULT_FONT_SIZE));
  }

  setSettingsTab(t: ReaderComponent['settingsTab']) {
    this.settingsTab = t;
  }

  setHighContrast(v: boolean) {
    this.highContrast = v;
    localStorage.setItem('reader-high-contrast', String(v));
  }

  setConcentrationMode(v: boolean) {
    this.concentrationMode = v;
    localStorage.setItem('reader-concentration', String(v));
    if (v && !this.hideProgressOnScroll) { this.setHideProgress(true); }
  }

  /** Presets rápidos — sólo aplican configuraciones que ya existen. */
  applyPreset(name: 'clasico' | 'noche' | 'enfoque' | 'accesible') {
    switch (name) {
      case 'clasico':
        // Como un libro impreso: Times, justificado, sangría y sin espacio entre párrafos.
        this.setFontFamily('times');
        this.setReadingWidth('medium');
        this.setLineHeight(1.4);
        this.setParaSpacing('tight');
        this.setTextAlign('justify');
        this.setLetterSpacing(0);
        break;
      case 'noche':
        this.setTheme('nocturno');
        this.setBrightness(0.82);
        break;
      case 'enfoque':
        this.setReadingWidth('narrow');
        this.setLineHeight(2);
        this.setParaSpacing('relaxed');
        this.setConcentrationMode(true);
        this.setFocusMode('sentence');
        this.toggleRuler(true);
        break;
      case 'accesible':
        this.setFontFamily('atkinson');
        if (this.fontSize < 20) { this.fontSize = 20; this.applyFontSize(); localStorage.setItem('reader-font-size', '20'); }
        this.setLineHeight(2);
        this.setParaSpacing('relaxed');
        this.setLetterSpacing(0.02);
        this.setHighContrast(true);
        break;
    }
  }

  setLineHeight(v: number) {
    this.lineHeight = v;
    localStorage.setItem('reader-line-height', String(v));
    this.applyReaderVars();
  }

  setReadingWidth(v: 'narrow' | 'medium' | 'wide') {
    this.readingWidth = v;
    localStorage.setItem('reader-width', v);
    this.applyReaderVars();
  }

  setTextAlign(v: 'left' | 'justify') {
    this.textAlign = v;
    localStorage.setItem('reader-align', v);
    this.applyReaderVars();
  }

  setParaSpacing(v: 'tight' | 'normal' | 'relaxed') {
    this.paraSpacing = v;
    localStorage.setItem('reader-para-spacing', v);
    this.applyReaderVars();
  }

  setLetterSpacing(v: number) {
    this.letterSpacing = Math.min(0.08, Math.max(-0.01, Math.round(v * 1000) / 1000));
    localStorage.setItem('reader-letter-spacing', String(this.letterSpacing));
    this.applyReaderVars();
  }

  setBrightness(v: number) {
    this.brightness = Math.min(1.1, Math.max(0.75, v));
    localStorage.setItem('reader-brightness', String(this.brightness));
    this.applyReaderVars();
  }

  setWordSpacing(v: number) {
    this.wordSpacing = Math.min(0.6, Math.max(0, Math.round(v * 100) / 100));
    localStorage.setItem('reader-word-spacing', String(this.wordSpacing));
    this.applyReaderVars();
  }

  // ── LECTURA ASISTIDA ──────────────────────────────────────────────
  setFocusMode(v: ReaderComponent['focusMode']) {
    this.focusMode = v;
    localStorage.setItem('reader-focus-mode', v);
  }

  toggleRuler(v: boolean) {
    this.rulerActive = v;
    localStorage.setItem('reader-ruler', String(v));
    this.invalidateRulerLines();
    if (!v) {
      this.setRulerTop(-1000);
    } else {
      const canvas = this.rulerCanvasEl || (document.querySelector('.reading-canvas') as HTMLElement | null);
      if (canvas) {
        this.rulerCanvasEl = canvas;
        this.rebuildRulerLines(canvas);
        const isDouble = this.isDoublePageView && window.innerWidth > 820;
        if (isDouble && this.rulerLinesLeft.length > 0) {
          this.rulerLineIndex = 0;
          this.setRulerTop(this.rulerLinesLeft[0].center, 'left');
        }
      }
    }
  }

  /** Handler crudo (enganchado fuera de la zona de Angular, ver ngAfterViewInit)
   *  para mousemove sobre el lienzo. El ratón puede disparar 60-120 eventos/seg;
   *  aquí se limita a un cálculo por frame con requestAnimationFrame. En doble
   *  página detecta la columna activa (izquierda o derecha) y posiciona la regla
   *  sobre el renglón correspondiente sin invadir la otra página. */
  private handleRulerMouseMove = (event: MouseEvent) => {
    if (!this.rulerActive) return;
    this.pendingRulerClientX = event.clientX;
    this.pendingRulerClientY = event.clientY;
    if (this.rulerRafId !== null) return;
    this.rulerRafId = requestAnimationFrame(() => {
      this.rulerRafId = null;
      const canvas = this.rulerCanvasEl;
      const clientX = this.pendingRulerClientX;
      const clientY = this.pendingRulerClientY;
      if (!canvas || clientX === null || clientY === null || !this.rulerActive) return;

      if (this.rulerLinesAll.length === 0) this.rebuildRulerLines(canvas);
      if (this.rulerLinesAll.length === 0) return;

      const canvasRect = canvas.getBoundingClientRect();
      const isDouble = this.isDoublePageView && window.innerWidth > 820;
      const colDivide = canvasRect.left + canvasRect.width / 2;
      const isRight = isDouble && (clientX >= colDivide);
      const activeCol: 'left' | 'right' | 'full' = isDouble ? (isRight ? 'right' : 'left') : 'full';

      if (isDouble) {
        const relativeY = clientY - canvasRect.top;
        const renglonPx = Math.round(this.fontSize * this.lineHeight) || 32;
        const lineIdx = Math.max(0, Math.min(this.linesPerPage - 1, Math.floor((relativeY - 16) / renglonPx)));
        this.rulerLineIndex = lineIdx;
        this.setRulerTop(this.rulerLinesLeft[lineIdx].center, activeCol);
        return;
      }

      const relativeY = clientY - canvasRect.top;
      const idx = this.findClosestLineIndexIn(this.rulerLinesAll, relativeY);
      if (idx === -1) return;

      this.rulerLineIndex = idx;
      this.setRulerTop(this.rulerLinesAll[idx].center, activeCol);
    });
  };

  private handleRulerMouseLeave = () => {
    if (this.currentWordIndex >= 0) return;
    this.rulerLineIndex = -1;
    this.setRulerTop(-1000);
  };

  /** Mueve la regla a la línea visible anterior/siguiente (ArrowUp/ArrowDown).
   *  Recorre estrictamente cada uno de los 17 renglones de la página sin saltar ninguno.
   *  Al llegar al renglón 17 de la izquierda pasa al 1 de la derecha, y al 17 de la derecha pasa de pliego. */
  private moveRulerByLine(direction: 1 | -1) {
    const canvas = this.rulerCanvasEl || (document.querySelector('.reading-canvas') as HTMLElement | null);
    if (!canvas) return;
    if (this.rulerLinesLeft.length === 0) this.rebuildRulerLines(canvas);

    const isDouble = this.isDoublePageView && window.innerWidth > 820;
    if (!isDouble) {
      if (this.rulerLinesAll.length === 0) return;
      let idx = this.rulerLineIndex < 0
        ? this.findClosestLineIndexIn(this.rulerLinesAll, canvas.clientHeight / 2)
        : this.rulerLineIndex + direction;
      idx = Math.max(0, Math.min(this.rulerLinesAll.length - 1, idx));
      this.rulerLineIndex = idx;
      this.setRulerTop(this.rulerLinesAll[idx].center, 'full');
      return;
    }

    // Exactamente 17 renglones por página en vista libro
    let isRight = this.rulerColumn === 'right';
    let idx = this.rulerLineIndex;

    if (idx < 0) {
      isRight = false;
      idx = 0;
    } else {
      idx += direction;
    }

    if (direction === 1 && idx >= this.linesPerPage) {
      if (!isRight) {
        isRight = true;
        idx = 0;
      } else {
        if (this.currentSpreadIndex < this.totalSpreads - 1) {
          this.turnSpreadNext();
          isRight = false;
          idx = 0;
        } else {
          idx = this.linesPerPage - 1;
        }
      }
    } else if (direction === -1 && idx < 0) {
      if (isRight) {
        isRight = false;
        idx = this.linesPerPage - 1;
      } else {
        if (this.currentSpreadIndex > 0) {
          this.turnSpreadPrev();
          isRight = true;
          idx = this.linesPerPage - 1;
        } else {
          idx = 0;
        }
      }
    }

    const activeCol: 'left' | 'right' | 'full' = isRight ? 'right' : 'left';
    this.rulerLineIndex = idx;
    this.setRulerTop(this.rulerLinesLeft[idx].center, activeCol);
  }

  /** Aplica la posición de la regla directamente al DOM y mantiene actualizadas
   *  las variables de estado para que los bindings de Angular permanezcan coherentes. */
  private setRulerTop(center: number, col: 'left' | 'right' | 'full' = this.rulerColumn) {
    this.rulerY = center;
    this.rulerColumn = col;
    const el = this.rulerCanvasEl?.parentElement?.querySelector('.reading-ruler') as HTMLElement | null;
    if (el) {
      el.style.top = `${center}px`;
      el.classList.remove('col-left', 'col-right', 'col-full');
      el.classList.add(`col-${col}`);
    }
  }

  /** Reconstruye las líneas de texto visibles dentro del lienzo.
   *  En doble página, cada hoja tiene exactamente linesPerPage renglones matemáticos.
   *  En vista continua, agrupa por centros de palabras para seguir el flujo con precisión. */
  private rebuildRulerLines(canvas: HTMLElement) {
    const isDouble = this.isDoublePageView && window.innerWidth > 820;
    const renglonPx = Math.round(this.fontSize * this.lineHeight) || 32;

    if (isDouble) {
      const lines: { top: number; bottom: number; center: number }[] = [];
      const paddingTop = 16;
      for (let i = 0; i < this.linesPerPage; i++) {
        const top = paddingTop + i * renglonPx;
        const bottom = top + renglonPx;
        const center = (top + bottom) / 2;
        lines.push({ top, bottom, center });
      }
      this.rulerLinesLeft = lines;
      this.rulerLinesRight = lines;
      this.rulerLinesAll = lines;
      this.rulerLineIndex = -1;
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const isVisible = (r: DOMRect) =>
      r.bottom >= canvasRect.top && r.top <= canvasRect.bottom &&
      r.right >= canvasRect.left && r.left <= canvasRect.right;

    interface WordPos {
      top: number;
      bottom: number;
      center: number;
    }

    const wordsAll: WordPos[] = [];
    const words = canvas.querySelectorAll<HTMLElement>('.word');
    words.forEach(word => {
      const r = word.getBoundingClientRect();
      if (!isVisible(r)) return;

      const top = r.top - canvasRect.top;
      const bottom = r.bottom - canvasRect.top;
      const center = (top + bottom) / 2;
      wordsAll.push({ top, bottom, center });
    });

    const LINE_THRESHOLD = Math.max(7, Math.round(renglonPx * 0.35));

    const clusterLines = (items: WordPos[]): { top: number; bottom: number; center: number }[] => {
      if (items.length === 0) return [];
      items.sort((a, b) => a.center - b.center);

      const lines: { top: number; bottom: number; center: number }[] = [];
      let currentLine = {
        top: items[0].top,
        bottom: items[0].bottom,
        center: items[0].center
      };

      for (let i = 1; i < items.length; i++) {
        const w = items[i];
        if (Math.abs(w.center - currentLine.center) <= LINE_THRESHOLD) {
          currentLine.top = Math.min(currentLine.top, w.top);
          currentLine.bottom = Math.max(currentLine.bottom, w.bottom);
          currentLine.center = (currentLine.top + currentLine.bottom) / 2;
        } else {
          lines.push(currentLine);
          currentLine = {
            top: w.top,
            bottom: w.bottom,
            center: w.center
          };
        }
      }
      lines.push(currentLine);
      return lines;
    };

    this.rulerLinesAll = clusterLines(wordsAll);
    this.rulerLinesLeft = this.rulerLinesAll;
    this.rulerLinesRight = this.rulerLinesAll;
    this.rulerLineIndex = -1;
  }

  private findClosestLineIndexIn(lines: { top: number; bottom: number; center: number }[], relativeY: number): number {
    if (lines.length === 0) return -1;
    let closest = 0;
    let minDist = Math.abs(lines[0].center - relativeY);
    for (let i = 1; i < lines.length; i++) {
      const dist = Math.abs(lines[i].center - relativeY);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }

  /** Invalida el caché de líneas de la regla; se reconstruye de forma perezosa
   *  en el próximo mousemove o flecha de teclado. */
  private invalidateRulerLines() {
    this.rulerLinesLeft = [];
    this.rulerLinesRight = [];
    this.rulerLinesAll = [];
    this.rulerLineIndex = -1;
  }

  setHighlightColor(c: ReaderComponent['highlightColor']) {
    this.highlightColor = c;
    localStorage.setItem('reader-highlight-color', c);
    this.applyReaderVars();
  }

  toggleLongParaSplit(v: boolean) {
    this.longParaSplit = v;
    localStorage.setItem('reader-long-para-split', String(v));
  }

  scrollStepDown() {
    this.stepScrollRuler(1);
  }

  scrollStepUp() {
    this.stepScrollRuler(-1);
  }

  private stepScrollRuler(direction: 1 | -1) {
    const canvas = document.querySelector('.reading-canvas') as HTMLElement | null;
    if (!canvas) return;

    if (this.rulerActive && !this.isDoublePageView) {
      if (this.rulerLinesAll.length === 0) {
        this.rebuildRulerLines(canvas);
      }

      if (this.rulerLinesAll.length > 0) {
        let currentIdx = this.rulerLineIndex;
        if (currentIdx < 0) {
          const searchY = this.rulerY < 0 ? 0 : this.rulerY;
          currentIdx = this.findClosestLineIndexIn(this.rulerLinesAll, searchY);
        }

        let nextIdx = currentIdx + direction;
        if (this.rulerY < 0) {
          nextIdx = 0;
        } else if (nextIdx >= this.rulerLinesAll.length) {
          nextIdx = this.rulerLinesAll.length - 1;
        } else if (nextIdx < 0) {
          nextIdx = 0;
        }
        
        this.rulerLineIndex = nextIdx;
        const lineData = this.rulerLinesAll[nextIdx];
        
        if (lineData) {
          const centerY = canvas.clientHeight / 2;
          const targetDocumentY = canvas.scrollTop + lineData.center;
          
          let targetScrollTop = targetDocumentY - centerY;
          const maxScroll = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
          
          // Clamp the scroll to boundaries
          targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
          
          const visualRulerY = targetDocumentY - targetScrollTop;
          
          this.setRulerTop(visualRulerY, 'full');
          if (Math.abs(canvas.scrollTop - targetScrollTop) > 1) {
            canvas.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
          }
        }
      }
    } else if (this.rulerActive && this.isDoublePageView) {
      this.moveRulerByLine(direction);
    } else {
      canvas.scrollBy({ top: direction * 80, behavior: 'smooth' });
    }
  }

  toggleAutoScroll(v: boolean) {
    this.autoScrollActive = v;
    if (v) {
      this.tapToScrollActive = false; // evitar interferencia con el toque para avanzar
      this.startAutoScroll();
    } else {
      this.stopAutoScroll();
    }
  }

  setAutoScrollSpeed(v: number) {
    this.autoScrollSpeed = Math.min(120, Math.max(10, Math.round(v)));
    localStorage.setItem('reader-autoscroll-speed', String(this.autoScrollSpeed));
  }

  private startAutoScroll() {
    this.stopAutoScroll();
    this.autoScrollLastTs = performance.now();
    const step = (ts: number) => {
      if (!this.autoScrollActive) return;
      const canvas = document.querySelector('.reading-canvas') as HTMLElement | null;
      const dt = (ts - this.autoScrollLastTs) / 1000;
      this.autoScrollLastTs = ts;
      if (canvas) {
        canvas.scrollTop += this.autoScrollSpeed * dt;
        // Al llegar al final, detener automáticamente (no forzar cambio de capítulo)
        if (canvas.scrollTop >= canvas.scrollHeight - canvas.clientHeight - 2) {
          this.toggleAutoScroll(false);
          return;
        }
      }
      this.autoScrollRafId = requestAnimationFrame(step);
    };
    this.autoScrollRafId = requestAnimationFrame(step);
  }

  private stopAutoScroll() {
    if (this.autoScrollRafId !== null) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
  }

  // ── Temporizador de sesión + recordatorio de pausa ───────────────
  setSessionTimer(minutes: number) {
    this.sessionTimerMinutes = minutes;
    localStorage.setItem('reader-session-minutes', String(minutes));
    if (minutes > 0) {
      this.sessionTimeRemainingSec = minutes * 60;
      this.sessionTimerRunning = true;
      this.startSessionInterval();
    } else {
      this.sessionTimerRunning = false;
      this.clearSessionInterval();
    }
  }

  private startSessionInterval() {
    this.clearSessionInterval();
    this.sessionTimerInterval = setInterval(() => {
      if (!this.sessionTimerRunning) return;
      this.sessionTimeRemainingSec--;
      if (this.sessionTimeRemainingSec <= 0) {
        this.sessionTimerRunning = false;
        this.showBreakModal = true;
        this.clearSessionInterval();
        this.cdr.detectChanges();
      }
    }, 1000);
  }

  private clearSessionInterval() {
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
  }

  get sessionTimerLabel(): string {
    const m = Math.floor(this.sessionTimeRemainingSec / 60).toString().padStart(2, '0');
    const s = Math.floor(this.sessionTimeRemainingSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  takeBreak() {
    this.showBreakModal = false;
    this.stopAudio(true);
    if (this.autoScrollActive) this.toggleAutoScroll(false);
    this.setSessionTimer(0);
  }

  keepReading() {
    this.showBreakModal = false;
    // Reinicia una sesión igual de larga
    this.setSessionTimer(this.sessionTimerMinutes || 25);
  }

  /** Vuelca las preferencias de lectura a variables CSS --reader-* en :root
   *  (mismo mecanismo que --font-size-reader). Se llama en init y en cada cambio;
   *  NO se toca al cambiar de capítulo, así que la config se mantiene. */
  private applyReaderVars() {
    this.invalidateRulerLines(); // interlineado/ancho/espaciado cambian la posición de las líneas
    const s = document.documentElement.style;
    const renglonHeight = Math.round(this.fontSize * this.lineHeight);
    s.setProperty('--reader-line-height', String(this.lineHeight));
    s.setProperty('--reader-renglon-height', `${renglonHeight}px`);
    const widthMap = { narrow: '54ch', medium: '66ch', wide: '78ch' };
    s.setProperty('--reader-measure', widthMap[this.readingWidth]);
    s.setProperty('--reader-align', this.textAlign);
    const isTight = this.paraSpacing === 'tight';
    s.setProperty('--reader-para-indent', (isTight || this.textAlign === 'justify') ? '1.5em' : '0em');
    const gapMap = {
      tight: '0px',
      normal: `${renglonHeight}px`,
      relaxed: `${renglonHeight * 2}px`
    };
    s.setProperty('--reader-para-gap', gapMap[this.paraSpacing]);
    s.setProperty('--reader-letter-spacing', `${this.letterSpacing}em`);
    s.setProperty('--reader-word-spacing', `${this.wordSpacing}em`);
    s.setProperty('--reader-brightness', String(this.brightness));
    const hl = this.highlightColorOptions.find(h => h.id === this.highlightColor);
    if (hl) s.setProperty('--reader-highlight-hex', hl.hex);
    this.scheduleRelayout();
  }

  private loadReaderPrefs() {
    const lh = parseFloat(localStorage.getItem('reader-line-height') || '');
    if ([1.4, 1.5, 1.75, 2].includes(lh)) this.lineHeight = lh;

    const w = localStorage.getItem('reader-width');
    if (w === 'narrow' || w === 'medium' || w === 'wide') this.readingWidth = w;

    const al = localStorage.getItem('reader-align');
    if (al === 'left' || al === 'justify') this.textAlign = al;

    const ps = localStorage.getItem('reader-para-spacing');
    if (ps === 'tight' || ps === 'normal' || ps === 'relaxed') this.paraSpacing = ps;

    const ls = parseFloat(localStorage.getItem('reader-letter-spacing') || '');
    if (!isNaN(ls) && ls >= -0.01 && ls <= 0.08) this.letterSpacing = ls;

    const wsp = parseFloat(localStorage.getItem('reader-word-spacing') || '');
    if (!isNaN(wsp) && wsp >= 0 && wsp <= 0.6) this.wordSpacing = wsp;

    const br = parseFloat(localStorage.getItem('reader-brightness') || '');
    if (!isNaN(br) && br >= 0.75 && br <= 1.1) this.brightness = br;

    this.highContrast = localStorage.getItem('reader-high-contrast') === 'true';
    this.concentrationMode = localStorage.getItem('reader-concentration') === 'true';

    const fm = localStorage.getItem('reader-focus-mode');
    if (fm === 'off' || fm === 'word' || fm === 'sentence' || fm === 'paragraph') this.focusMode = fm;

    this.rulerActive = localStorage.getItem('reader-ruler') === 'true';

    const hc = localStorage.getItem('reader-highlight-color');
    if (hc === 'gold' || hc === 'blue' || hc === 'green' || hc === 'pink') this.highlightColor = hc;

    this.longParaSplit = localStorage.getItem('reader-long-para-split') === 'true';

    const asSpeed = parseFloat(localStorage.getItem('reader-autoscroll-speed') || '');
    if (!isNaN(asSpeed) && asSpeed >= 10 && asSpeed <= 120) this.autoScrollSpeed = asSpeed;

    this.applyReaderVars();
  }

  isAlphanumeric(c: string): boolean {
    const code = c.charCodeAt(0);
    return (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      code >= 128; // Acentos y español
  }

  getBionicSplit(word: string): { bold: string; normal: string } {
    if (!word) return { bold: '', normal: '' };
    const len = word.length;

    let start = 0;
    while (start < len && !this.isAlphanumeric(word[start])) {
      start++;
    }

    let end = len - 1;
    while (end >= start && !this.isAlphanumeric(word[end])) {
      end--;
    }

    if (start > end) {
      return { bold: word, normal: '' };
    }

    const prefix = word.substring(0, start);
    const cleanWord = word.substring(start, end + 1);
    const suffix = word.substring(end + 1);

    const cleanLen = cleanWord.length;
    let boldLength = 1;
    if (cleanLen === 1 || cleanLen === 2) {
      boldLength = 1;
    } else if (cleanLen === 3) {
      boldLength = 2;
    } else {
      boldLength = Math.ceil(cleanLen * 0.45);
    }

    return {
      bold: prefix + cleanWord.substring(0, boldLength),
      normal: cleanWord.substring(boldLength) + suffix
    };
  }

  private applyFontSize() {
    this.invalidateRulerLines(); // el tamaño de fuente cambia la posición de las líneas
    const s = document.documentElement.style;
    // Se fijan AMBAS en <html> (ancestro de <app-reader>): el CSS del componente
    // sólo puede declararlas en :host, y así el ajuste en vivo funciona seguro.
    s.setProperty('--font-size-reader', `${this.fontSize}px`);
    s.setProperty('--reader-font-size', `${this.fontSize}px`);
    this.applyReaderVars();
  }

  private applyTheme() {
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-sepia', 'theme-nocturno', 'theme-gris');
    document.body.classList.add(`theme-${this.currentTheme}`);
  }

  // ── TOC ───────────────────────────────────────────────────────────
  toggleToc() {
    this.isTocOpen = !this.isTocOpen;
    if (this.isTocOpen) {
      this.isCharPanelOpen = false;
      this.isSettingsOpen = false;
      this.refreshBookmarkLabels();
    }
  }

  goToChapter(index: number) {
    this.isTocOpen = false;
    this.openChapter(index);
  }

  // ── CAPÍTULOS ─────────────────────────────────────────────────────
  loadChapters() {
    if (this.chapters && this.chapters.length > 0) return;
    this.api.get(`library/inventory/${this.inventoryId}/chapters/`).subscribe({
      next: (res: any) => {
        if (res && res.chapters && res.chapters.length > 0) {
          this.chapters = res.chapters;
          this.chapterTextLengths = res.chapters.map((c: any) => this.textLength(c.content_html));
          this.chapterParagraphLengths = res.chapters.map((c: any) => this.paragraphLengths(c.content_html));
          this.hasPremiumNarration = res.has_premium_narration;
          this.totalPages = res.chapters.length;
          this.loadBookmarks();
          if (this.currentPage > this.totalPages) { this.currentPage = this.totalPages; } else if (this.currentPage < 1) { this.currentPage = 1; }
          this.renderCurrentChapter();
          this.loadAvatars(); // Cargar personajes una vez tenemos el inventario
        } else {
          this.chapterTitle = 'Sin contenido';
          this.safeChapterHtml = this.sanitizer.bypassSecurityTrustHtml('<p>El libro no tiene capítulos procesados.</p>');
        }
      },
      error: (err) => {
        console.error('Error al cargar capítulos', err);
        this.chapterTitle = 'Error';
        // Si el inventario no pertenece al usuario o no existe (404), redirigir
        if (err.status === 404 || err.status === 401) {
          setTimeout(() => this.router.navigate(['/catalog']), 2000);
        }
        this.safeChapterHtml = this.sanitizer.bypassSecurityTrustHtml('<p>Hubo un error cargando el contenido.</p>');
        this.isOverlayActive = false;
      }
    });
  }

  renderCurrentChapter() {
    // Defer to next task so the Lottie animation keeps running
    // (avoids blocking the main thread during heavy chapter tokenization)
    setTimeout(() => this.parseAndRenderChapter(), 0);
  }

  /** Token del render en curso. Si el usuario cambia de capítulo (doble tap en
   *  "Siguiente"/"Anterior") antes de que termine el renderizado progresivo por
   *  chunks del capítulo anterior, ese renderChunks() antiguo debe abortar en vez
   *  de seguir empujando bloques viejos sobre `renderedBlocks` del capítulo nuevo. */
  private renderToken = 0;

  isActiveSentence(sentence: any): boolean {
    if (this.currentWordIndex < 0 || !sentence || !sentence.tokens) return false;
    const words = sentence.tokens.filter((t: any) => t.isWord);
    if (words.length === 0) return false;
    const firstIdx = words[0].idx;
    const lastIdx = words[words.length - 1].idx;
    return this.currentWordIndex >= firstIdx && this.currentWordIndex <= lastIdx;
  }

  /** Para "Modo de foco → Párrafo": ¿la palabra activa (clic o TTS) cae dentro
   *  de este bloque (párrafo/encabezado)? */
  isActiveBlock(block: { tokens: Array<any> }): boolean {
    if (this.currentWordIndex < 0 || !block || !block.tokens || block.tokens.length === 0) return false;
    const words = block.tokens.filter((t: any) => t.isWord);
    if (words.length === 0) return false;
    return this.currentWordIndex >= words[0].idx && this.currentWordIndex <= words[words.length - 1].idx;
  }

  /** Parsea el HTML del capítulo y crea la estructura de bloques/tokens para el *ngFor */
  parseAndRenderChapter() {
    const chapter = this.chapters[this.currentPage - 1];
    if (!chapter) return;

    this.invalidateRulerLines(); // el capítulo nuevo invalida cualquier línea calculada del anterior
    // Se marca la palabra donde quedó la narración; sin posición guardada (0) no se resalta nada.
    const savedAudioWord = this.getSavedAudioWordIndex();
    this.currentWordIndex = savedAudioWord > 0 ? savedAudioWord : -1;

    this.chapterTitle = chapter.title || `Capítulo ${this.currentPage}`;

    // 1. Calcular backendUrl y limpiar HTML primero para evitar que el navegador
    // cargue imágenes relativas erróneas al procesar el texto plano.
    const backendUrl = environment.apiUrl.split('/api/v1/')[0];
    const cleanHtml = chapter.content_html.replace(/src=(["'])(\/?)media\//g, `src=$1${backendUrl}/media/`);

    // 2. Actualizar texto plano para SpeechSynthesis (usando HTML ya limpio)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cleanHtml;
    this.currentChapterPlainText = tempDiv.textContent || '';

    // 3. Parsear el HTML limpio preservando la estructura (ver core/utils/chapter-parser.util.ts)
    const { blocks, wordCount } = parseChapterBlocks(cleanHtml, word => this.getBionicSplit(word));

    // 4. Agrupar tokens por oraciones (punto a punto) para resaltar como ReadEra
    let globalSentenceIdx = 0;
    blocks.forEach(block => {
      if (block.tag === 'img-block') return;

      const sentences = [];
      let currentTokens = [];

      for (let i = 0; i < block.tokens.length; i++) {
        const tok = block.tokens[i];
        currentTokens.push(tok);

        if (tok.isWord) {
          if (/[.!?]["'»”)]*$/.test(tok.text)) {
            sentences.push({ idx: globalSentenceIdx++, tokens: currentTokens });
            currentTokens = [];
          }
        } else if (tok.isBr) {
          sentences.push({ idx: globalSentenceIdx++, tokens: currentTokens });
          currentTokens = [];
        }
      }

      if (currentTokens.length > 0) {
        sentences.push({ idx: globalSentenceIdx++, tokens: currentTokens });
      }

      block.sentences = sentences;
    });

    this.parsedBlocks = blocks;
    this.titleTokens = [];

    // 4. GESTIÓN DEL TÍTULO: Evitar duplicación y permitir sincronización.
    // Si el primer bloque contiene el título del capítulo, lo extraemos para el encabezado premium.
    if (this.parsedBlocks.length > 0) {
      const firstBlock = this.parsedBlocks[0];
      const titleToCompare = this.chapterTitle.toLowerCase().replace(/\s+/g, ' ').trim();

      let accumulatedText = '';
      let splitIndex = -1;

      for (let i = 0; i < firstBlock.tokens.length; i++) {
        accumulatedText += firstBlock.tokens[i].text;
        const normalizedAccumulated = accumulatedText.toLowerCase().replace(/\s+/g, ' ').trim();

        if (normalizedAccumulated === titleToCompare) {
          splitIndex = i + 1;
          break;
        }
        // Si nos pasamos mucho del largo, abortamos búsqueda
        if (normalizedAccumulated.length > titleToCompare.length + 5) break;
      }

      if (splitIndex !== -1) {
        // Extraer los tokens del título
        this.titleTokens = firstBlock.tokens.splice(0, splitIndex);

        // Limpiar espacios en blanco sobrantes al inicio del párrafo restante
        while (firstBlock.tokens.length > 0 && !firstBlock.tokens[0].isWord && !firstBlock.tokens[0].isImg) {
          firstBlock.tokens.shift();
        }

        // Si el bloque quedó vacío (era solo el título), lo eliminamos
        if (firstBlock.tokens.length === 0) {
          this.parsedBlocks.shift();
        }

        // Algunos libros repiten el título del capítulo (p.ej. "Primera Parte")
        // como su propio encabezado dentro del cuerpo, justo debajo del título
        // grande ya extraído — se ve duplicado en pantalla. Si el/los siguientes
        // bloques son EXACTAMENTE ese mismo texto, se descartan también.
        const normalizeBlockText = (b: typeof this.parsedBlocks[0]) =>
          b.tokens.map(t => t.text).join('').toLowerCase().replace(/\s+/g, ' ').trim();
        let guard = 0;
        while (
          this.parsedBlocks.length > 0 &&
          this.parsedBlocks[0].tag !== 'img-block' &&
          normalizeBlockText(this.parsedBlocks[0]) === titleToCompare &&
          guard++ < 5
        ) {
          this.parsedBlocks.shift();
        }
      }
    }

    // Marcar párrafos largos (para la división visual opcional en Lectura asistida)
    blocks.forEach(b => {
      if (b.tag === 'p') {
        const len = b.tokens.reduce((acc, t) => acc + (t.text?.length || 0), 0);
        b.long = len > this.LONG_PARA_CHARS;
      }
    });

    this.totalWordCount = wordCount;
    this.safeChapterHtml = this.sanitizer.bypassSecurityTrustHtml(''); // vaciar el fallback

    // Invalidar cualquier renderizado por chunks todavía en curso de un capítulo anterior
    const myRenderToken = ++this.renderToken;

    // Resetear estado de scroll al cargar nuevo capítulo
    this.chapterScrollPercent = 0;
    this.isNearEnd = false;
    this.lastScrollTop = 0;

    const viewer = document.querySelector('.reading-canvas');
    if (viewer) {
      viewer.scrollTop = 0;
      viewer.scrollLeft = 0; // vista libro: primer pliego hasta que recalculateSpreads decida
      // El alto de página se fija antes de pintar: así un salto a una palabra (marcador,
      // vocabulario) mide su pliego con la misma maqueta que tendrá al terminar.
      if (this.isDoublePageView) this.fitLinesToPage(viewer as HTMLElement);
    }

    // Iniciar renderizado progresivo para evitar bloquear el hilo principal
    this.renderedBlocks = [];

    // Determinar en qué bloque está el progreso guardado para restaurarlo correctamente
    let targetBlockIndex = 0;
    let needsFullRender = false;

    if (this.savedProgressData) {
      if (this.savedProgressData.wordId) {
        const targetIdx = parseInt(this.savedProgressData.wordId.split('-')[1]);
        if (!isNaN(targetIdx)) {
          targetBlockIndex = this.parsedBlocks.findIndex(b => b.tokens.some((t: any) => t.idx === targetIdx));
        }
      } else if (this.savedProgressData.scrollPercent) {
        needsFullRender = true; // Para porcentaje de scroll necesitamos todo el alto del documento
      }
    } else if (this.currentWordIndex > 0) {
      targetBlockIndex = this.parsedBlocks.findIndex(b => b.tokens.some((t: any) => t.idx === this.currentWordIndex));
    }

    if (targetBlockIndex === -1) targetBlockIndex = 0;
    let lottieDismissed = false;

    const renderChunks = (startIndex: number) => {
      // Si mientras tanto se cambió de capítulo, este render quedó obsoleto: abortar
      // sin tocar `renderedBlocks` (que ya pertenece al capítulo nuevo).
      if (myRenderToken !== this.renderToken) return;

      // Usar un chunk más grande si estamos tratando de alcanzar rápido el progreso
      const chunkSize = (startIndex <= targetBlockIndex || needsFullRender) ? 50 : 15;
      const chunk = this.parsedBlocks.slice(startIndex, startIndex + chunkSize);

      if (chunk.length > 0) {
        this.renderedBlocks = [...this.renderedBlocks, ...chunk];
        this.cdr.detectChanges();

        const nextIndex = startIndex + chunkSize;
        const reachedTarget = needsFullRender ? (nextIndex >= this.parsedBlocks.length) : (nextIndex > targetBlockIndex);

        // Una vez alcanzado el bloque del progreso, restaurar scroll y ocultar Lottie
        if (reachedTarget && !lottieDismissed) {
          lottieDismissed = true;
          setTimeout(() => {
            if (this.savedProgressData) {
              if (this.savedProgressData.wordId) {
                const idx = parseInt(this.savedProgressData.wordId.split('-')[1]);
                if (!isNaN(idx)) this.scrollWordIntoView(idx, true);
              } else if (this.savedProgressData.scrollPercent && this.isDoublePageView) {
                // Vista libro: el progreso es la fracción del capítulo; el pliego se elige
                // cuando termina de maquetarse (recalculateSpreads).
                this.pendingSpreadFraction = this.savedProgressData.scrollPercent;
              } else if (this.savedProgressData.scrollPercent && viewer) {
                viewer.scrollTop = this.savedProgressData.scrollPercent * (viewer.scrollHeight - viewer.clientHeight);
              }
              this.savedProgressData = null;
            } else if (this.currentWordIndex > 0) {
              this.scrollWordIntoView(this.currentWordIndex, false);
            }

            this.isOverlayActive = false;
            this.checkIfNearEnd();
            this.cdr.detectChanges();
          }, 50);
        }

        // Continuar pintando el resto en el siguiente frame
        if (nextIndex < this.parsedBlocks.length) {
          setTimeout(() => renderChunks(nextIndex), 16);
        } else {
          // Finalizado el renderizado total
          this.isFullyRendered = true;
          this.onChapterLaidOut();
        }
      } else {
        if (!lottieDismissed) {
          lottieDismissed = true;
          this.isOverlayActive = false;
          this.checkIfNearEnd();
          this.cdr.detectChanges();
        }
        this.isFullyRendered = true;
        this.onChapterLaidOut();
      }
    };

    this.isFullyRendered = false; // Bloquear guardado de scroll
    renderChunks(0);
  }

  /** El capítulo terminó de renderizarse: medir pliegos (y otra vez cuando carguen las fuentes). */
  private onChapterLaidOut() {
    if (this.isDoublePageView) {
      setTimeout(() => this.recalculateSpreads(), 60);
      // Una fuente web que llega tarde cambia el ancho de cada renglón y con él los pliegos.
      (document as any).fonts?.ready?.then(() => this.scheduleRelayout());
    } else {
      this.recomputeBookPages();
      this.refreshVisiblePage();
    }
  }

  /**
   * Envuelve cada palabra del HTML en un span con ID secuencial para el resaltado.
   */
  processContentForAudio(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    let wordCount = 0;

    const traverse = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const words = text.split(/(\s+)/); // Preservar espacios
        const fragment = document.createDocumentFragment();


        words.forEach(w => {
          if (w.trim().length > 0) {
            const span = document.createElement('span');
            span.className = 'word';
            span.id = `word-${wordCount}`;
            span.textContent = w;
            fragment.appendChild(span);
            wordCount++;
          } else {
            fragment.appendChild(document.createTextNode(w));
          }
        });

        node.parentNode?.replaceChild(fragment, node);
      } else {
        node.childNodes.forEach(child => traverse(child));
      }
    };

    traverse(doc.body);
    return doc.body.innerHTML;
  }

  toggleAudioPanel() {
    this.isAudioPanelOpen = !this.isAudioPanelOpen;
    if (this.isAudioPanelOpen) this.isSettingsOpen = false;
  }

  toggleTapToScroll() {
    this.tapToScrollActive = !this.tapToScrollActive;
  }

  isFullscreenActive: boolean = false;

  // Botón dedicado en el toolbar para activar/desactivar el modo inmersivo (F11)
  toggleImmersiveButton() {
    this.isFullscreenActive = !this.isFullscreenActive;
    this.toggleImmersiveMode(this.isFullscreenActive);
  }

  // ── ECONOMÍA DE TINTA: desbloqueo permanente de Voz Premium (REMOVED) ──────
  purchaseNarration() {
    if (this.isUnlocking || !this.bookSlug) return;

    if (this.inkBalance < this.PREMIUM_VOICE_INK_COST) {
      alert(`No tienes tinta suficiente. Necesitas ${this.PREMIUM_VOICE_INK_COST} Ink.`);
      return;
    }

    this.isUnlocking = true;
    this.api.post(`catalog/books/${this.bookSlug}/purchase_narration/`, {}).subscribe({
      next: (res: any) => {
        this.isUnlocking = false;
        this.hasPremiumNarration = true;
        this.inkBalance = res.ink_balance;
        alert('¡Narración premium desbloqueada para todo el libro!');
      },
      error: (err) => {
        this.isUnlocking = false;
        console.error('Error al comprar narración', err);
        alert(err.error?.message || 'Error al procesar la compra.');
      }
    });
  }

  /** Primera palabra que se ve ahora (en vista libro, la de la página izquierda). */
  getFirstVisibleWordIndex(): number {
    const range = this.visibleWordRange();
    return range ? range[0] : -1;
  }

  resumeAudio() {
    this.isAudioPanelOpen = false;
    if (document.getElementById(`word-${this.lastAudioWordIndex}`)) {
      // Si el usuario se movió y la palabra pausada ya no se ve (otro pliego o scroll),
      // cancelamos el resume normal y forzamos a que inicie desde lo que está viendo.
      if (!this.isWordVisible(this.lastAudioWordIndex)) {
        this.stopAudio(true);
        // Le damos un pequeño tiempo para que el stop haga efecto antes de iniciar
        setTimeout(() => this.playAudio(), 100);
        return;
      }
    }

    // Si sigue visible, simplemente reanuda donde se quedó
    if (this.currentAudioMode === 'kokoro') {
      this.kokoroVoice.resume();
    } else if (this.currentAudioMode === 'native-android') {
      // Capacitor plugin doesn't have resume yet, we just speak the rest or re-send text
      const startWord = this.lastAudioWordIndex >= 0 ? this.lastAudioWordIndex : 0;
      this.nativeTts.speak(this.currentChapterPlainText, startWord);
    } else {
      this.audioService.resume();
    }
  }

  playAudio() {
    this.isAudioPanelOpen = false;
    this.stopAudio(true); // Evitar que múltiples narradores hablen al mismo tiempo
    this.proErrorMessage = '';
    const chapter = this.chapters[this.currentPage - 1];

    // LÓGICA DE CONTINUACIÓN DE SCROLL: 
    // Si la palabra guardada está fuera de pantalla, reanudar desde lo que el usuario está viendo actualmente.
    if (document.getElementById(`word-${this.lastAudioWordIndex}`)) {
      // Si la palabra guardada no se ve ahora (otro pliego o fuera del scroll)
      if (!this.isWordVisible(this.lastAudioWordIndex)) {
        const visibleIdx = this.getFirstVisibleWordIndex();
        if (visibleIdx !== -1) {
          this.lastAudioWordIndex = visibleIdx;
          this.currentWordIndex = visibleIdx;
        }
      }
    } else {
      // Si la palabra guardada ni siquiera existe en el DOM (ej. cap nuevo) o no se encuentra
      const visibleIdx = this.getFirstVisibleWordIndex();
      if (visibleIdx !== -1) {
        this.lastAudioWordIndex = visibleIdx;
        this.currentWordIndex = visibleIdx;
      }
    }

    const startWord = this.lastAudioWordIndex >= 0 ? this.lastAudioWordIndex : 0;

    if (this.currentAudioMode === 'native') {
      this.audioService.playNative(this.currentChapterPlainText, startWord);
    } else if (this.currentAudioMode === 'wasm') {
      this.audioService.playWasm(this.currentChapterPlainText);
    } else if (this.currentAudioMode === 'kokoro') {
      // MODO KOKORO TTS
      this.kokoroVoice.speak(this.currentChapterPlainText, this.authorAvatar?.id || 1, startWord);
    } else if (this.currentAudioMode === 'native-android') {
      // MODO NATIVO CAPACITOR
      this.nativeTts.speak(this.currentChapterPlainText, startWord);
    } else {
      // MODO VOZ NEURAL: audio del capítulo grabado o generado una sola vez en el servidor (Azure)
      this.playChapterNarration(chapter, startWord);
    }
  }

  /**
   * Pide al servidor la narración del capítulo. Si todavía no existe, el servidor la genera
   * una sola vez para todos los lectores y aquí se consulta cada pocos segundos hasta que esté.
   */
  private playChapterNarration(chapter: any, startWord: number) {
    if (!chapter?.id || !this.inventoryId) {
      this.playLegacyRecording(chapter);
      return;
    }

    this.cancelNarrationRequest();
    const requestId = this.narrationRequestId;
    const url = `library/inventory/${this.inventoryId}/chapters/${chapter.id}/narration/`;
    let polls = 0;
    this.isAudioLoading = true;

    const request = () => {
      this.api.post<any>(url, {}).subscribe({
        next: (res) => {
          if (requestId !== this.narrationRequestId) return; // el lector detuvo el audio o cambió de capítulo

          if (res.status === 'generating') {
            if (++polls > this.NARRATION_MAX_POLLS) {
              this.isAudioLoading = false;
              this.showNarrationNotice('La narración está tardando más de lo normal. Intenta de nuevo en unos minutos.', 7000);
              return;
            }
            this.showNarrationNotice(`🎙️ Preparando la narración del capítulo… ${Math.round((res.progress || 0) * 100)}%`);
            this.narrationPollTimer = setTimeout(request, this.NARRATION_POLL_MS);
            return;
          }

          this.narrationNotice = '';
          this.audioService.playRecorded(res.audio_url, res.alignment, startWord).subscribe({
            next: () => this.isAudioLoading = false,
            error: (err) => {
              this.isAudioLoading = false;
              console.error('Error reproduciendo la narración:', err);
              this.showNarrationNotice('No se pudo reproducir la narración. Usa la voz estándar.', 6000);
              this.currentAudioMode = 'native';
            }
          });
        },
        error: (err) => {
          if (requestId !== this.narrationRequestId) return;
          this.isAudioLoading = false;
          const body = err?.error || {};
          if (body.reason === 'not_configured') {
            this.narrationNotice = '';
            this.playLegacyRecording(chapter);
            return;
          }
          this.showNarrationNotice(body.message || 'La voz neural no está disponible ahora. Usa la voz estándar.', 7000);
          this.currentAudioMode = 'native';
        }
      });
    };
    request();
  }

  private showNarrationNotice(message: string, autoHideMs: number = 0) {
    this.narrationNotice = message;
    clearTimeout(this.narrationNoticeTimer);
    if (autoHideMs) {
      this.narrationNoticeTimer = setTimeout(() => this.narrationNotice = '', autoHideMs);
    }
  }

  private cancelNarrationRequest() {
    this.narrationRequestId++;
    clearTimeout(this.narrationPollTimer);
    this.narrationPollTimer = null;
  }

  /** MP3 antiguos de tres libros; solo se usan si el servidor no tiene la voz neural configurada. */
  private playLegacyRecording(chapter: any) {
    this.isAudioLoading = true;
    const backendUrl = environment.apiUrl.split('/api/v1/')[0];
    // Usamos el order real del capítulo en la BD, no el índice de página del lector
    const chapterOrder = chapter?.order ?? this.currentPage;
    const capNumStr = chapterOrder.toString().padStart(2, '0');
    let fallbackAudioUrl = '';

    console.log(`[Audio] Capítulo DB: order=${chapterOrder}, Construyendo URL con: Capitulo_${capNumStr}.mp3`);

    if (this.bookSlug === 'el-extrano-caso-del-dr-jekyll-y-mr-hyde' || this.bookSlug?.includes('jekyll')) {
      fallbackAudioUrl = `${backendUrl}/media/audio_narrations/El_extraño_caso/Capitulo_${capNumStr}.mp3`;
    } else if (this.bookSlug === 'el-principe-feliz' || this.bookSlug?.includes('principe')) {
      fallbackAudioUrl = `${backendUrl}/media/audio_narrations/Principe_Feliz/Capitulo_${capNumStr}.mp3`;
    } else if (this.bookSlug === 'el-principito' || this.bookSlug?.includes('principito')) {
      fallbackAudioUrl = `${backendUrl}/media/audio_narrations/principito/Capitulo_${capNumStr}.mp3`;
    }

    if (fallbackAudioUrl) {
      console.log('Usando fallback hardcodeado MP3:', fallbackAudioUrl);
      this.audioService.playRecorded(fallbackAudioUrl).subscribe({
        next: () => {
          this.isAudioLoading = false;
          // Modo fallback sin JSON: Limpiamos el resaltado ya que ahora usaremos Whisper para sincronizar de verdad.
          this.currentWordIndex = -1;
        },
        error: (err) => {
          this.isAudioLoading = false;
          this.showNarrationNotice('Audio no disponible para este capítulo. Usa la voz estándar.', 6000);
          this.currentAudioMode = 'native';
        }
      });
    } else {
      this.isAudioLoading = false;
      this.showNarrationNotice('La voz neural no está disponible en este servidor. Usa la voz estándar.', 6000);
      this.currentAudioMode = 'native';
    }
  }

  stopAudio(preventScroll: boolean = false) {
    this.cancelNarrationRequest();
    this.isAudioLoading = false;
    this.narrationNotice = '';
    this.audioService.stop();
    this.kokoroVoice.stop();
    this.nativeTts.stop();
    this.currentWordIndex = -1;
    this.narrationWordIdx = -1;
    this.updateNarrationMarker();

    if (!preventScroll) {
      // Volver al inicio del texto visualmente (solo cuando se detiene manual y definitivamente)
      const canvas = document.querySelector('.reading-canvas');
      if (canvas) {
        canvas.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  onWordClick(wordIdx: number) {
    // Si el Toque Fluido está activo, ignorar el click en palabras para evitar
    // el highlight accidental del audio al hacer scroll táctil
    if (this.tapToScrollActive) return;

    if (this.currentAudioMode === 'pro') {
      this.audioService.seekToWord(wordIdx, this.currentChapterPlainText);
    }
    this.currentWordIndex = wordIdx;
    if (this.rulerActive) {
      this.scrollWordIntoView(wordIdx);
    }
  }

  getSavedAudioWordIndex(): number {
    if (!this.inventoryId) return 0;
    try {
      const saved = localStorage.getItem(`audio_pos_${this.inventoryId}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.page === this.currentPage && typeof data.wordIndex === 'number' && data.wordIndex >= 0) {
          this.lastAudioWordIndex = data.wordIndex;
          return data.wordIndex;
        }
      }
    } catch (e) {
      console.warn('Error reading saved audio position', e);
    }
    this.lastAudioWordIndex = 0;
    return 0;
  }

  confirmRestartAudio() {
    this.showRestartModal = true;
  }

  closeRestartModal() {
    this.showRestartModal = false;
  }

  toggleAudioFromFab() {
    if (this.currentAudioMode === 'kokoro') {
      if (this.kokoroVoice.isSpeaking$.value) {
        this.kokoroVoice.stop();
        this.isAudioPanelOpen = true;
      } else {
        this.playAudio();
      }
    } else if (this.currentAudioMode === 'native-android') {
      if (this.nativeTts.isSpeaking$.value) {
        this.nativeTts.stop();
        this.isAudioPanelOpen = true;
      } else {
        this.playAudio();
      }
    } else {
      if (this.audioService.isPlaying) {
        this.audioService.pause();
        this.isAudioPanelOpen = true;
      } else if (this.audioService.isPaused) {
        this.resumeAudio();
      } else {
        this.playAudio();
      }
    }
  }

  stopAudioFromFab() {
    this.stopAudio();
    this.isAudioPanelOpen = true;
  }

  restartAudio() {
    this.showRestartModal = false;
    this.stopAudio();
    this.currentWordIndex = 0;
    this.lastAudioWordIndex = 0;
    this.saveAudioPosition();
    setTimeout(() => {
      this.playAudio();
    }, 100);
  }

  private saveAudioPosition() {
    if (this.inventoryId) {
      localStorage.setItem(`audio_pos_${this.inventoryId}`, JSON.stringify({
        page: this.currentPage,
        wordIndex: this.lastAudioWordIndex
      }));
    }
  }

  private scrollWordIntoView(idx: number, highlightBookmark: boolean = false) {
    const doScrollAndHighlight = (attemptsLeft: number) => {
      const el = document.getElementById(`word-${idx}`);
      if (el) {
        if (this.isDoublePageView) {
          // Vista libro: se pasa al pliego donde está la palabra. scrollIntoView no sirve
          // aquí: dejaría el lienzo a medio camino entre dos pliegos.
          this.showSpreadOf(el, !highlightBookmark);
        } else {
          const rect = el.getBoundingClientRect();
          const safeTop = window.innerHeight * 0.2;
          const safeBottom = window.innerHeight * 0.8;

          // Auto-scroll para centrar la palabra
          if (rect.top < safeTop || rect.bottom > safeBottom || highlightBookmark) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        }
        const rect = el.getBoundingClientRect();

        // Seguimiento automático de la regla de lectura durante la narración y clic.
        // Se sincroniza con el renglón y columna activa de la palabra hablada.
        if (this.rulerActive) {
          const canvas = this.canvasEl();
          if (canvas) {
            this.rulerCanvasEl = canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const isDouble = this.isDoublePageView && window.innerWidth > 820;
            const colDivide = canvasRect.left + canvasRect.width / 2;
            const isRight = isDouble && ((rect.left + rect.right) / 2 >= colDivide);
            const activeCol: 'left' | 'right' | 'full' = isDouble ? (isRight ? 'right' : 'left') : 'full';
            if (isDouble) {
              if (this.rulerLinesLeft.length === 0) this.rebuildRulerLines(canvas);
              const renglonPx = Math.round(this.fontSize * this.lineHeight) || 32;
              const relativeY = (rect.top + rect.bottom) / 2 - canvasRect.top;
              const lineIdx = Math.max(0, Math.min(this.linesPerPage - 1, Math.floor((relativeY - 16) / renglonPx)));
              this.rulerLineIndex = lineIdx;
              const center = this.rulerLinesLeft[lineIdx]?.center ?? (16 + (lineIdx + 0.5) * renglonPx);
              this.setRulerTop(center, activeCol);
            } else {
              const wordCenterY = (rect.top + rect.bottom) / 2 - canvasRect.top;
              this.setRulerTop(wordCenterY, activeCol);
            }
          }
        }

        // Si es reanudación de marcador, resaltar la palabra por 5 segundos
        if (highlightBookmark) {
          this.applyBookmarkHighlight(el);
        }
      } else if (attemptsLeft > 0) {
        setTimeout(() => doScrollAndHighlight(attemptsLeft - 1), 80);
      }
    };

    doScrollAndHighlight(highlightBookmark ? 8 : 1);
  }

  private applyBookmarkHighlight(el: HTMLElement) {
    this.clearBookmarkHighlight();

    this.activeBookmarkEl = el;
    el.classList.add('bookmark-word-highlight');
    this.bookmarkResumeWordText = el.textContent?.trim() || '';
    this.bookmarkResumeLabel = this.nextJumpLabel || 'Reanudando marcador en';
    this.nextJumpLabel = '';
    this.showBookmarkResumeBadge = true;
    this.cdr.detectChanges();

    // Desaparece automáticamente tras 5 segundos (5000 ms)
    this.bookmarkHighlightTimer = setTimeout(() => {
      this.clearBookmarkHighlight();
    }, 5000);
  }

  private clearBookmarkHighlight() {
    if (this.bookmarkHighlightTimer) {
      clearTimeout(this.bookmarkHighlightTimer);
      this.bookmarkHighlightTimer = null;
    }
    if (this.activeBookmarkEl) {
      this.activeBookmarkEl.classList.remove('bookmark-word-highlight');
      this.activeBookmarkEl = null;
    }
    document.querySelectorAll('.bookmark-word-highlight').forEach(node => {
      node.classList.remove('bookmark-word-highlight');
    });
    this.showBookmarkResumeBadge = false;
    this.cdr.detectChanges();
  }

  /** Distancia (en "capítulos de página") entre la posición de lectura guardada
   *  (última palabra narrada, o progreso restaurado) y lo que se ve ahora. Si el
   *  usuario se aleja para explorar el índice/otra parte del capítulo, se ofrece
   *  un botón para volver de un toque. */
  private checkBackToReadingVisibility() {
    const targetIdx = this.lastAudioWordIndex > 0 ? this.lastAudioWordIndex : this.currentWordIndex;
    if (targetIdx <= 0 || !document.getElementById(`word-${targetIdx}`)) {
      this.showBackToReadingBtn = false;
      return;
    }
    this.showBackToReadingBtn = !this.isWordVisible(targetIdx);
  }

  scrollBackToReading() {
    const targetIdx = this.lastAudioWordIndex > 0 ? this.lastAudioWordIndex : this.currentWordIndex;
    if (targetIdx > 0) {
      this.scrollWordIntoView(targetIdx);
      setTimeout(() => this.checkBackToReadingVisibility(), 400);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.openChapter(this.currentPage);
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.openChapter(this.currentPage - 2);
    }
  }

  /**
   * Abre otro capítulo y, cuando termina de maquetarse, muestra el pliego pedido (por
   * número o como fracción del capítulo) o la palabra pedida, resaltada unos segundos.
   */
  private openChapter(index: number, target: { spread?: number; fraction?: number; wordIdx?: number } = {}) {
    if (index < 0 || index >= this.chapters.length) return;
    this.stopNarrationForChapterChange();
    if (target.wordIdx !== undefined) {
      this.savedProgressData = { percentage: 0, wordId: `word-${target.wordIdx}`, timestamp: Date.now() };
    } else if (target.spread !== undefined && this.isDoublePageView) {
      this.pendingSpreadIndex = target.spread;
    } else if (target.fraction !== undefined && this.isDoublePageView) {
      this.pendingSpreadFraction = target.fraction;
    }
    this.currentPage = index + 1;
    this.currentSpreadIndex = 0;
    this.renderCurrentChapter();
    this.saveProgressSubject.next(index);
    this.loadAvatars(); // los personajes se desbloquean por capítulo
  }

  /** Cambiar de capítulo a mano detiene la narración: seguiría leyendo el capítulo anterior. */
  private stopNarrationForChapterChange() {
    const narrating = this.isAudioLoading || this.audioService.isPlaying || this.audioService.isPaused
      || this.kokoroVoice.isSpeaking$.value || this.nativeTts.isSpeaking$.value;
    if (narrating) this.stopAudio(true);
  }

  // ── MÉTODOS DE VISTA DE LIBRO REAL (DOBLE PÁGINA) ──────────────────
  get isFirstSpread(): boolean {
    return this.currentSpreadIndex === 0;
  }

  get isLastSpread(): boolean {
    return this.currentSpreadIndex >= this.totalSpreads - 1;
  }

  toggleDoublePageView(enabled?: boolean) {
    // Se conserva la página: la primera palabra visible sigue a la vista en el otro modo.
    const anchor = this.visibleWordRange()?.[0] ?? -1;
    this.isDoublePageView = enabled !== undefined ? enabled : !this.isDoublePageView;
    localStorage.setItem('reader-double-page', String(this.isDoublePageView));
    this.invalidateRulerLines(); // cambia por completo el layout (columnas vs. continuo)
    this.currentSpreadIndex = 0;
    this.pendingSpreadIndex = null;
    this.pendingSpreadFraction = null;
    this.cdr.detectChanges();
    setTimeout(() => {
      const canvas = this.canvasEl();
      if (canvas) {
        canvas.scrollLeft = 0;
        canvas.scrollTop = 0;
      }
      this.recalculateSpreads();
      const el = anchor >= 0 ? document.getElementById(`word-${anchor}`) : null;
      if (el && this.isDoublePageView) {
        this.showSpreadOf(el, false);
      } else if (el) {
        el.scrollIntoView({ block: 'start' });
      }
      this.recomputeBookPages();
    }, 100);
  }

  /**
   * Mide el libro maquetado: renglones por página, cantidad de pliegos y página actual.
   * Con `keepAnchor` (cambio de letra o de ventana) vuelve a la página que se leía.
   */
  recalculateSpreads(keepAnchor: boolean = false) {
    if (!this.isDoublePageView) return;
    const canvas = this.canvasEl();
    if (!canvas) return;
    this.invalidateRulerLines(); // el layout de columnas puede haber cambiado
    this.fitLinesToPage(canvas);

    const gap = this.columnGap(canvas);
    const stride = this.spreadStride(canvas);
    const scrollWidth = canvas.scrollWidth || canvas.clientWidth || 1;
    this.columnsPerSpread = Math.max(1, parseInt(getComputedStyle(canvas).columnCount, 10) || 1);
    this.totalSpreads = Math.max(1, Math.ceil((scrollWidth + gap - 10) / stride));

    const anchorEl = keepAnchor && this.spreadAnchorWord >= 0
      ? document.getElementById(`word-${this.spreadAnchorWord}`)
      : null;
    if (anchorEl) {
      this.currentSpreadIndex = this.spreadOfElement(anchorEl, canvas);
    }
    if (this.isFullyRendered && this.pendingSpreadFraction !== null) {
      this.currentSpreadIndex = Math.round(this.pendingSpreadFraction * this.totalSpreads);
      this.pendingSpreadFraction = null;
    }
    if (this.isFullyRendered && this.pendingSpreadIndex !== null) {
      this.currentSpreadIndex = this.pendingSpreadIndex;
      this.pendingSpreadIndex = null;
    }
    this.currentSpreadIndex = Math.max(0, Math.min(this.currentSpreadIndex, this.totalSpreads - 1));
    canvas.scrollLeft = this.currentSpreadIndex * stride; // alinea el pliego tras cualquier reflujo

    this.updateSpreadPages();
    this.updateSpreadProgress();
    this.afterSpreadChange();
    this.cdr.detectChanges();
  }

  updateSpreadProgress() {
    if (!this.isDoublePageView) return;
    const progress = this.totalSpreads > 1
      ? (this.currentSpreadIndex / (this.totalSpreads - 1))
      : 1;
    this.chapterScrollPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
    this.isNearEnd = this.currentSpreadIndex >= this.totalSpreads - 1;

    const exactPage = (this.currentPage - 1) + (this.totalSpreads > 1 ? (this.currentSpreadIndex / this.totalSpreads) : 0);
    this.saveProgressSubject.next(exactPage);
    this.checkBackToReadingVisibility();
  }

  updateSpreadPages() {
    this.currentLeftPageNum = (this.currentSpreadIndex * 2) + 1;
    this.currentRightPageNum = (this.currentSpreadIndex * 2) + 2;
    this.recomputeBookPages();
  }

  turnSpreadNext() {
    if (!this.isDoublePageView) {
      this.nextPage();
      return;
    }
    if (this.currentSpreadIndex < this.totalSpreads - 1) {
      this.goToSpread(this.currentSpreadIndex + 1, { animate: true, delayScroll: true });
    } else if (this.currentPage < this.totalPages) {
      this.nextPage();
    }
  }

  turnSpreadPrev() {
    if (!this.isDoublePageView) {
      this.previousPage();
      return;
    }
    if (this.currentSpreadIndex > 0) {
      this.goToSpread(this.currentSpreadIndex - 1, { animate: true, delayScroll: true });
    } else if (this.currentPage > 1) {
      // Como en un libro de papel: al retroceder se llega a la ÚLTIMA página del capítulo anterior.
      this.openChapter(this.currentPage - 2, { spread: Infinity });
    }
  }

  /**
   * Muestra un pliego del capítulo abierto. `animate` activa el volteo de página;
   * `delayScroll` cambia el texto a mitad del volteo (pasar página a mano) en vez de
   * al instante (la narración o un salto, que necesitan medir la página nueva ya).
   */
  private goToSpread(index: number, opts: { animate?: boolean; delayScroll?: boolean } = {}) {
    const canvas = this.canvasEl();
    if (!canvas || !this.isDoublePageView) return;
    const target = Math.max(0, Math.min(index, this.totalSpreads - 1));
    const direction: 'next' | 'prev' = target >= this.currentSpreadIndex ? 'next' : 'prev';
    this.invalidateRulerLines(); // el pliego cambia: las líneas visibles ya no son las mismas
    this.currentSpreadIndex = target;
    this.updateSpreadPages();
    this.updateSpreadProgress();

    const applyScroll = () => {
      canvas.scrollTo({ left: this.currentSpreadIndex * this.spreadStride(canvas), behavior: 'instant' as any });
      this.afterSpreadChange();
    };
    if (!opts.animate) {
      applyScroll();
      return;
    }

    this.flipDirection = direction;
    this.isPageFlipping = true;
    if (opts.delayScroll) {
      setTimeout(applyScroll, 130); // volteo suave: el texto cambia a mitad del giro
    } else {
      applyScroll();
    }
    clearTimeout(this.flipTimer);
    this.flipTimer = setTimeout(() => {
      this.isPageFlipping = false;
      this.afterSpreadChange();
      this.cdr.detectChanges();
    }, 360);
  }

  /** Muestra el pliego que contiene un elemento (una palabra) del capítulo abierto. */
  private showSpreadOf(el: HTMLElement, animate: boolean) {
    const canvas = this.canvasEl();
    if (!canvas) return;
    const spread = this.spreadOfElement(el, canvas);
    if (spread >= this.totalSpreads) this.recalculateSpreads(); // el capítulo seguía cargando
    if (spread !== this.currentSpreadIndex) {
      this.goToSpread(spread, { animate, delayScroll: false });
    }
  }

  /** Tras cambiar de pliego: marcador de la página, ancla de lectura y pestaña de la voz. */
  private afterSpreadChange() {
    this.refreshVisiblePage();
    this.updateNarrationMarker();
    this.checkBackToReadingVisibility(); // con el pliego nuevo ya a la vista
  }

  private canvasEl(): HTMLElement | null {
    return document.querySelector('.reading-canvas') as HTMLElement | null;
  }

  /** Separación entre columnas (el lomo en vista libro; 0 con una sola página). */
  private columnGap(canvas: HTMLElement): number {
    const gap = parseFloat(getComputedStyle(canvas).columnGap);
    return isNaN(gap) ? 0 : gap;
  }

  /** Desplazamiento horizontal entre un pliego y el siguiente. */
  private spreadStride(canvas: HTMLElement): number {
    return (canvas.clientWidth || 1) + this.columnGap(canvas);
  }

  private spreadOfElement(el: HTMLElement, canvas: HTMLElement): number {
    const r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2 - canvas.getBoundingClientRect().left + canvas.scrollLeft;
    return Math.max(0, Math.floor(x / this.spreadStride(canvas)));
  }

  /** Página del capítulo (0 = la primera) en la que cae un elemento, en vista libro. */
  private pageOfElement(el: HTMLElement, canvas: HTMLElement): number {
    const stride = this.spreadStride(canvas);
    const r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2 - canvas.getBoundingClientRect().left + canvas.scrollLeft;
    const spread = Math.max(0, Math.floor(x / stride));
    const column = Math.floor((x - spread * stride) / (stride / this.columnsPerSpread));
    return spread * this.columnsPerSpread + Math.min(this.columnsPerSpread - 1, Math.max(0, column));
  }

  /**
   * Ajusta el alto de la página a los renglones enteros que caben en el espacio
   * disponible, así ningún renglón queda cortado y la regla de lectura calza.
   */
  private fitLinesToPage(canvas: HTMLElement) {
    const shell = canvas.parentElement;
    if (!shell) return;
    const renglon = Math.round(this.fontSize * this.lineHeight) || 32;
    const lines = Math.max(6, Math.floor((shell.clientHeight - 32) / renglon)); // 32 = padding vertical del lienzo
    if (lines !== this.linesPerPage || !canvas.style.getPropertyValue('--reader-lines-per-page')) {
      this.linesPerPage = lines;
      canvas.style.setProperty('--reader-lines-per-page', String(lines));
    }
  }

  /** La tipografía o el espacio cambió: vuelve a medir los pliegos sin perder la página. */
  private scheduleRelayout() {
    if (!this.isDoublePageView || !this.isFullyRendered) return;
    clearTimeout(this.relayoutTimer);
    this.relayoutTimer = setTimeout(() => this.recalculateSpreads(true), 80);
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.invalidateRulerLines(); // el reflow puede desplazar todas las líneas
    if (this.isDoublePageView) {
      this.recalculateSpreads(true);
    } else {
      this.updateNarrationMarker();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onReaderKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }
    if (this.isVocabularyOpen) return; // el panel de vocabulario tiene su propio teclado
    // Izquierda/derecha cambian de página o capítulo en cualquier modo de vista:
    // turnSpreadNext/turnSpreadPrev ya delegan a nextPage/previousPage cuando no
    // está activa la doble página, así que no hace falta repetir esa rama aquí.
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      this.turnSpreadNext();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      this.turnSpreadPrev();
    } else if (event.key === 'ArrowDown') {
      // Arriba/abajo mueven la regla de lectura línea a línea, sólo si está activada.
      if (!this.rulerActive) return;
      event.preventDefault();
      this.moveRulerByLine(1);
    } else if (event.key === 'ArrowUp') {
      if (!this.rulerActive) return;
      event.preventDefault();
      this.moveRulerByLine(-1);
    }
  }

  // ── PÁGINA VISIBLE ────────────────────────────────────────────────

  /** ¿La palabra se ve ahora? (en vista libro, las de otros pliegos están ocultas a los lados). */
  private isWordVisible(idx: number): boolean {
    const el = document.getElementById(`word-${idx}`);
    const canvas = this.canvasEl();
    if (!el || !canvas) return false;
    const r = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    return cx >= cr.left && cx <= cr.right && cy >= cr.top && cy <= cr.bottom;
  }

  /**
   * Primera y última palabra visibles del capítulo. Las palabras van en orden de lectura
   * (de arriba abajo y de una columna a la siguiente), así que basta una búsqueda binaria.
   */
  private visibleWordRange(): [number, number] | null {
    const canvas = this.canvasEl();
    if (!canvas || this.totalWordCount === 0) return null;
    const cr = canvas.getBoundingClientRect();
    const place = (i: number): number => { // -1 antes de la vista, 0 visible, 1 después
      const el = document.getElementById(`word-${i}`);
      if (!el) return 1; // todavía no renderizada: está más adelante
      const r = el.getBoundingClientRect();
      if (this.isDoublePageView) {
        const cx = (r.left + r.right) / 2;
        return cx < cr.left ? -1 : cx > cr.right ? 1 : 0;
      }
      const cy = (r.top + r.bottom) / 2;
      return cy < cr.top ? -1 : cy > cr.bottom ? 1 : 0;
    };

    let lo = 0, hi = this.totalWordCount - 1, first = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (place(mid) >= 0) { first = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    if (first < 0 || place(first) !== 0) return null;

    lo = first; hi = this.totalWordCount - 1;
    let last = first;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (place(mid) <= 0) { last = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return [first, last];
  }

  /** Actualiza lo que depende de la página a la vista: su marcador y el ancla de lectura. */
  private refreshVisiblePage() {
    const range = this.visibleWordRange();
    this.spreadAnchorWord = range ? range[0] : -1;
    const chapterIndex = this.currentPage - 1;
    this.currentSpreadBookmark = range
      ? this.bookmarks.find(b => b.chapterIndex === chapterIndex && b.wordIdx >= range[0] && b.wordIdx <= range[1]) || null
      : null;
  }

  /** En lectura continua el scroll es constante: se recalcula como mucho una vez por cuadro. */
  private scheduleVisibleRefresh() {
    if (this.visibleRefreshRaf !== null) return;
    this.visibleRefreshRaf = requestAnimationFrame(() => {
      this.visibleRefreshRaf = null;
      this.refreshVisiblePage();
    });
  }

  // ── LÍNEA DEL LIBRO ───────────────────────────────────────────────

  private textLength(html: string): number {
    return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, 'x').replace(/\s+/g, ' ').trim().length;
  }

  /** Largo en caracteres de cada párrafo (o verso) de un capítulo. */
  private paragraphLengths(html: string): number[] {
    return (html || '')
      .split(/<\/(?:p|div|h[1-6]|blockquote|li)\s*>|<br\s*\/?>/i)
      .map(part => this.textLength(part))
      .filter(len => len > 0);
  }

  /**
   * Renglones que ocupa un capítulo si caben `charsPerLine` caracteres por renglón.
   * Se cuenta párrafo a párrafo: un diálogo corto ocupa un renglón entero, así que los
   * capítulos con mucho diálogo tienen más páginas que las que diría su largo total.
   */
  private chapterLines(index: number, charsPerLine: number): number {
    const gap = this.paraSpacing === 'relaxed' ? 2 : this.paraSpacing === 'normal' ? 1 : 0;
    let lines = 4; // el título del capítulo, con su aire
    for (const len of this.chapterParagraphLengths[index] || []) lines += Math.ceil(len / charsPerLine) + gap;
    return lines;
  }

  /**
   * Caracteres por renglón que reproducen las páginas de los capítulos ya maquetados
   * (búsqueda binaria: a más caracteres por renglón, menos renglones). Sin capítulos
   * medidos, se deduce del ancho de la columna y del tamaño de letra.
   */
  private calibrateCharsPerLine(perSpread: number): number {
    const measured = [...this.measuredChapterPages.entries()].filter(([, pages]) => pages >= 3 * perSpread);
    if (!measured.length) {
      const canvas = this.canvasEl();
      const columnWidth = canvas && this.isDoublePageView
        ? (canvas.clientWidth - this.columnGap(canvas) * (perSpread - 1)) / perSpread
        : 0;
      return columnWidth ? Math.max(12, columnWidth / (this.fontSize * 0.46)) : 60;
    }
    // La última hoja de cada capítulo suele ir a medio llenar: cuenta como media.
    const target = measured.reduce((sum, [, pages]) => sum + (pages - perSpread / 2) * this.linesPerPage, 0);
    let lo = 8, hi = 400;
    for (let step = 0; step < 24; step++) {
      const mid = (lo + hi) / 2;
      const lines = measured.reduce((sum, [index]) => sum + this.chapterLines(index, mid), 0);
      if (lines > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Numera las páginas de todo el libro: las de los capítulos ya maquetados son exactas;
   * las de los demás se estiman por sus renglones (cada capítulo empieza en página impar).
   */
  private recomputeBookPages() {
    const chapterCount = this.chapterParagraphLengths.length;
    if (!chapterCount) return;
    const cur = Math.min(Math.max(this.currentPage - 1, 0), chapterCount - 1);
    const perSpread = this.isDoublePageView ? this.columnsPerSpread : 1;

    // Otra letra, otro tamaño u otro ancho de página invalidan lo medido.
    const layoutKey = this.bookLayoutKey();
    if (layoutKey !== this.measuredLayoutKey) {
      this.measuredLayoutKey = layoutKey;
      this.measuredChapterPages.clear();
    }
    if (this.isDoublePageView && this.isFullyRendered) {
      this.measuredChapterPages.set(cur, this.totalSpreads * perSpread);
    }
    const charsPerLine = this.calibrateCharsPerLine(perSpread);

    let start = 1;
    const starts: number[] = [];
    this.chapterPageEstimates = this.chapterParagraphLengths.map((_, i) => {
      const measured = this.measuredChapterPages.get(i);
      const pages = measured !== undefined
        ? measured
        : Math.ceil(Math.max(1, Math.ceil(this.chapterLines(i, charsPerLine) / this.linesPerPage)) / perSpread) * perSpread;
      starts.push(start);
      start += pages;
      return pages;
    });
    this.chapterStartPages = starts;
    this.bookPageTotal = Math.max(1, start - 1);
    this.bookPageCurrent = Math.min(this.bookPageTotal, starts[cur] + this.currentSpreadIndex * perSpread);
  }

  private bookLayoutKey(): string {
    const canvas = this.canvasEl();
    return [this.isDoublePageView, this.columnsPerSpread, this.linesPerPage, canvas?.clientWidth ?? 0,
      this.fontSize, this.currentFontFamily, this.lineHeight, this.letterSpacing, this.wordSpacing,
      this.textAlign, this.paraSpacing, this.bionicReadingActive, this.showSceneImages].join('|');
  }

  private chapterIndexForBookPage(page: number): number {
    let index = 0;
    for (let i = 0; i < this.chapterStartPages.length && this.chapterStartPages[i] <= page; i++) index = i;
    return index;
  }

  chapterLabel(index: number): string {
    return this.chapters[index]?.title || `Capítulo ${index + 1}`;
  }

  /** Parte ya leída de la línea del libro (sigue al dedo mientras se arrastra). */
  get sliderFillPercent(): number {
    const page = this.sliderDragPage ?? this.bookPageCurrent;
    return this.bookPageTotal > 1 ? ((page - 1) / (this.bookPageTotal - 1)) * 100 : 100;
  }

  /** Mientras se arrastra la línea del libro: muestra a qué página y capítulo se iría. */
  onBookSliderInput(value: string | number) {
    const page = Math.round(Number(value));
    this.sliderDragPage = page;
    this.sliderPreviewLabel = `Pág. ${page} · ${this.chapterLabel(this.chapterIndexForBookPage(page))}`;
  }

  onBookSliderChange(value: string | number) {
    this.sliderDragPage = null;
    this.sliderPreviewLabel = '';
    this.goToBookPage(Math.round(Number(value)));
  }

  goToBookPage(page: number) {
    if (!this.chapterStartPages.length) return;
    const index = this.chapterIndexForBookPage(page);
    const perSpread = this.isDoublePageView ? this.columnsPerSpread : 1;
    const spread = Math.max(0, Math.floor((page - this.chapterStartPages[index]) / perSpread));
    if (index === this.currentPage - 1) {
      this.goToSpread(spread, { animate: true, delayScroll: true });
    } else {
      // Las páginas de ese capítulo son estimadas: se va a la misma fracción del capítulo.
      const estimatedSpreads = Math.max(1, (this.chapterPageEstimates[index] || perSpread) / perSpread);
      this.openChapter(index, { fraction: Math.min(1, spread / estimatedSpreads) });
    }
  }

  /** Página del libro (exacta en el capítulo abierto, estimada en el resto) de una palabra. */
  bookPageOfWord(chapterIndex: number, wordIdx: number, chapterWordCount?: number): number {
    if (!this.chapterStartPages.length) this.recomputeBookPages();
    const start = this.chapterStartPages[chapterIndex] ?? 1;
    const pages = this.chapterPageEstimates[chapterIndex] ?? 1;
    if (chapterIndex === this.currentPage - 1 && this.isDoublePageView) {
      const el = document.getElementById(`word-${wordIdx}`);
      const canvas = this.canvasEl();
      if (el && canvas) return start + this.pageOfElement(el, canvas);
    }
    const words = chapterWordCount || Math.max(1, Math.round((this.chapterTextLengths[chapterIndex] || 0) / 5.8));
    return start + Math.min(pages - 1, Math.floor((wordIdx / Math.max(1, words)) * pages));
  }

  /** Para el panel de vocabulario (función flecha: conserva `this`). */
  readonly vocabularyPageLabel = (chapterIndex: number, wordIdx: number, wordCount: number): string =>
    `pág. ${this.bookPageOfWord(chapterIndex, wordIdx, wordCount)}`;

  /** Lleva a una palabra de cualquier capítulo y la resalta unos segundos. */
  private jumpToWord(chapterIndex: number, wordIdx: number, label: string) {
    this.nextJumpLabel = label;
    if (chapterIndex === this.currentPage - 1) {
      this.scrollWordIntoView(wordIdx, true);
    } else {
      this.openChapter(chapterIndex, { wordIdx });
    }
  }

  // ── MARCADORES DE PÁGINA ──────────────────────────────────────────

  private loadBookmarks() {
    if (!this.inventoryId) return;
    this.api.get<any[]>(`library/bookmarks/?inventory=${this.inventoryId}`).subscribe({
      next: rows => {
        this.bookmarks = (Array.isArray(rows) ? rows : [])
          .map(row => this.toPageBookmark(row))
          .filter((b): b is PageBookmark => b !== null)
          .sort((a, b) => a.chapterIndex - b.chapterIndex || a.wordIdx - b.wordIdx);
        this.refreshVisiblePage();
        this.refreshBookmarkLabels();
      },
      error: err => console.warn('No se pudieron cargar los marcadores', err),
    });
  }

  /** Los marcadores de página guardan su posición como {v: 1, cid: capítulo, ch: índice, w: palabra}. */
  private toPageBookmark(row: any): PageBookmark | null {
    try {
      const position = JSON.parse(row?.position_cfi || '');
      if (position?.v !== 1 || typeof position.w !== 'number') return null;
      let chapterIndex = this.chapters.findIndex(c => String(c.id) === String(position.cid));
      if (chapterIndex < 0 && typeof position.ch === 'number') chapterIndex = position.ch;
      if (chapterIndex < 0 || chapterIndex >= this.chapters.length) return null;
      return {
        id: String(row.id),
        chapterId: String(position.cid || ''),
        chapterIndex,
        wordIdx: position.w,
        snippet: row.note || '',
        createdAt: row.created_at || '',
      };
    } catch {
      return null;
    }
  }

  /** Botón marcador del libro: marca la página a la vista o quita su marcador. */
  toggleBookmarkHere() {
    if (this.isBookmarkBusy || !this.inventoryId) return;
    this.refreshVisiblePage();
    const existing = this.currentSpreadBookmark;
    if (existing) {
      this.removeBookmark(existing);
      return;
    }

    const range = this.visibleWordRange();
    const chapter = this.chapters[this.currentPage - 1];
    if (!range || !chapter) return;
    const payload = {
      inventory: this.inventoryId,
      position_cfi: JSON.stringify({ v: 1, cid: chapter.id, ch: this.currentPage - 1, w: range[0] }),
      note: this.snippetFrom(range[0]),
      color: '#b3261e',
    };
    const page = this.bookPageCurrent;
    this.isBookmarkBusy = true;
    this.api.post<any>('library/bookmarks/', payload).subscribe({
      next: row => {
        const bookmark = this.toPageBookmark(row);
        if (bookmark) {
          this.bookmarks = [...this.bookmarks, bookmark]
            .sort((a, b) => a.chapterIndex - b.chapterIndex || a.wordIdx - b.wordIdx);
        }
        this.isBookmarkBusy = false;
        this.refreshVisiblePage();
        this.refreshBookmarkLabels();
        this.flashToast('🔖', this.isDoublePageView ? `Página ${page} marcada` : 'Marcador guardado');
      },
      error: () => {
        this.isBookmarkBusy = false;
        this.flashToast('⚠️', 'No se pudo guardar el marcador');
      },
    });
  }

  removeBookmark(bookmark: PageBookmark, event?: Event) {
    event?.stopPropagation();
    if (this.isBookmarkBusy) return;
    this.isBookmarkBusy = true;
    this.api.delete(`library/bookmarks/${bookmark.id}/`).subscribe({
      next: () => {
        this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
        this.isBookmarkBusy = false;
        this.refreshVisiblePage();
        this.flashToast('🔖', 'Marcador quitado');
      },
      error: () => {
        this.isBookmarkBusy = false;
        this.flashToast('⚠️', 'No se pudo quitar el marcador');
      },
    });
  }

  goToBookmark(bookmark: PageBookmark) {
    this.isTocOpen = false;
    this.jumpToWord(bookmark.chapterIndex, bookmark.wordIdx, 'Marcador en');
  }

  bookmarkPageLabel(bookmark: PageBookmark): string {
    return `Pág. ${this.bookPageOfWord(bookmark.chapterIndex, bookmark.wordIdx)}`;
  }

  private refreshBookmarkLabels() {
    this.bookmarks.forEach(bookmark => bookmark.pageLabel = this.bookmarkPageLabel(bookmark));
  }

  trackBookmark = (_: number, bookmark: PageBookmark) => bookmark.id;

  /** Las primeras palabras de la página, para reconocer el marcador en la lista. */
  private snippetFrom(wordIdx: number, count: number = 16): string {
    const words: string[] = [];
    for (let i = wordIdx; i < wordIdx + count; i++) {
      const el = document.getElementById(`word-${i}`);
      if (!el) break;
      words.push((el.textContent || '').trim());
    }
    return words.join(' ').slice(0, 160);
  }

  private flashToast(icon: string, text: string) {
    this.toastIcon = icon;
    this.bookmarkToastText = text;
    this.showBookmarkToast = true;
    clearTimeout(this.bookmarkToastTimer);
    this.bookmarkToastTimer = setTimeout(() => this.showBookmarkToast = false, 2500);
  }

  // ── NARRACIÓN DESDE EL LIBRO ──────────────────────────────────────

  get isNarrationPlaying(): boolean {
    if (this.currentAudioMode === 'kokoro') return this.kokoroVoice.isSpeaking$.value;
    if (this.currentAudioMode === 'native-android') return this.nativeTts.isSpeaking$.value;
    return this.audioService.isPlaying;
  }

  /** Botón de la barra del libro: reproduce, pausa o reanuda sin abrir el panel de voces. */
  toggleNarration() {
    if (this.isAudioLoading) return;
    if (this.isNarrationPlaying) {
      if (this.currentAudioMode === 'kokoro') this.kokoroVoice.stop();
      else if (this.currentAudioMode === 'native-android') this.nativeTts.stop();
      else this.audioService.pause();
    } else if (this.currentAudioMode !== 'kokoro' && this.currentAudioMode !== 'native-android' && this.audioService.isPaused) {
      this.resumeAudio();
    } else {
      this.playAudio();
    }
  }

  /** Narra desde la primera palabra de la página que se está viendo. */
  narrateFromHere() {
    const range = this.visibleWordRange();
    if (range) {
      this.lastAudioWordIndex = range[0];
      this.currentWordIndex = range[0];
      this.saveAudioPosition();
    }
    this.stopAudio(true);
    setTimeout(() => this.playAudio(), 120);
  }

  /** Palabra que está leyendo la narración (cualquier motor). -1 = se detuvo. */
  private onNarrationWord(idx: number) {
    this.currentWordIndex = idx;
    if (idx !== -1) {
      this.lastAudioWordIndex = idx;
      this.saveAudioPosition();
    }
    this.cdr.detectChanges(); // Forzar re-render sin borrar el DOM
    if (idx !== -1) this.scrollWordIntoView(idx);
    this.narrationWordIdx = idx;
    this.updateNarrationMarker();
  }

  /**
   * Pestaña del margen que acompaña a la voz: se ubica a la altura del renglón que se
   * está leyendo, en el margen exterior de su página, y baja renglón a renglón.
   */
  private updateNarrationMarker() {
    const marker = this.narrationMarkerRef?.nativeElement;
    if (!marker) return;
    const host = marker.offsetParent as HTMLElement | null;
    const canvas = this.canvasEl();
    const el = this.narrationWordIdx >= 0 ? document.getElementById(`word-${this.narrationWordIdx}`) : null;
    if (!el || !host || !canvas) {
      marker.classList.remove('is-visible');
      return;
    }

    const hr = host.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) {
      marker.classList.remove('is-visible'); // la palabra quedó fuera de la vista
      return;
    }

    let side: 'left' | 'right' = 'left';
    let x: number;
    if (this.isDoublePageView && this.columnsPerSpread > 1) {
      side = cx > cr.left + cr.width / 2 ? 'right' : 'left';
      x = side === 'left' ? (cr.left - hr.left) / 2 : (cr.right - hr.left) + (hr.right - cr.right) / 2;
    } else if (this.isDoublePageView) {
      x = (cr.left - hr.left) / 2;
    } else {
      const block = (el.closest('p, h1, h2, h3, blockquote') as HTMLElement | null) || el;
      x = Math.max(14, block.getBoundingClientRect().left - hr.left - 22);
    }
    const y = cy - hr.top;

    if (marker.dataset['side'] !== side && marker.classList.contains('is-visible')) {
      // Al pasar a la otra página no cruza el lomo en diagonal: aparece directamente allá.
      marker.style.transition = 'none';
      marker.style.left = `${x}px`;
      marker.style.top = `${y}px`;
      void marker.offsetWidth;
      marker.style.transition = '';
    }
    marker.dataset['side'] = side;
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.classList.add('is-visible');
  }

  // ── FAVORITO Y VOCABULARIO ────────────────────────────────────────

  get isFavoriteBook(): boolean {
    return !!this._bookIdForSession && this.favorites.isFavorite(this._bookIdForSession, this.bookSlug);
  }

  toggleFavorite() {
    const bookId = this._bookIdForSession;
    if (!bookId) return;
    const favorite = !this.isFavoriteBook;
    this.favorites.setFavorite(bookId, favorite).subscribe({
      next: () => this.flashToast(favorite ? '⭐' : '☆', favorite ? 'Agregado a favoritos' : 'Quitado de favoritos'),
      error: () => this.flashToast('⚠️', 'No se pudo actualizar tus favoritos'),
    });
  }

  openVocabulary() {
    this.isVocabularyOpen = true;
    this.isTocOpen = false;
    this.isSettingsOpen = false;
  }

  onVocabularyJump(target: VocabularyJump) {
    this.isVocabularyOpen = false;
    this.jumpToWord(target.chapterIndex, target.wordIdx, 'Palabra en');
  }

  // ── PERSONAJES ────────────────────────────────────────────────────
  toggleCharPanel() {
    this.isCharPanelOpen = !this.isCharPanelOpen;
    if (this.isCharPanelOpen) {
      this.isTocOpen = false;
      this.isSettingsOpen = false;
      if (this.avatars.length === 0) this.loadAvatars();
    }
    // Cerrar perfil y chat al cerrar el panel
    if (!this.isCharPanelOpen) {
      this.showCharProfile = false;
      if (this.isChatOpen) {
        this.isChatOpen = false;
        this.stopCallMode();
      }
    }
  }

  loadAvatars() {
    this.api.get(`ai/avatars/?inventory_id=${this.inventoryId}`).subscribe({
      next: (res: any) => { this.avatars = res; },
      error: (err) => console.warn('No hay personajes para este libro:', err)
    });
  }

  openCharProfile(avatar: any) {
    this.selectedAvatar = avatar;
    this.showCharProfile = true;
    this.isChatOpen = false;
  }

  closeCharProfile() {
    this.showCharProfile = false;
    this.selectedAvatar = null;
  }

  toggleVideoAvatar() {
    this.showVideoAvatar = !this.showVideoAvatar;
    // Siempre reajustar el scroll después de cambiar el layout del video
    setTimeout(() => this.scrollChatToBottom(), 150);
  }



  // ── CHAT ──────────────────────────────────────────────────────────
  startChat(avatar: any) {
    if (!avatar.is_unlocked) return;
    this.selectedAvatar = avatar;
    this.showCharProfile = false;

    this.api.get(`ai/sessions/?avatar_id=${avatar.id}`).subscribe({
      next: (session: any) => {
        this.chatSession = session;
        this.loadChatHistory(session.id);
        this.isChatOpen = true;
        this.isCharPanelOpen = true; // sidebar siempre abierto
        this.showVideoAvatar = false; // El video es MANUAL (botón 📞)
        setTimeout(() => this.scrollChatToBottom(), 200);
      },
      error: (err) => console.error('Error iniciando sesión de chat', err)
    });
  }

  loadChatHistory(sessionId: number) {
    this.api.get(`ai/sessions/${sessionId}/messages/`).subscribe({
      next: (msgs: any) => {
        this.chatMessages = msgs;
        // Scroll al final después de cargar el historial
        setTimeout(() => this.scrollChatToBottom(), 150);
      },
      error: (err) => console.error('Error cargando historial', err)
    });
  }

  sendMessage() {
    if (!this.chatInput.trim() || this.isSendingMessage || !this.chatSession) return;
    if (this.inkBalance <= 0) return;

    const content = this.chatInput.trim();
    this.chatInput = '';
    this.isSendingMessage = true;

    // Iniciar ciclo de expresiones
    this.startThinkingAnimation();

    // Añadir mensaje optimista del usuario
    this.chatMessages.push({
      role: 'user',
      content,
      created_at: new Date().toISOString()
    });

    this.api.post('ai/chat/', {
      session_id: this.chatSession.id,
      message: content
    }).subscribe({
      next: (res: any) => {
        this.chatMessages.push({
          role: 'assistant',
          content: res.reply,
          created_at: res.timestamp
        });

        // Actualizar balance de tinta
        if (res.ink_balance !== undefined) {
          this.inkBalance = res.ink_balance;
          this.chatService.updateInkBalance(res.ink_balance);
        }

        // Actualizar estado IA
        this.aiProvider = res.ai_provider || 'gemini';
        this.aiStatus = res.ai_status || 'ok';

        this.isSendingMessage = false;
        this.stopThinkingAnimation();
        setTimeout(() => this.scrollChatToBottom(), 50);

        // Hablar respuesta si el avatar está visible o siempre (según preferencia)
        this.speakChatReply(res.reply);
      },
      error: (err) => {
        console.error('Error en el chat', err);
        this.isSendingMessage = false;
        this.stopThinkingAnimation();
        this.aiStatus = 'error';
        // Eliminar mensaje optimista si hubo error
        this.chatMessages.pop();
        this.chatInput = content;
      }
    });
  }

  formatMessage(text: string): string {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  private startThinkingAnimation() {
    if (this.thinkingInterval) return;
    this.activeThinkingFrame = 1;
    this.thinkingInterval = setInterval(() => {
      this.activeThinkingFrame = this.activeThinkingFrame === 1 ? 2 : 1;
      this.cdr.detectChanges();
    }, 2000);
  }

  private stopThinkingAnimation() {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    this.activeThinkingFrame = 1;
  }

  get isMuted() {
    return this.kokoroVoice.isMuted$.value;
  }

  toggleMute() {
    this.kokoroVoice.toggleMute();
  }

  playMessageAudio(msg: any) {
    if (!msg || !msg.content) return;
    // Si el usuario da click a Replay, reproducimos sin importar el Mute global
    // Pero temporalmente, el Mute global del kokoroService aborta el .speak().
    // Tendríamos que llamar a `.speak` desmuteando o ignorando.
    // La mejor forma es quitar temporalmente el mute si está silenciado
    const wasMuted = this.kokoroVoice.isMuted$.value;
    if (wasMuted) {
      this.kokoroVoice.isMuted$.next(false);
    }

    this.speakChatReply(msg.content);

    if (wasMuted) {
      // Restaurar mute después de que inicie la generación
      setTimeout(() => this.kokoroVoice.isMuted$.next(true), 100);
    }
  }

  stopCallMode() {
    this.isCallMode = false;
    this.speechService.stopListening();
    this.kokoroVoice.stop();
  }

  toggleCallMode() {
    this.isCallMode = !this.isCallMode;
    if (this.isCallMode) {
      this.speechService.startListening();
    } else {
      this.stopCallMode();
      // Pequeño delay para que el *ngIf restaure el DOM y podamos scrollear
      setTimeout(() => this.scrollChatToBottom(), 100);
    }
  }

  closeChat() {
    this.isChatOpen = false;
    this.stopCallMode();
  }

  private scrollChatToBottom() {
    // Actualizado al nuevo selector del diseño Character.ai
    const chatBody = document.querySelector('.chat-messages-area');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }


  private async speakChatReply(text: string) {
    const charName = this.selectedAvatar?.name || 'Unknown';
    const nameLower = charName.toLowerCase();

    let voiceId = 'ef_dora'; // Default female

    // Voces masculinas maduras/autoridad
    if (nameLower.includes('alcalde') || nameLower.includes('rey') || nameLower.includes('padre') || nameLower.includes('señor')) {
      voiceId = 'em_santa';
    }
    // Voces masculinas juveniles
    else if (nameLower.includes('príncipe') || nameLower.includes('principe') || nameLower.includes('autor') || nameLower.includes('joven') || nameLower.includes('niño')) {
      voiceId = 'em_alex';
    }

    this.kokoroVoice.speak(text, this.chatSession?.avatar_id || this.authorAvatar?.id || 1, 0, voiceId);

    // Simular animación visual usando RxJs de kokoroVoice
    this.kokoroVoice.isSpeaking$.pipe(takeUntil(this.destroy$)).subscribe(speaking => {
      this.isVideoSpeaking = speaking;
      if (speaking) {
        this.activeTalkingFrame = Math.floor(Math.random() * 3) + 1;
        if (this.avatarVideoElement?.nativeElement) {
          const video = this.avatarVideoElement.nativeElement;
          video.currentTime = 1;
          video.play();
          video.ontimeupdate = () => {
            if (video.currentTime >= 6) video.currentTime = 1;
          };
        }
      } else {
        if (this.avatarVideoElement?.nativeElement) {
          this.avatarVideoElement.nativeElement.pause();
          this.avatarVideoElement.nativeElement.currentTime = 0;
        }
      }
      this.cdr.detectChanges();
    });
  }


  private loadInkBalance() {
    this.chatService.loadInitialInk();
  }

  // ── PERFORMANCE: trackBy para *ngFor ────────────────────────────
  /**
   * Evita re-renderizar bloques no modificados en capítulos largos.
   * Angular compara por referencia; trackBy le da una clave estable.
   */
  trackByBlock(index: number, block: any): number {
    return index;
  }

  trackByToken(index: number, token: any): number {
    return token.idx >= 0 ? token.idx : -(index + 1);
  }

  // ── MENU DE ACCIÓN DE PALABRA Y DICCIONARIO ───────────────────────
  showWordMenu: boolean = false;
  wordMenuX: number = 0;
  wordMenuY: number = 0;
  selectedText: string = '';
  isMenuBelow: boolean = false;

  // Diccionario Integrado
  showDictionaryModal: boolean = false;
  dictionaryResult: any = null;
  isDictionaryLoading: boolean = false;

  @HostListener('document:selectionchange', ['$event'])
  onSelectionChange() {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {

      // VERIFICAR QUE LA SELECCIÓN ESTÉ DENTRO DEL CONTENIDO DEL LIBRO (.reading-canvas)
      const anchorNode = selection.anchorNode;
      const readingCanvas = document.querySelector('.reading-canvas');
      if (anchorNode && readingCanvas && !readingCanvas.contains(anchorNode)) {
        this.showWordMenu = false;
        return;
      }

      // Usar setTimeout para dejar que el DOM se asiente
      setTimeout(() => {
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.selectedText = selection.toString().trim();

        // Coordenadas base
        this.wordMenuX = rect.left + (rect.width / 2);

        // Control de bordes (si está muy arriba, mostrar abajo)
        if (rect.top < 80) {
          this.wordMenuY = rect.bottom + 15;
          this.isMenuBelow = true;
        } else {
          this.wordMenuY = rect.top - 15;
          this.isMenuBelow = false;
        }

        this.showWordMenu = true;
      }, 50);
    } else {
      this.showWordMenu = false;
      this.selectedText = '';
    }
  }

  askCharacter() {
    if (!this.selectedText || this.characterAvatars.length === 0) {
      alert('No hay texto seleccionado o personajes disponibles.');
      return;
    }
    const defaultAvatar = this.characterAvatars[0];
    this.startChat(defaultAvatar);
    this.chatInput = `¿Qué significa esto en la historia?\n\n"${this.selectedText}"`;
    this.showWordMenu = false;
  }

  saveBookmark() {
    if (!this.selectedText) return;

    // Obtener el elemento y el ID de la palabra seleccionada de forma robusta
    const selection = window.getSelection();
    let wordId = '';
    let selectedWordEl: HTMLElement | null = null;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const anchorEl = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
      const focusEl = selection.focusNode instanceof HTMLElement ? selection.focusNode : selection.focusNode?.parentElement;
      const startEl = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer?.parentElement;

      selectedWordEl = anchorEl?.closest('.word') as HTMLElement ||
        focusEl?.closest('.word') as HTMLElement ||
        startEl?.closest('.word') as HTMLElement;

      if (!selectedWordEl && range.commonAncestorContainer) {
        const container = range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
        selectedWordEl = container?.querySelector('.word') as HTMLElement;
      }

      if (selectedWordEl && selectedWordEl.id) {
        wordId = selectedWordEl.id;
      }
    }

    if (!wordId && this.lastAudioWordIndex > 0) {
      wordId = `word-${this.lastAudioWordIndex}`;
    }

    // Calcular la página exacta actual
    const viewer = document.querySelector('.reading-canvas');
    let exactPage = this.currentPage - 1;
    if (viewer) {
      const scrollHeight = viewer.scrollHeight - viewer.clientHeight;
      const scrollPercent = scrollHeight > 0 ? viewer.scrollTop / scrollHeight : 0;
      exactPage += scrollPercent;
    }

    // Guardar en backend
    this.syncProgressToBackend(exactPage, wordId);

    // Guardar en localStorage para disponibilidad inmediata y soporte offline
    try {
      if (this.inventoryId) {
        localStorage.setItem(`bookmark_resume_${this.inventoryId}`, JSON.stringify({
          page: this.currentPage,
          wordId: wordId,
          timestamp: Date.now()
        }));
      }
    } catch (e) {
      console.warn('Error al guardar marcador local', e);
    }

    // Destello de confirmación visual en la palabra guardada
    if (selectedWordEl) {
      selectedWordEl.classList.add('bookmark-saved-flash');
      setTimeout(() => selectedWordEl?.classList.remove('bookmark-saved-flash'), 1200);
    }

    // Mostrar el toast de confirmación
    this.showBookmarkToast = true;
    setTimeout(() => {
      this.showBookmarkToast = false;
    }, 2500);

    this.showWordMenu = false;
  }

  playAudioFromSelection() {
    if (!this.selectedText) return;

    const selection = window.getSelection();
    let wordIdx = -1;

    if (selection && selection.rangeCount > 0) {
      const node = selection.anchorNode?.parentElement;
      const wordSpan = node?.closest('.word');
      if (wordSpan && wordSpan.id) {
        wordIdx = parseInt(wordSpan.id.replace('word-', ''), 10);
      }
    }

    this.showWordMenu = false;

    if (wordIdx !== -1 && !isNaN(wordIdx)) {
      this.lastAudioWordIndex = wordIdx;
      this.currentWordIndex = wordIdx;
      this.saveAudioPosition();
      this.stopAudio(true);

      // Pequeño retardo para asegurar que stopAudio finalice antes de iniciar el nuevo
      setTimeout(() => {
        // Forzar panel de audio abierto si no lo estaba
        if (!this.isAudioPanelOpen) this.isAudioPanelOpen = true;
        this.playAudio();
      }, 150);
    } else {
      // Si no detectó bien la palabra (seleccionó un espacio vacío), iniciamos normal
      if (!this.isAudioPanelOpen) this.isAudioPanelOpen = true;
      this.playAudio();
    }
  }

  defineWord() {
    if (!this.selectedText) return;

    // Ocultar menú de acción y mostrar modal de diccionario
    this.showWordMenu = false;
    this.showDictionaryModal = true;
    this.isDictionaryLoading = true;
    this.dictionaryResult = null;

    // Obtener primera palabra limpia
    const wordToSearch = this.selectedText.split(/\s+/)[0].replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');

    // Llamada a API de diccionario abierta (Wiktionary / Google / Diccionario abierto)
    // Usamos la API pública de Free Dictionary API (español soportado de forma limitada, pero sirve de mockup/demo funcional)
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/es/${encodeURIComponent(wordToSearch.toLowerCase())}`)
      .then(res => {
        if (!res.ok) throw new Error('No encontrado');
        return res.json();
      })
      .then(data => {
        this.dictionaryResult = data[0];
        this.isDictionaryLoading = false;
      })
      .catch(err => {
        this.dictionaryResult = { error: 'No se encontró una definición exacta para esta palabra.' };
        this.isDictionaryLoading = false;
      });
  }

  closeDictionary() {
    this.showDictionaryModal = false;
    this.dictionaryResult = null;
  }

  private syncProgressToBackend(exactPage: number, wordId: string = '') {
    if (!this.progressId || this.totalPages === 0) return;

    const percentage = Math.round((exactPage / this.totalPages) * 100);
    const safePercentage = Math.min(Math.max(percentage, 0), 100); // Evitar > 100%
    const intPage = Math.min(Math.floor(exactPage) + 1, this.totalPages); // Capitulo actual como entero

    // Calcular el porcentaje de scroll dentro del capítulo (0 a 1)
    const scrollPercent = exactPage - Math.floor(exactPage);

    // Crear el objeto ProgressData tipado
    const progressData: ProgressData = {
      percentage: safePercentage,
      wordId: wordId,
      timestamp: Date.now(),
      scrollPercent: scrollPercent
    };

    this.api.patch(`library/progress/${this.progressId}/`, {
      current_page: intPage,
      completion_percentage: safePercentage,
      current_cfi: JSON.stringify(progressData)
    }).subscribe({
      next: () => console.log(`✅ Progreso guardado: Cap ${intPage} (${safePercentage}%), Palabra: ${wordId}`),
      error: (err) => console.error('Error guardando progreso', err)
    });
  }

  // ── MODAL PARA IMÁGENES EN CAPÍTULO ──────────────────────────────
  openImageModal(src?: string) {
    if (!src) return;
    this.modalImageSrc = src;
    this.showImageModal = true;
  }

  closeImageModal() {
    this.showImageModal = false;
    this.modalImageSrc = '';
  }

  // ── MANGA FRAME LOGIC ──────────────────────────────
  get isAudioSessionActive(): boolean {
    return this.lastAudioWordIndex >= 0 || this.isKokoroProcessing;
  }

  get showFloatingAudioControl(): boolean {
    return false; // Deprecated, using template logic instead
  }

  getMangaFrameUrl(): string {
    if (!this.selectedAvatar || !this.selectedAvatar.avatar_image_url) {
      return '';
    }
    const url = this.selectedAvatar.avatar_image_url;
    if (!url.includes('manga_assets')) {
      return url; // Si no es un asset de manga, devolver tal cual
    }

    // El base url es algo como .../manga_assets/uuid/calm.webp (o .png)
    let base = url;
    if (base.endsWith('calm.webp') || base.endsWith('calm.png')) {
      base = base.substring(0, base.lastIndexOf('/') + 1);
    } else {
      if (!base.endsWith('/')) base += '/';
    }

    if (this.isSendingMessage) {
      // Alternar entre calm y thinking cada 2s para sensacion de vida
      return this.activeThinkingFrame === 1 ? base + 'thinking.webp' : base + 'calm.webp';
    } else if (this.isVideoSpeaking) {
      return base + `talking_${this.activeTalkingFrame}.webp`;
    }
    return base + 'calm.webp'; // Por defecto
  }
}



