import { Component, OnInit, inject, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone, HostListener, ViewChild, ElementRef, signal } from '@angular/core';
import { Subject, Subscription, TimeoutError, EMPTY, of, timer } from 'rxjs';
import { catchError, concatMap, debounce, finalize, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { environment } from '../../../environments/environment';
import { StatusBar } from '@capacitor/status-bar';
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar';
import { Capacitor } from '@capacitor/core';
import { ReadingSessionService } from '../../core/services/reading-session.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ReaderTabsService } from '../../core/services/reader-tabs.service';
import { ReaderBlock, ReaderToken } from '../../core/utils/chapter-parser.util';
import { ChapterCache, PreparedChapter, prepareChapter } from './reader-chapter';
import { ReaderHighlighter } from './reader-highlighter';
import { VocabularyJump } from './vocabulary-panel/vocabulary-panel.component';
import { BookSearchService } from './book-search.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { NotificationService } from '../../core/services/notification.service';
import { VocabularyService } from '../../core/services/vocabulary.service';
import { ReaderLivePosition, ReaderProgressSnapshot, readerProgressPayload } from './reader-progress.util';
import { NotebookService } from '../../notebook/notebook.service';
import { ReadingSummaryContent, ReadingSummaryService } from '../../core/services/reading-summary.service';
import { ReaderSettingsService } from './reader-settings.service';
import { HIGHLIGHT_COLOR_OPTIONS, HighlightColor, ReaderSettings, SettingsTab } from './reader-settings';
import { ReadingPace } from './reading-pace';
import { ReaderRulerController } from './reader-ruler';
import { columnsForViewport, countChapterPages, countSpreads, spreadStride, pageOfElement, spreadOfElement, fitLinesToPage, swipePageDelta } from './reader-pager';
import { ReaderNarrationService } from './reader-narration.service';
import { PageBookmark, ReaderAnnotationsService, ReaderHighlight } from './reader-annotations.service';
import type { ReaderSelectionMenuComponent } from './reader-selection-menu/reader-selection-menu.component';
import type { ReaderPostItsComponent } from './reader-postits/reader-postits.component';
import type { ReportContextData } from './reader-report-modal/reader-report-modal.component';
import { BOOK_CSS_VAR_NAMES, BookFrame, bookCssVars, bookEdges, bookFrame } from './reader-book/reader-book-geometry';
import { loadCoverBoardColor } from './reader-book/reader-book-cover-color';
import { ReaderBookFlip } from './reader-book/reader-book-flip';
import { ReaderBookCover } from './reader-book/reader-book-cover';
import { FoldCorner } from './reader-book/reader-book-fold';
import { AuthService } from '../../core/services/auth.service';

export interface ProgressData {
  percentage: number;
  wordId: string;
  timestamp: number;
  scrollPercent?: number;
}

@Component({
  selector: 'app-reader',
  templateUrl: './reader.component.html',
  styleUrls: ['./reader.component.css', './reader-paged.css', './reader-book/reader-book.css'],
  // Búsqueda, ajustes, narración y anotaciones viven con cada lector abierto (los comparten sus hojas y paneles).
  providers: [BookSearchService, ReaderSettingsService, ReaderNarrationService, ReaderAnnotationsService],
})
export class ReaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private readingSummary = inject(ReadingSummaryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  public chatService = inject(ChatService);
  private readingSession = inject(ReadingSessionService);
  private favorites = inject(FavoritesService);
  private readerTabs = inject(ReaderTabsService);
  private notificationService = inject(NotificationService);
  private vocabularyService = inject(VocabularyService);
  readonly bookSearch = inject(BookSearchService);
  private characterChat = inject(CharacterChatService);
  readonly notebook = inject(NotebookService);
  private unregisterNotebook?: () => void;
  /** Pasaje pedido desde el cuaderno (?ir=<capítulo>:<palabra>) antes de que lleguen los capítulos. */
  private pendingPassage: { chapterId: string; word: number; lastWord: number } | null = null;

  // ── LECTURA ──────────────────────────────────────────────────────

  inventoryId: string = '';
  currentPage: number = 1;
  totalPages: number = 1;
  chapters: any[] = [];
  chapterTitle: string = 'Cargando libro...';
  bookTitle: string = 'Cargando...';
  authorName: string = '';
  bookSlug: string = '';
  progressId: number | null = null;

  // ── PAGINACIÓN DEL E-READER ─────────────────────────────────────
  // Una columna CSS es una página. El lienzo se traslada dentro de un visor inmóvil.
  currentSpreadIndex: number = 0;
  totalSpreads: number = 1;
  currentLeftPageNum: number = 1;
  currentRightPageNum: number = 2;
  /** Páginas visibles a la vez: 2 en escritorio, 1 en pantallas angostas. */
  columnsPerSpread: 1 | 2 = 1;
  chapterPageCount = 1;
  readonly chromeVisible = signal(false);
  isMoreOpen = false;
  private pageOffsetX = 0;
  private dragOffsetX = 0;
  private isDraggingPage = false;
  private suppressCanvasClick = false;
  /** Pliego a mostrar cuando termine de renderizarse el capítulo (Infinity = el último). */
  private pendingSpreadIndex: number | null = null;
  /** Igual, pero como fracción del capítulo (al reanudar el progreso guardado). */
  private pendingSpreadFraction: number | null = null;

  // ── VISTA LIBRO (tapa, lomo, cantos y la hoja que se dobla) ──────
  /** Libro cerrado: la tapa antes de la primera página y la contratapa después de la última. */
  bookClosed: 'front' | 'back' | null = null;
  bookSynopsis = '';
  bookPublisher = '';
  bookYear = '';
  /** Nombre del lector para el ex libris de la portadilla. */
  exLibrisName = '';
  private readonly auth = inject(AuthService);
  private bookFrameState: BookFrame | null = null;
  @ViewChild('flipLayer') private flipLayerRef?: ElementRef<HTMLElement>;
  /** La hoja que se dobla: copias de páginas solo mientras dura el giro (ver reader-book-flip.ts). */
  private readonly bookFlip = new ReaderBookFlip({
    shell: () => this.shellEl(),
    layer: () => this.flipLayerRef?.nativeElement ?? null,
    canvas: () => this.canvasEl(),
    viewport: () => this.viewportEl(),
    container: () => this.containerEl(),
    gap: () => {
      const canvas = this.canvasEl();
      return canvas ? this.columnGap(canvas) : 0;
    },
  }, this.ngZone);
  @ViewChild('coverLayer') private coverLayerRef?: ElementRef<HTMLElement>;
  /** La tapa dura que gira al abrir o cerrar el libro (ver reader-book-cover.ts). */
  private readonly coverSwing = new ReaderBookCover({
    layer: () => this.coverLayerRef?.nativeElement ?? null,
    shell: () => this.shellEl(),
    closedBook: () => document.querySelector<HTMLElement>('app-reader-book-closed .rbc-book'),
  }, this.ngZone);
  /** La tapa se está cerrando: el libro abierto sigue a la vista y el cerrado espera oculto. */
  bookCoverClosing = false;
  /**
   * La tapa se está abriendo: el libro cerrado sigue puesto (oculto) hasta que se apoya, porque
   * Angular quita los estilos de un componente al destruirlo y la copia de la tapa los necesita.
   */
  bookCoverOpening: 'front' | 'back' | null = null;
  /** Arrastre de la hoja (mouse por los márgenes o cantos; dedo en cualquier parte). */
  private flipDrag: { id: number; x: number; y: number; direction: 1 | -1; corner: FoldCorner; started: boolean; width: number } | null = null;

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
  currentSpreadBookmark: PageBookmark | null = null;
  isBookmarkBusy: boolean = false;
  /** Marcadores, subrayados y post-its del libro (datos y servidor). */
  readonly annotations = inject(ReaderAnnotationsService);
  /** Menú de la selección, tarjeta del subrayado y diccionario. */
  @ViewChild('selectionMenu') private menu?: ReaderSelectionMenuComponent;
  /** Papelitos en los márgenes y su nota. */
  @ViewChild('postIts') private postIts?: ReaderPostItsComponent;
  get bookmarks(): PageBookmark[] { return this.annotations.bookmarks; }
  get activeHighlight(): ReaderHighlight | null { return this.menu?.activeHighlight ?? null; }
  get activePostIt() { return this.postIts?.activePostIt ?? null; }
  get isEditingPostIt(): boolean { return this.postIts?.isEditingPostIt ?? false; }
  bookmarkToastText: string = '';
  private bookmarkToastTimer: any = null;


  toastIcon: string = '🔖';
  bookmarkResumeLabel: string = 'Reanudando marcador en';
  private nextJumpLabel: string = '';
  /** Última palabra a resaltar en el próximo salto (una frase de la búsqueda); -1 = solo una. */
  private nextJumpLastWord: number = -1;
  /** Primera palabra de la página a la vista: al cambiar la letra se vuelve a ella. */
  private spreadAnchorWord: number = -1;
  private flipTimer: any = null;
  private relayoutTimer: any = null;
  private visibleRefreshRaf: number | null = null;

  // ── VOCABULARIO, FAVORITO Y PESTAÑA ──────────────────────────────
  isVocabularyOpen: boolean = false;
  isSearchOpen: boolean = false;
  bookCover: string | null = null;
  showReportModal: boolean = false;
  reportContext: ReportContextData | null = null;

  /** Pestaña que baja línea a línea por el margen mientras habla la narración. */
  @ViewChild('narrationMarker') narrationMarkerRef?: ElementRef<HTMLElement>;
  /** Palabra que está leyendo la narración (-1 si no hay narración en curso). */
  private narrationWordIdx: number = -1;

  // ── UX ───────────────────────────────────────────────────────────
  isTocOpen: boolean = false;
  lastScrollTop: number = 0;
  isToolbarHidden: boolean = false;

  // ── HOJA "Aa" — Ajustes de lectura (los guarda y aplica ReaderSettingsService) ──
  readonly settings = inject(ReaderSettingsService);
  isSettingsOpen: boolean = false;
  settingsTab: SettingsTab = 'texto';
  /** Botón que abrió la hoja: recupera el foco al cerrarla. */
  private settingsReturnFocus: HTMLElement | null = null;
  // Atajos a los ajustes, con los nombres que usan el resto del lector y su template.
  get layoutMode(): ReaderSettings['layoutMode'] { return this.settings.value.layoutMode; }
  /** Libro y Páginas paginan igual (columnas CSS); Libro además dibuja el libro abierto alrededor. */
  get isPagedView(): boolean { return this.layoutMode !== 'scroll'; }
  get isBookView(): boolean { return this.layoutMode === 'book'; }
  /** Libro delgado del celular: sin flechas fuera del libro (se pasa tocando los costados). */
  get bookCompact(): boolean {
    return this.bookFrameState?.compact ?? (window.innerWidth <= 640 || window.innerHeight <= 500);
  }
  /** La portadilla va en la primera página del capítulo 1, solo en la vista Libro. */
  get isTitlePageInCanvas(): boolean { return this.isBookView && this.currentPage === 1 && this.chapters.length > 0; }
  get isTitlePageVisible(): boolean { return this.isTitlePageInCanvas && this.currentSpreadIndex === 0; }
  /** Lo que muestra la portadilla: si cambia, el texto congelado se vuelve a pintar. */
  get titlePageKey(): string {
    return this.isTitlePageInCanvas
      ? [this.bookTitle, this.authorName, this.bookPublisher, this.bookYear, this.exLibrisName].join('|') : '';
  }
  get isAtBookStart(): boolean { return this.bookClosed === 'front' || (!this.isBookView && this.currentPage <= 1 && this.isFirstSpread); }
  get isAtBookEnd(): boolean { return this.bookClosed === 'back' || (!this.isBookView && this.currentPage >= this.totalPages && this.isLastSpread); }
  get fontSize(): number { return this.settings.value.fontSize; }
  get lineHeight(): number { return this.settings.value.lineHeight; }
  get currentFontFamily(): ReaderSettings['fontFamily'] { return this.settings.value.fontFamily; }
  get currentTheme(): ReaderSettings['theme'] { return this.settings.value.theme; }
  get letterSpacing(): number { return this.settings.value.letterSpacing; }
  get wordSpacing(): number { return this.settings.value.wordSpacing; }
  get textAlign(): ReaderSettings['textAlign'] { return this.settings.value.textAlign; }
  get paraSpacing(): ReaderSettings['paraSpacing'] { return this.settings.value.paraSpacing; }
  get highContrast(): boolean { return this.settings.value.highContrast; }
  get concentrationMode(): boolean { return this.settings.value.concentration; }
  get focusMode(): ReaderSettings['focusMode'] { return this.settings.value.focusMode; }
  get rulerActive(): boolean { return this.settings.value.ruler; }
  get tapToScrollActive(): boolean { return this.settings.value.tapToScroll; }
  get longParaSplit(): boolean { return this.settings.value.longParaSplit; }
  get bionicReadingActive(): boolean { return this.settings.value.bionic; }
  get showSceneImages(): boolean { return this.settings.value.sceneImages; }
  get hideProgressOnScroll(): boolean { return this.settings.value.hideProgress; }
  get showReadingTime(): boolean { return this.settings.value.showReadingTime; }

  // ── LECTURA ASISTIDA (TDAH / neurodivergencias) ──────────────────
  linesPerPage = 17;
  private rulerCanvasEl: HTMLElement | null = null;
  private readonly ruler = this.createRuler();
  private createRuler(): ReaderRulerController {
    const thisReader = this;
    return new ReaderRulerController({
      get canvas() { return thisReader.canvasEl(); },
      get viewport() { return thisReader.viewportEl(); },
      get active() { return thisReader.rulerActive; },
      get paged() { return thisReader.isPagedView; },
      get columns() { return thisReader.columnsPerSpread; },
      get fontSize() { return thisReader.fontSize; },
      get lineHeight() { return thisReader.lineHeight; },
      get linesPerPage() { return thisReader.linesPerPage; },
      get currentWordIndex() { return thisReader.currentWordIndex; },
      get currentSpreadIndex() { return thisReader.currentSpreadIndex; },
      get totalSpreads() { return thisReader.totalSpreads; },
      get totalChapterPages() { return thisReader.chapterPageCount; },
      next: () => this.turnSpreadNext(),
      previous: () => this.turnSpreadPrev(),
    });
  }
  get rulerY(): number { return this.ruler.y; }
  get rulerColumn() { return this.ruler.column; }
  readonly highlightColorOptions = HIGHLIGHT_COLOR_OPTIONS;

  // Avance automático (auto-scroll tipo teleprompter)
  autoScrollActive: boolean = false;
  private autoScrollRafId: number | null = null;
  private autoScrollLastTs: number = 0;
  private autoPageTimer: ReturnType<typeof setTimeout> | null = null;

  // Temporizador de sesión + recordatorio de pausa
  readonly sessionTimerOptions: number[] = [0, 15, 25, 45];     // minutos; 0 = desactivado
  sessionTimerMinutes: number = 0;
  sessionTimeRemainingSec: number = 0;
  sessionTimerRunning: boolean = false;
  showBreakModal: boolean = false;
  private sessionTimerInterval: any = null;
  @ViewChild('sessionTimerText') private sessionTimerTextRef?: ElementRef<HTMLElement>;

  // Botón flotante "volver a mi lectura" — aparece si el usuario se aleja
  // de su posición de lectura (scroll manual, exploración) más allá de lo visible.
  showBackToReadingBtn: boolean = false;

  inkBalance: number = 0;

  // ── NARRACIÓN (voces y reproducción en ReaderNarrationService) ────
  readonly narration = inject(ReaderNarrationService);
  isAudioPanelOpen: boolean = false;
  /** Marca la palabra activa, su frase y su párrafo directo en el DOM (sin detección de cambios). */
  private readonly highlighter = new ReaderHighlighter(() => this.canvasEl());
  /** Palabra marcada: la que lee la narración o la que se tocó (foco de lectura). */
  get currentWordIndex(): number { return this.highlighter.current; }
  set currentWordIndex(index: number) { this.highlighter.set(index); }
  get isAudioLoading(): boolean { return this.narration.isLoading; }
  get narrationNotice(): string { return this.narration.notice; }

  // Configuración de la Novela
  currentChapterPlainText: string = '';
  isFullyRendered: boolean = false; // Bloquea guardado de progreso hasta que todo el DOM exista

  // Renderizado de palabras (para highlighting nativo de Angular)
  parsedBlocks: ReaderBlock[] = [];
  renderedBlocks: ReaderBlock[] = [];
  /** Sube cuando cambian los tokens por dentro (subrayados): el texto congelado se vuelve a pintar. */
  textVersion = 0;
  titleTokens: any[] = [];
  private totalWordCount: number = 0;

  private saveProgressSubject = new Subject<ReaderProgressSnapshot>();
  private destroy$ = new Subject<void>();
  private savedProgressData: ProgressData | null = null;

  chapterScrollPercent: number = 0;
  isNearEnd: boolean = false;
  showBookmarkToast: boolean = false;

  // ── TIEMPO DE LECTURA RESTANTE (ADAPTATIVO) ──────────────────────
  readonly pace = new ReadingPace(this.settings);
  get remainingReadingTimeText(): string { return this.pace.text; }
  get remainingReadingTimeShort(): string { return this.pace.short; }
  get readingPaceTooltip(): string { return this.pace.tooltip; }

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

  // Modal: Resumen hasta donde voy (sin spoilers)
  isSummaryModalOpen: boolean = false;
  isSummaryLoading: boolean = false;
  summaryError: string = '';
  progressSummary: ReadingSummaryContent | null = null;
  summaryUpToChapter = 1;
  private progressSummaryRequest: Subscription | null = null;

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
  private handleBeforeUnload = () => this.saveAudioPosition();
  private handleFullscreenChange = () => {
    this.isFullscreenActive = !!document.fullscreenElement;
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
    // "Ir al pasaje" del cuaderno salta aquí mismo, sin recargar el libro.
    this.unregisterNotebook = this.notebook.registerReader(this.inventoryId,
      (chapterId, word, lastWord) => this.ngZone.run(() => this.goToPassage(chapterId, word, lastWord ?? -1)));

    // Mientras carga, los textos de Maguito van cambiando. Fuera de la zona: con el libro ya abierto
    // el intervalo no vuelve a revisar toda la página cada 3,8 s (onMascotClick repinta solo el lector).
    this.loadingTipInterval = this.ngZone.runOutsideAngular(() => setInterval(() => {
      if (this.isOverlayActive) this.onMascotClick();
    }, 3800));

    // Pedir Wake Lock para mantener la pantalla encendida
    this.requestWakeLock();
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    // Salir de pantalla completa con Esc (o con el gesto del sistema) también apaga el interruptor.
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);

    // Ya no entra en pantalla completa sola al abrir un libro (molestaba): queda el interruptor
    // "Pantalla completa" de Ajustes → Menos distracciones.

    // El scroll avisa fuera de la zona de Angular; el guardado (y lo que muestre al volver) va dentro.
    // Capture chapter/word before debouncing; serialize saves so an older request cannot
    // overwrite a newer position. An immediate save flushes the debounce.
    this.saveProgressSubject.pipe(
      debounce(snapshot => snapshot.immediate ? of(0) : timer(3000)),
      concatMap(snapshot => {
        if (!this.progressId || !this.totalPages) return EMPTY;
        return this.api.patch(`library/progress/${this.progressId}/`, readerProgressPayload(snapshot, this.totalPages)).pipe(
          catchError(() => EMPTY),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe();

    this.loadInitialData();
    this.loadInkBalance();

    // Ajustes de la hoja "Aa": variables CSS y tema ya, y cada cambio re-maqueta o mueve la regla.
    this.settings.applyToDocument();
    this.settings.changes$.pipe(takeUntil(this.destroy$)).subscribe(keys => this.onSettingsChanged(keys));

    this.narration.loadPrefs();

    // Enlaces viejos con ?chatWith: el chat se abre en la ventana rápida, sin esperar al libro.
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['chatWith']) this.characterChat.open(params['chatWith']);
      // Desde el cuaderno con el libro cerrado: /reader/<id>?ir=<capítulo>:<palabra>[-<última>]
      const [chapterId, range] = String(params['ir'] || '').split(':');
      const [first, last] = (range || '').split('-');
      if (chapterId && /^\d+$/.test(first || '')) {
        this.goToPassage(chapterId, Number(first), /^\d+$/.test(last || '') ? Number(last) : -1);
      }
    });

    // Marcadores, subrayados y post-its: cada uno se muestra cuando llega.
    this.annotations.loaded$.pipe(takeUntil(this.destroy$)).subscribe(kind => {
      if (kind === 'bookmarks') {
        this.refreshVisiblePage();
        this.refreshBookmarkLabels();
      } else if (kind === 'highlights') {
        this.onHighlightsChanged();
      } else {
        this.cdr.detectChanges();
        this.scheduleMarginLayout();
      }
    });

    // La palabra que va leyendo la voz (cualquiera de ellas): resaltado, foco, regla y página.
    this.narration.word$.pipe(takeUntil(this.destroy$)).subscribe(idx => this.onNarrationWord(idx));

    // Suscribirse a la tinta global
    this.chatService.inkBalance$.pipe(takeUntil(this.destroy$)).subscribe(balance => {
      this.inkBalance = balance;
      this.cdr.detectChanges();
    });


    // Auto-avance de capítulo cuando termina la narración
    this.narration.chapterEnd$.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
          this.queueProgress(this.currentPage - 1);
          // Iniciar narración del siguiente capítulo automáticamente
          setTimeout(() => this.playAudio(), 600);
        }, 500);
      }
    });

    // Guardar posición al cerrar/salir (se quita en ngOnDestroy: antes quedaba uno por cada libro abierto)
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  ngAfterViewInit() {
    this.syncThemeColor();
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
      // Por lo mismo, el scroll (también el de cada giro de página en vista libro) y la
      // selección de texto van fuera de la zona: solo vuelven a ella si cambia algo visible.
      canvas.addEventListener('scroll', this.handleCanvasScroll, { passive: true });
      const viewport = this.viewportEl();
      viewport?.addEventListener('pointerdown', this.handleCanvasPointerDown);
      viewport?.addEventListener('pointermove', this.handleCanvasPointerMove, { passive: false });
      viewport?.addEventListener('pointerup', this.handleCanvasPointerUp);
      viewport?.addEventListener('pointercancel', this.handleCanvasPointerCancel);
      // Vista Libro: arrastrar la hoja y levantar la esquina al acercar el mouse (todo el papel y los cantos).
      const shell = this.shellEl();
      shell?.addEventListener('pointerdown', this.handleShellPointerDown);
      shell?.addEventListener('pointermove', this.handleShellPointerMove, { passive: false });
      shell?.addEventListener('pointerup', this.handleShellPointerUp);
      shell?.addEventListener('pointercancel', this.handleShellPointerUp);
      shell?.addEventListener('pointerleave', this.handleShellPointerLeave);
      // Post-its en los márgenes: se arrastran desde su capa y se recolocan si el lienzo cambia de
      // tamaño (letra, ancho, barra que se oculta); el scroll y los giros de página van por onCanvasScroll.
      this.canvasResizeObserver = new ResizeObserver(() => this.scheduleMarginLayout());
      this.canvasResizeObserver.observe(canvas);
    });
  }

  private canvasResizeObserver: ResizeObserver | null = null;

  private handleCanvasScroll = (event: Event) => this.onCanvasScroll(event);

  /** Un arrastre de selección y un gesto de página no deben generar también un toque. */
  private canvasPointerDown: { x: number; y: number; t: number; touch: boolean; hadSelection: boolean; hadPopover: boolean } | null = null;
  private handleCanvasPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('button, a, input, img')) return;
    this.canvasPointerDown = {
      x: event.clientX, y: event.clientY, t: event.timeStamp,
      touch: event.pointerType !== 'mouse',
      hadSelection: !!this.menu?.showWordMenu || !!window.getSelection()?.toString().trim(),
      hadPopover: !!this.activeHighlight || !!this.activePostIt,
    };
    this.isDraggingPage = false;
  };

  private handleCanvasPointerMove = (event: PointerEvent) => {
    const down = this.canvasPointerDown;
    if (!down?.touch || !this.isPagedView || down.hadSelection || down.hadPopover) return;
    if (this.canFlip()) return; // en la vista Libro con la hoja, el dedo arrastra la hoja (handleShellPointerMove)
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (!this.isDraggingPage && (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5)) return;
    if (down.x < 24 || down.x > window.innerWidth - 24 || window.getSelection()?.toString().trim()) return;
    this.isDraggingPage = true;
    event.preventDefault();
    this.viewportEl()?.setPointerCapture?.(event.pointerId);
    const atEdge = (dx > 0 && this.isFirstSpread) || (dx < 0 && this.isLastSpread);
    this.dragOffsetX = dx * (atEdge ? 0.25 : 1);
    this.applyPageTransform(false);
  };

  private handleCanvasPointerUp = (event: PointerEvent) => {
    const down = this.canvasPointerDown;
    if (!down || !this.isDraggingPage) return;
    this.suppressCanvasClick = true;
    this.canvasPointerDown = null;
    this.isDraggingPage = false;
    const viewport = this.viewportEl();
    const width = viewport?.closest<HTMLElement>('.rd-shell')?.clientWidth || viewport?.clientWidth || window.innerWidth;
    const delta = swipePageDelta(event.clientX - down.x, event.timeStamp - down.t, width);
    this.dragOffsetX = 0;
    this.ngZone.run(() => {
      if (delta > 0) this.turnSpreadNext();
      else if (delta < 0) this.turnSpreadPrev();
      this.applyPageTransform(true);
    });
    setTimeout(() => this.suppressCanvasClick = false, 0);
  };

  private handleCanvasPointerCancel = () => {
    this.canvasPointerDown = null;
    this.isDraggingPage = false;
    this.dragOffsetX = 0;
    this.applyPageTransform(true);
  };

  // ── VISTA LIBRO: ARRASTRAR LA HOJA Y LEVANTAR LA ESQUINA (fuera de la zona de Angular) ──

  private handleShellPointerDown = (event: PointerEvent) => {
    if (!this.canFlip() || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, img, .margin-postit')) return;
    // Con el mouse, arrastrar sobre el texto lo selecciona: la hoja se agarra por los márgenes o los cantos.
    if (event.pointerType === 'mouse' && target.closest('.reader-viewport')) return;
    if (this.menu?.showWordMenu || window.getSelection()?.toString().trim() || this.activeHighlight || this.activePostIt) return;
    const rect = this.shellEl()?.getBoundingClientRect();
    if (!rect) return;
    this.flipDrag = {
      id: event.pointerId, x: event.clientX, y: event.clientY, started: false, width: rect.width,
      direction: event.clientX >= rect.left + rect.width / 2 ? 1 : -1,
      // La hoja se pliega desde la esquina más cercana a donde se tomó.
      corner: event.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom',
    };
  };

  private handleShellPointerMove = (event: PointerEvent) => {
    const drag = this.flipDrag;
    if (!drag) {
      this.updatePeel(event);
      return;
    }
    if (event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.started) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const from = this.currentSpreadIndex;
      const to = from + drag.direction;
      // Hacia afuera no se dobla; entre capítulos se pasa tocando (el capítulo vecino aún no está pintado).
      if ((drag.direction === 1 ? dx > 0 : dx < 0) || to < 0 || to >= this.totalSpreads) {
        this.flipDrag = null;
        return;
      }
      const started = this.ngZone.run(() => this.bookFlip.beginDrag(drag.direction, from,
        () => { this.moveToSpread(to, false); this.cdr.detectChanges(); },
        () => { this.moveToSpread(from, false); this.cdr.detectChanges(); }, drag.corner));
      if (!started) {
        this.flipDrag = null;
        return;
      }
      drag.started = true;
      this.suppressCanvasClick = true;
      try { this.shellEl()?.setPointerCapture(event.pointerId); } catch { /* el puntero ya se soltó */ }
    }
    event.preventDefault();
    this.bookFlip.dragTo(dx, drag.width, event.timeStamp);
  };

  private handleShellPointerUp = () => {
    const drag = this.flipDrag;
    this.flipDrag = null;
    if (!drag?.started) return;
    this.bookFlip.endDrag();
    setTimeout(() => this.suppressCanvasClick = false, 0);
  };

  private handleShellPointerLeave = () => {
    if (!this.flipDrag) this.bookFlip.unpeel();
  };

  /** Mouse cerca de la esquina de abajo de una página: la esquina se levanta, como invitando a tirar. */
  private updatePeel(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    if (!this.canFlip()) {
      this.bookFlip.unpeel();
      return;
    }
    const rect = this.shellEl()?.getBoundingClientRect();
    if (!rect) return;
    const zone = Math.min(72, rect.width * 0.08);
    const low = event.clientY > rect.bottom - rect.height * 0.3;
    const want = low && event.clientX > rect.right - zone && this.currentSpreadIndex < this.totalSpreads - 1 ? 1
      : low && event.clientX < rect.left + zone && this.currentSpreadIndex > 0 ? -1 : 0;
    if (want === 0) this.bookFlip.unpeel();
    else if (!this.bookFlip.busy) this.bookFlip.peel(want, this.currentSpreadIndex);
  }

  /** La hoja se dobla con dos páginas a la vista, en la vista Libro y si no se pidió menos movimiento. */
  private canFlip(): boolean {
    return this.isBookView && this.columnsPerSpread === 2 && this.settings.value.pageTurn === 'flip'
      && !this.bookClosed && this.isFullyRendered && !this.coverSwing.busy
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
          this.loadBookFrontMatter(inventory);

          if (inventory.progress.current_cfi) {
            try {
              this.savedProgressData = JSON.parse(inventory.progress.current_cfi);
            } catch (e) {
              // Legacy cfi
            }
          }
        }

        // "Guardar marcador" del menú de selección dejaba aquí una posición oculta que pisaba la del
        // servidor; ya no existe (los marcadores son los de la página). Se limpia lo que quedó.
        localStorage.removeItem(`bookmark_resume_${this.inventoryId}`);

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

  /**
   * Vista Libro: datos de la portadilla y la contratapa, el color de la tapa (sale de la portada) y,
   * si el libro todavía no se abre nunca, se parte con el libro cerrado en la tapa.
   */
  private loadBookFrontMatter(inventory: any) {
    const edition = inventory.edition || {};
    this.bookSynopsis = edition.book?.synopsis || '';
    this.bookPublisher = edition.publisher || '';
    this.bookYear = String(edition.published_date || '').slice(0, 4);
    const user: any = this.auth.currentUser();
    this.exLibrisName = user?.profile?.display_name || user?.profile?.full_name || user?.username || '';

    loadCoverBoardColor(this.bookCover).then(color => {
      if (this.destroyed) return;
      const style = this.containerEl()?.style;
      if (color) style?.setProperty('--book-cover-src', color);
      else style?.removeProperty('--book-cover-src');
    });

    const progress = inventory.progress || {};
    const neverOpened = !progress.current_cfi && (Number(progress.current_page) || 1) <= 1
      && !(Number(progress.completion_percentage) > 0);
    const deepLink = !!this.pendingPassage || !!this.route.snapshot.queryParams['chapter'];
    if (this.isBookView && neverOpened && !deepLink) {
      this.bookClosed = 'front';
      this.chromeVisible.set(true); // con el libro cerrado se ve cómo volver a la biblioteca
    }
  }

  // ── Barra del sistema (celular): toma el color del papel mientras el lector está abierto ──
  private themeColorMeta: HTMLMetaElement | null = null;
  private themeColorBefore: string | null = null;

  private syncThemeColor(): void {
    const container = document.querySelector('.workbench-container');
    const paper = container ? getComputedStyle(container).getPropertyValue('--rd-paper').trim() : '';
    if (!paper) return;
    if (!this.themeColorMeta) {
      const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      this.themeColorBefore = existing?.content ?? null;
      this.themeColorMeta = existing ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    }
    this.themeColorMeta.content = paper;
  }

  /** Al salir del lector la barra vuelve al color de la app. */
  private restoreThemeColor(): void {
    if (!this.themeColorMeta) return;
    if (this.themeColorBefore === null) this.themeColorMeta.remove();
    else this.themeColorMeta.content = this.themeColorBefore;
    this.themeColorMeta = null;
  }

  /** Ya se cerró el lector: lo que estaba programado fuera de la zona no hace nada. */
  private destroyed = false;

  ngOnDestroy() {
    this.destroyed = true;
    this.restoreThemeColor();
    this.unregisterNotebook?.();
    if (this.rulerCanvasEl) {
      this.rulerCanvasEl.removeEventListener('mousemove', this.handleRulerMouseMove);
      this.rulerCanvasEl.removeEventListener('mouseleave', this.handleRulerMouseLeave);
      this.rulerCanvasEl.removeEventListener('scroll', this.handleCanvasScroll);
      this.viewportEl()?.removeEventListener('pointerdown', this.handleCanvasPointerDown);
      this.viewportEl()?.removeEventListener('pointermove', this.handleCanvasPointerMove);
      this.viewportEl()?.removeEventListener('pointerup', this.handleCanvasPointerUp);
      this.viewportEl()?.removeEventListener('pointercancel', this.handleCanvasPointerCancel);
      this.rulerCanvasEl = null;
    }
    const shell = this.shellEl();
    shell?.removeEventListener('pointerdown', this.handleShellPointerDown);
    shell?.removeEventListener('pointermove', this.handleShellPointerMove);
    shell?.removeEventListener('pointerup', this.handleShellPointerUp);
    shell?.removeEventListener('pointercancel', this.handleShellPointerUp);
    shell?.removeEventListener('pointerleave', this.handleShellPointerLeave);
    this.bookFlip.destroy();
    this.coverSwing.destroy();
    this.canvasResizeObserver?.disconnect();
    this.ruler.destroy();
    this.clearBookmarkHighlight();
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    this.narration.stop();
    this.saveAudioPosition();
    this.stopAutoScroll();
    this.clearSessionInterval();
    clearInterval(this.loadingTipInterval);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    clearTimeout(this.resizeTimer);
    clearTimeout(this.flipTimer);
    clearTimeout(this.relayoutTimer);
    clearTimeout(this.bookmarkToastTimer);
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

  /**
   * Scroll del lienzo. Corre FUERA de la zona de Angular (ver ngAfterViewInit): cada pasada de
   * detección de cambios recorre las miles de palabras del capítulo, y el scroll dispara decenas
   * de eventos por segundo (también al girar de pliego en vista libro). Solo se vuelve a la zona
   * cuando cambia algo que el template muestra; la barra de progreso se mueve directo en el DOM.
   */
  onCanvasScroll(event: Event) {
    this.scheduleMarginLayout(); // los papelitos acompañan su línea (y se ocultan si sale de la vista)
    const before = this.scrollViewKey();
    this.applyCanvasScroll(event.target as HTMLElement);
    if (this.scrollViewKey() !== before) this.ngZone.run(() => this.cdr.markForCheck());
  }

  private scrollViewKey(): string {
    return `${this.isToolbarHidden}|${this.isNearEnd}|${this.showBackToReadingBtn}|${!!this.activeHighlight}|${!!this.activePostIt}|${this.pace.minutes}|${this.pace.text}`;
  }

  private applyCanvasScroll(el: HTMLElement) {
    // Las tarjetas (subrayado, post-it) flotan fijas sobre la página: si el texto se mueve, quedan
    // descolgadas. Un post-it a medio escribir se deja abierto.
    if (this.activeHighlight) this.closeHighlightPopover();
    if (this.activePostIt && !this.isEditingPostIt) this.closePostIt();
    if (!this.isFullyRendered) return; // IGNORAR SCROLL HASTA QUE SE TERMINE DE RENDERIZAR TODO PARA NO SOBRESCRIBIR EL PROGRESO

    this.invalidateRulerLines(); // barato (sólo vacía el arreglo); el recálculo real es perezoso
    // En vista libro el lienzo solo se desplaza al cambiar de pliego, y ese progreso ya lo
    // guarda updateSpreadProgress(): medirlo aquí como scroll vertical lo pisaría con un 0.
    if (this.isPagedView) return;
    this.updateNarrationMarker();
    this.scheduleVisibleRefresh();
    const currentScrollTop = el.scrollTop;

    if (currentScrollTop !== this.lastScrollTop) this.chromeVisible.set(false);
    this.lastScrollTop = currentScrollTop;

    // Calcular porcentaje de scroll del contenedor actual
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const scrollPercent = scrollHeight > 0 ? currentScrollTop / scrollHeight : 0;

    // Actualizar barra de progreso visual y botón "Siguiente"
    this.chapterScrollPercent = Math.min(100, Math.max(0, scrollPercent * 100));
    const bar = document.querySelector('.reading-progress-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${this.chapterScrollPercent}%`;
    this.isNearEnd = scrollPercent >= 0.98 || (scrollHeight - currentScrollTop) < 50 || scrollHeight <= 50;

    this.bookPageCurrent = Math.min(this.bookPageTotal, (this.chapterStartPages[this.currentPage - 1] || 1)
      + Math.round(scrollPercent * Math.max(0, (this.chapterPageEstimates[this.currentPage - 1] || 1) - 1)));
    this.trackPace(scrollPercent);

    // Calcular página decimal exacta (ej. 1.5 significa mitad de capítulo 1)
    const exactPage = (this.currentPage - 1) + scrollPercent;

    this.queueProgress(exactPage);

    this.checkBackToReadingVisibility();
  }

  checkIfNearEnd() {
    if (this.isPagedView) { this.isNearEnd = this.isLastSpread; return; }
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
    const down = this.canvasPointerDown;
    this.canvasPointerDown = null;

    if (this.activeHighlight && !target.closest('.word')) this.closeHighlightPopover();
    if (this.activePostIt && !this.isEditingPostIt) this.closePostIt();

    // Soltar el mouse tras arrastrar para seleccionar texto (o tocar para cerrar el menú de la
    // selección) también genera un clic: no es tocar una palabra ni pasar de página.
    const dragged = !!down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6;
    if (dragged || down?.hadSelection || window.getSelection()?.toString().trim()) return;

    if (this.suppressCanvasClick || target.closest('img, button, a, input') || down?.hadPopover) return;
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect() ?? this.viewportEl()?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const word = target.closest('.word') as HTMLElement | null;
    if (word) {
      const idx = Number(word.id.slice('word-'.length));
      if (this.annotations.highlightAt(this.currentChapterId, idx)) {
        this.onWordClick(idx);
        return;
      }
      if (ratio >= 0.25 && ratio <= 0.75 && (this.focusMode !== 'off' || this.rulerActive)) this.onWordClick(idx);
    }
    if (this.isPagedView) {
      if (ratio < 0.25) this.turnSpreadPrev();
      else if (ratio > 0.75) this.turnSpreadNext();
      else this.toggleChrome();
      return;
    }
    // En desplazamiento el centro conserva el acceso a las barras incluso con avance por toque.
    if (!this.tapToScrollActive || (ratio >= 0.25 && ratio <= 0.75)) {
      this.toggleChrome();
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

  // ── HOJA "Aa" — Ajustes de lectura ───────────────────────────────
  /**
   * Cambió un ajuste (en la hoja, un ajuste rápido o "Restablecer"): lo que depende de la maqueta se
   * rehace. La palabra ancla se toma antes de repintar: el DOM todavía muestra la vista anterior.
   */
  private onSettingsChanged(keys: (keyof ReaderSettings)[]) {
    const changed = (...names: (keyof ReaderSettings)[]) => names.some(name => keys.includes(name));
    this.coverSwing.finishNow();
    this.bookFlip.finishNow(); // una hoja a medio girar tiene copias con la letra o el tema de antes
    const viewAnchor = changed('layoutMode') ? this.spreadAnchorWord : -1;
    if (changed('theme')) {
      this.cdr.detectChanges(); // la clase del contenedor cambia dentro del fundido
      this.syncThemeColor();
    }
    if (changed('layoutMode')) {
      this.relayoutForView(viewAnchor);
    } else if (changed('fontSize', 'fontFamily', 'lineHeight', 'margins', 'textAlign', 'paraSpacing', 'letterSpacing', 'wordSpacing', 'sceneImages', 'bionic', 'longParaSplit')) {
      this.invalidateRulerLines(); // la letra y el espacio mueven cada renglón
      if (this.isPagedView) this.scheduleRelayout();
      else requestAnimationFrame(() => {
        this.scheduleMarginLayout();
        this.scheduleVisibleRefresh();
        this.updateNarrationMarker();
      });
    }
    if (changed('ruler')) this.applyRuler();
    if (changed('fontFamily')) document.fonts?.ready.then(() => this.scheduleRelayout());
    if (changed('wpm', 'wpmAuto')) this.pace.update(this.chapterProgress(), this.getChapterWordCount());
    if (this.autoScrollActive && changed('layoutMode', 'wpm', 'wpmAuto')) this.startAutoScroll();
  }

  toggleSettings(tab?: 'texto' | 'apariencia' | 'enfoque') {
    if (tab) {
      this.settingsTab = tab;
      if (!this.isSettingsOpen) {
        this.isSettingsOpen = true;
      }
    } else {
      this.isSettingsOpen = !this.isSettingsOpen;
    }
    if (this.isSettingsOpen) {
      this.isTocOpen = false;
      this.settingsReturnFocus = document.activeElement as HTMLElement | null;
      setTimeout(() => document.getElementById(`sheet-tab-${this.settingsTab}`)?.focus());
    } else {
      this.settingsReturnFocus?.focus();
      this.settingsReturnFocus = null;
    }
  }

  // ── RITMO Y TIEMPO RESTANTE DE LECTURA (ver ReadingPace) ──────────
  /** Cuánto del capítulo se lleva (0–1): el pliego en vista libro, el scroll en lectura continua. */
  private chapterProgress(): number {
    return this.isPagedView
      ? (this.totalSpreads > 1 ? this.currentSpreadIndex / (this.totalSpreads - 1) : 0)
      : this.chapterScrollPercent / 100;
  }

  private trackPace(progress: number) {
    const words = this.getChapterWordCount();
    this.pace.track(progress, words);
    this.pace.update(progress, words);
  }

  getChapterWordCount(): number {
    if (this.totalWordCount > 0) return this.totalWordCount;
    if (this.currentChapterPlainText) {
      const w = this.currentChapterPlainText.trim().split(/\s+/).filter(Boolean).length;
      if (w > 0) return w;
    }
    const currentChapter = this.chapters[this.currentPage - 1];
    if (currentChapter?.content_html) {
      const text = currentChapter.content_html.replace(/<[^>]*>/g, ' ');
      const w = text.trim().split(/\s+/).filter(Boolean).length;
      if (w > 0) return w;
    }
    return 0;
  }

  private applyRuler() { this.ruler.apply(); }
  private invalidateRulerLines() { this.ruler.invalidate(); }
  private moveRulerByLine(direction: 1 | -1) { this.ruler.moveByLine(direction); }
  private handleRulerMouseMove = (event: MouseEvent) => this.ruler.handleMouseMove(event);
  private handleRulerMouseLeave = () => this.ruler.handleMouseLeave();
  scrollStepDown() { this.ruler.step(1); }
  scrollStepUp() { this.ruler.step(-1); }

  toggleAutoScroll(v: boolean) {
    this.autoScrollActive = v;
    if (v) {
      this.settings.update({ tapToScroll: false }); // evitar interferencia con el toque para avanzar
      this.startAutoScroll();
    } else {
      this.stopAutoScroll();
    }
  }

  private startAutoScroll() {
    this.stopAutoScroll();
    if (this.isPagedView) {
      this.scheduleAutoPage();
      return;
    }
    this.autoScrollLastTs = performance.now();
    let position = this.canvasEl()?.scrollTop || 0;
    const step = (ts: number) => {
      if (!this.autoScrollActive) return;
      const canvas = document.querySelector('.reading-canvas') as HTMLElement | null;
      const dt = (ts - this.autoScrollLastTs) / 1000;
      this.autoScrollLastTs = ts;
      if (canvas) {
        if (Math.abs(canvas.scrollTop - Math.round(position)) > 2) position = canvas.scrollTop;
        position += this.settings.value.autoScrollSpeed * dt;
        canvas.scrollTop = position;
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

  private scheduleAutoPage(): void {
    if (this.autoPageTimer) clearTimeout(this.autoPageTimer);
    if (!this.autoScrollActive || !this.isPagedView || !this.isFullyRendered) return;
    const range = this.visibleWordRange();
    const words = range ? range[1] - range[0] + 1 : Math.ceil(this.getChapterWordCount() / this.totalSpreads);
    const duration = Math.max(1000, words / this.settings.value.wpm * 60000);
    const chapter = this.currentPage;
    const renderToken = this.renderToken;
    this.autoPageTimer = setTimeout(() => {
      if (!this.autoScrollActive || !this.isFullyRendered || this.currentPage !== chapter || this.renderToken !== renderToken) return;
      if (this.isLastSpread && this.currentPage >= this.totalPages) this.toggleAutoScroll(false);
      else this.turnSpreadNext();
    }, duration);
  }

  private stopAutoScroll() {
    if (this.autoPageTimer) clearTimeout(this.autoPageTimer);
    this.autoPageTimer = null;
    if (this.autoScrollRafId !== null) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
  }

  // ── Temporizador de sesión + recordatorio de pausa ───────────────
  /** El recordatorio de pausa es de esta sesión de lectura: no se guarda para la próxima. */
  setSessionTimer(minutes: number) {
    this.sessionTimerMinutes = minutes;
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
    // Cada segundo cambia solo el texto de la insignia: se escribe directo, sin revisar toda la página.
    this.sessionTimerInterval = this.ngZone.runOutsideAngular(() => setInterval(() => {
      if (!this.sessionTimerRunning) return;
      this.sessionTimeRemainingSec--;
      if (this.sessionTimeRemainingSec <= 0) {
        this.ngZone.run(() => {
          this.sessionTimerRunning = false;
          this.showBreakModal = true;
          this.clearSessionInterval();
        });
        return;
      }
      const badge = this.sessionTimerTextRef?.nativeElement;
      if (badge) badge.textContent = this.sessionTimerLabel;
    }, 1000));
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

  // ── TOC ───────────────────────────────────────────────────────────
  toggleToc() {
    this.isTocOpen = !this.isTocOpen;
    if (this.isTocOpen) {
      this.isSettingsOpen = false;
      this.refreshBookmarkLabels();
    }
  }

  goToChapter(index: number) {
    this.isTocOpen = false;
    this.openChapter(index);
  }

  /** Renglones del índice. El número va solo si el título no lo trae ya ("Capítulo 3 - …"). */
  tocEntries: { title: string; number: string }[] = [];

  private buildTocEntries() {
    this.tocEntries = this.chapters.map((chapter, i) => {
      const title = (chapter.title || '').trim() || `Capítulo ${i + 1}`;
      return { title, number: /^(cap[ií]tulo|\d)/i.test(title) ? '' : `${i + 1}.` };
    });
  }

  // ── CAPÍTULOS ─────────────────────────────────────────────────────
  loadChapters() {
    if (this.chapters && this.chapters.length > 0) return;
    this.api.get(`library/inventory/${this.inventoryId}/chapters/`).subscribe({
      next: (res: any) => {
        if (res && res.chapters && res.chapters.length > 0) {
          this.chapters = res.chapters;
          this.buildTocEntries();
          if (res.book_id) this._bookIdForSession = res.book_id;
          if (res.book_title) this.bookTitle = res.book_title;
          this.chapterTextLengths = res.chapters.map((c: any) => this.textLength(c.content_html));
          this.chapterParagraphLengths = res.chapters.map((c: any) => this.paragraphLengths(c.content_html));
          this.totalPages = res.chapters.length;
          this.annotations.load(this.inventoryId, this.chapters);
          const passage = this.pendingPassage;
          const passageIndex = passage ? this.chapters.findIndex(chapter => String(chapter.id) === passage.chapterId) : -1;
          this.pendingPassage = null;
          if (passage && passageIndex >= 0) {
            // Llegó desde el cuaderno: abre en el pasaje y no en la última posición leída.
            this.currentPage = passageIndex + 1;
            this.savedProgressData = { percentage: 0, wordId: `word-${passage.word}`, timestamp: Date.now() };
            this.nextJumpLabel = 'Pasaje en';
            this.nextJumpLastWord = passage.lastWord;
          } else {
            // Deep link desde el panel de reportes de error (?chapter=...&word=...)
            const qp = this.route.snapshot.queryParams;
            if (qp['chapter']) {
              const targetChapIndex = this.chapters.findIndex(c => String(c.id) === String(qp['chapter']));
              if (targetChapIndex >= 0) {
                this.currentPage = targetChapIndex + 1;
                const targetWord = qp['word'] ? parseInt(qp['word'], 10) : 0;
                this.savedProgressData = { percentage: 0, wordId: `word-${targetWord}`, timestamp: Date.now() };
                this.nextJumpLabel = 'Error reportado en';
                this.nextJumpLastWord = targetWord;
              }
            }
          }
          if (this.currentPage > this.totalPages) { this.currentPage = this.totalPages; } else if (this.currentPage < 1) { this.currentPage = 1; }
          this.renderCurrentChapter();
        } else {
          this.chapterTitle = 'Sin contenido';
        }
      },
      error: (err) => {
        console.error('Error al cargar capítulos', err);
        this.chapterTitle = 'Error';
        // Si el inventario no pertenece al usuario o no existe (404), redirigir
        if (err.status === 404 || err.status === 401) {
          setTimeout(() => this.router.navigate(['/catalog']), 2000);
        }
        this.isOverlayActive = false;
      }
    });
  }

  renderCurrentChapter() {
    this.stopAutoScroll();
    this.isFullyRendered = false;
    // Defer to next task so the Lottie animation keeps running
    // (avoids blocking the main thread during heavy chapter tokenization)
    setTimeout(() => this.parseAndRenderChapter(), 0);
  }

  /** Token del render en curso. Si el usuario cambia de capítulo (doble tap en
   *  "Siguiente"/"Anterior") antes de que termine el renderizado progresivo por
   *  chunks del capítulo anterior, ese renderChunks() antiguo debe abortar en vez
   *  de seguir empujando bloques viejos sobre `renderedBlocks` del capítulo nuevo. */
  private renderToken = 0;

  /** Los últimos capítulos analizados; el siguiente se prepara mientras el navegador está ocioso. */
  private readonly chapterCache = new ChapterCache(3);

  /** El capítulo `index` analizado (de la caché si ya estaba). */
  private preparedChapter(index: number): PreparedChapter | null {
    const chapter = this.chapters[index];
    if (!chapter) return null;
    const title = chapter.title || `Capítulo ${index + 1}`;
    return this.chapterCache.get(`${chapter.id}|${title}`, () =>
      prepareChapter(chapter.content_html || '', title, environment.apiUrl.split('/api/v1/')[0]));
  }

  /** Deja listo el capítulo siguiente sin trabar la lectura: abrirlo ya no espera el análisis. */
  private prefetchNextChapter() {
    const next = this.currentPage; // índice del capítulo siguiente
    if (next >= this.chapters.length) return;
    const idle: (cb: () => void) => void = (window as any).requestIdleCallback?.bind(window)
      ?? ((cb: () => void) => setTimeout(cb, 300));
    this.ngZone.runOutsideAngular(() => idle(() => {
      if (!this.destroyed) this.preparedChapter(next);
    }));
  }

  /** Parsea el HTML del capítulo y crea la estructura de bloques/tokens para el *ngFor */
  parseAndRenderChapter() {
    this.stopAutoScroll();
    this.pageOffsetX = 0;
    this.dragOffsetX = 0;
    if (this.isPagedView) this.columnsPerSpread = columnsForViewport(window.innerWidth, window.innerHeight);
    this.applyPageTransform(false);
    const chapter = this.chapters[this.currentPage - 1];
    if (!chapter) return;

    this.invalidateRulerLines(); // el capítulo nuevo invalida cualquier línea calculada del anterior
    // Se marca la palabra donde quedó la narración; sin posición guardada (0) no se resalta nada.
    const savedAudioWord = this.getSavedAudioWordIndex();
    this.currentWordIndex = savedAudioWord > 0 ? savedAudioWord : -1;

    this.chapterTitle = chapter.title || `Capítulo ${this.currentPage}`;

    // Texto plano para la voz, bloques con sus oraciones y el título aparte (ver reader-chapter.ts).
    // Si el capítulo ya estaba preparado (el siguiente se prepara en un rato ocioso), no se analiza otra vez.
    const prepared = this.preparedChapter(this.currentPage - 1)!;
    this.currentChapterPlainText = prepared.plainText;
    this.parsedBlocks = prepared.blocks;
    this.titleTokens = prepared.titleTokens;

    this.closeHighlightPopover();
    this.closePostIt();
    this.applyHighlightsToTokens();

    this.totalWordCount = prepared.wordCount;
    this.pace.start(this.chapterProgress(), this.getChapterWordCount());

    // Invalidar cualquier renderizado por chunks todavía en curso de un capítulo anterior
    const myRenderToken = ++this.renderToken;

    // Resetear estado de scroll al cargar nuevo capítulo
    this.chapterScrollPercent = 0;
    this.isNearEnd = false;
    this.lastScrollTop = 0;

    const viewer = document.querySelector('.reading-canvas');
    if (viewer) {
      viewer.scrollTop = 0;
      this.pageOffsetX = 0;
      this.applyPageTransform(false);
      // El alto de página se fija antes de pintar: así un salto a una palabra (marcador,
      // vocabulario) mide su pliego con la misma maqueta que tendrá al terminar.
      if (this.isPagedView) this.fitLinesToPage(viewer as HTMLElement);
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

      // Trozos grandes solo para alcanzar rápido el progreso guardado; un capítulo que abre en su
      // primera página parte con uno chico (sin una tarea larga al pasar de capítulo).
      const chunkSize = (startIndex < targetBlockIndex || needsFullRender) ? 50 : 15;
      const chunk = this.parsedBlocks.slice(startIndex, startIndex + chunkSize);

      if (chunk.length > 0) {
        this.renderedBlocks = [...this.renderedBlocks, ...chunk];
        this.cdr.detectChanges();

        const nextIndex = startIndex + chunkSize;
        const reachedTarget = needsFullRender ? (nextIndex >= this.parsedBlocks.length) : (nextIndex > targetBlockIndex);
        // Giro hacia el capítulo siguiente: la hoja da vuelta apenas su primera página está pintada.
        if (this.bookFlip.frozenDirection === 1 && (nextIndex >= 30 || nextIndex >= this.parsedBlocks.length)) {
          this.resumeChapterFlip();
        }

        // Una vez alcanzado el bloque del progreso, restaurar scroll y ocultar Lottie
        if (reachedTarget && !lottieDismissed) {
          lottieDismissed = true;
          setTimeout(() => {
            if (this.savedProgressData) {
              if (this.savedProgressData.wordId) {
                const idx = parseInt(this.savedProgressData.wordId.split('-')[1]);
                // Un salto (búsqueda, vocabulario, marcador, cuaderno) trae su etiqueta y resalta la
                // palabra; abrir el libro solo vuelve a la página donde se quedó la lectura.
                if (!isNaN(idx)) {
                  if (this.nextJumpLabel) this.scrollWordIntoView(idx, true);
                  else this.showResumePosition(idx);
                }
              } else if (this.savedProgressData.scrollPercent && this.isPagedView) {
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

  /** La hoja congelada al final (o al comienzo) del capítulo anterior da vuelta sobre el capítulo nuevo. */
  private resumeChapterFlip() {
    // Un setTimeout y no requestAnimationFrame: este último no corre si la pestaña no se ve, y el
    // libro quedaría congelado hasta el seguro (la hoja misma ya se completa sola en ese caso).
    setTimeout(() => {
      if (this.destroyed || !this.bookFlip.frozenDirection) return;
      this.updateSpreadPages(); // folios del pliego nuevo antes de copiar su página
      this.cdr.detectChanges();
      this.bookFlip.resumeFrozen(this.currentSpreadIndex);
    }, 0);
  }

  /** El capítulo terminó de renderizarse: medir pliegos (y otra vez cuando carguen las fuentes). */
  private onChapterLaidOut() {
    this.scheduleMarginLayout();
    this.prefetchNextChapter();
    if (this.isPagedView) {
      setTimeout(() => {
        this.recalculateSpreads();
        if (this.pendingResumeNotice) this.showResumeNotice();
      }, 60);
      // Una fuente web que llega tarde cambia el ancho de cada renglón y con él los pliegos.
      (document as any).fonts?.ready?.then(() => this.scheduleRelayout());
    } else {
      const canvas = this.canvasEl();
      if (canvas && this.pendingSpreadFraction !== null) {
        canvas.scrollTop = this.pendingSpreadFraction * (canvas.scrollHeight - canvas.clientHeight);
        this.pendingSpreadFraction = null;
      }
      this.recomputeBookPages();
      this.refreshVisiblePage();
      if (this.autoScrollActive) this.startAutoScroll();
      if (this.pendingResumeNotice) this.showResumeNotice();
    }
  }

  /** Al abrir el libro se avisa dónde sigue la lectura (una vez medida la página). */
  private pendingResumeNotice = false;

  /**
   * Abrir el libro: va a la página donde quedó la lectura, sin resaltar nada (no es un marcador).
   * En lectura continua la palabra queda arriba: así la primera palabra visible, que es lo que se
   * guarda como progreso, no retrocede cada vez que se vuelve a abrir.
   */
  private showResumePosition(idx: number) {
    const el = document.getElementById(`word-${idx}`);
    const canvas = this.canvasEl();
    if (!el || !canvas) return;
    if (this.isPagedView) {
      this.showSpreadOf(el, false);
    } else {
      const offset = el.getBoundingClientRect().top - (this.viewportEl() || canvas).getBoundingClientRect().top;
      canvas.scrollTo({ top: canvas.scrollTop + offset - 8, behavior: 'instant' as any });
    }
    this.pendingResumeNotice = true;
  }

  /** "Sigues en la pág. 34 · cap. 3", solo si no se parte desde el comienzo del libro. */
  private showResumeNotice() {
    this.pendingResumeNotice = false;
    // En lectura continua se mide aquí: el scroll que hizo showResumePosition llegó antes de que
    // terminara de pintarse el capítulo, y onCanvasScroll lo ignora hasta entonces.
    const canvas = this.canvasEl();
    const scrollable = canvas ? canvas.scrollHeight - canvas.clientHeight : 0;
    const percent = canvas && scrollable > 0 ? Math.round((canvas.scrollTop / scrollable) * 100) : 0;
    const atStart = this.currentPage <= 1 && (this.isPagedView ? this.currentSpreadIndex === 0 : percent < 1);
    if (atStart) return;
    this.flashToast('📖', this.isPagedView
      ? `Sigues en la pág. ${this.isBookView ? this.bookPageCurrent : this.currentLeftPageNum} · cap. ${this.currentPage}`
      : `Sigues en el cap. ${this.currentPage} · ${percent} %`, 2000);
  }

  toggleAudioPanel() {
    this.isAudioPanelOpen = !this.isAudioPanelOpen;
    if (this.isAudioPanelOpen) this.isSettingsOpen = false;
  }

  isFullscreenActive: boolean = false;

  // Botón dedicado en el toolbar para activar/desactivar el modo inmersivo (F11)
  toggleImmersiveButton() {
    this.isFullscreenActive = !this.isFullscreenActive;
    this.toggleImmersiveMode(this.isFullscreenActive);
  }

  /** Primera palabra que se ve ahora (en vista libro, la de la página izquierda). */
  getFirstVisibleWordIndex(): number {
    const range = this.visibleWordRange();
    return range ? range[0] : -1;
  }

  // ── NARRACIÓN ─────────────────────────────────────────────────────
  get isNarrationPlaying(): boolean {
    return this.narration.isPlaying;
  }

  /** Narra el capítulo desde la palabra guardada o, si ya no se ve, desde la página a la vista. */
  playAudio() {
    this.isAudioPanelOpen = false;
    this.stopAudio(true); // que nunca hablen dos voces a la vez
    // La palabra guardada no está (capítulo nuevo) o no se ve (otro pliego, otro scroll).
    if (!document.getElementById(`word-${this.lastAudioWordIndex}`) || !this.isWordVisible(this.lastAudioWordIndex)) {
      const visibleIdx = this.getFirstVisibleWordIndex();
      if (visibleIdx !== -1) {
        this.lastAudioWordIndex = visibleIdx;
        this.currentWordIndex = visibleIdx;
      }
    }
    this.narration.play({
      inventoryId: this.inventoryId,
      chapter: this.chapters[this.currentPage - 1],
      chapterNumber: this.currentPage,
      text: this.currentChapterPlainText,
      startWord: Math.max(0, this.lastAudioWordIndex),
      bookSlug: this.bookSlug,
      media: { title: this.chapterTitle || this.bookTitle, artist: this.bookTitle, artwork: this.bookCover },
    });
  }

  /** Sigue donde quedó; si esa palabra ya no se ve (otro pliego o scroll), narra desde la vista. */
  resumeAudio() {
    this.isAudioPanelOpen = false;
    if (document.getElementById(`word-${this.lastAudioWordIndex}`) && !this.isWordVisible(this.lastAudioWordIndex)) {
      this.stopAudio(true);
      setTimeout(() => this.playAudio(), 100); // que la detención alcance a hacer efecto
      return;
    }
    this.narration.resume(this.currentChapterPlainText, this.lastAudioWordIndex);
  }

  /** Pausa sin mover la página. La voz del teléfono se detiene: queda guardada la última palabra. */
  pauseNarration() {
    this.narration.pause();
    if (this.narration.mode === 'native-android') this.saveAudioPosition();
  }

  /** Detiene la narración. Sin `preventScroll` vuelve al comienzo del texto (detención definitiva). */
  stopAudio(preventScroll: boolean = false) {
    this.narration.stop();
    this.currentWordIndex = -1;
    this.narrationWordIdx = -1;
    this.updateNarrationMarker();
    if (!preventScroll) this.canvasEl()?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Botón de la barra del libro: reproduce, pausa o reanuda sin abrir el panel de voces. */
  toggleNarration() {
    if (this.isAudioLoading) return;
    if (this.isNarrationPlaying) this.pauseNarration();
    else if (this.narration.isPaused) this.resumeAudio();
    else this.playAudio();
  }

  /** Botón flotante: al pausar abre el panel (para cambiar voz o velocidad). */
  toggleAudioFromFab() {
    if (this.isNarrationPlaying) {
      this.pauseNarration();
      this.isAudioPanelOpen = true;
    } else if (this.narration.isPaused) {
      this.resumeAudio();
    } else {
      this.playAudio();
    }
  }

  /** Cambiar de capítulo a mano detiene la narración: seguiría leyendo el capítulo anterior. */
  private stopNarrationForChapterChange() {
    if (this.narration.isBusy) this.stopAudio(true);
  }

  onWordClick(wordIdx: number) {
    // Si el Toque Fluido está activo, ignorar el click en palabras para evitar
    // el highlight accidental del audio al hacer scroll táctil
    if (this.tapToScrollActive) return;

    // Tocar un pasaje subrayado abre su tarjeta (color, quitar) en vez de mover la narración.
    const selecting = !!window.getSelection()?.toString().trim();
    const highlight = this.annotations.highlightAt(this.currentChapterId, wordIdx);
    if (highlight && !selecting) {
      this.openHighlightPopover(highlight);
      return;
    }
    this.closeHighlightPopover();
    this.closePostIt();

    // Tocar otra vez la palabra marcada la desmarca (y con ella el foco de frase o párrafo).
    if (wordIdx === this.currentWordIndex && this.canClearWordFocus) {
      this.clearWordFocus();
      return;
    }

    this.narration.seekToWord(wordIdx, this.currentChapterPlainText);
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
        if (this.isPagedView) {
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

        this.ruler.followElement(el);

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
    const words = [el.textContent?.trim() || ''];
    // Una frase encontrada con la búsqueda se resalta completa (con un tope por si es muy larga).
    const first = Number(el.id.replace('word-', ''));
    const last = Math.min(this.nextJumpLastWord, first + 30);
    for (let i = first + 1; i <= last; i++) {
      const next = document.getElementById(`word-${i}`);
      if (!next) break;
      next.classList.add('bookmark-word-highlight');
      words.push(next.textContent?.trim() || '');
    }
    this.bookmarkResumeWordText = words.join(' ');
    this.bookmarkResumeLabel = this.nextJumpLabel || 'Reanudando marcador en';
    this.nextJumpLabel = '';
    this.nextJumpLastWord = -1;
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
  private openChapter(index: number, target: { spread?: number; fraction?: number; wordIdx?: number } = {}, fromFlip = false) {
    if (index < 0 || index >= this.chapters.length) return;
    // Cualquier salto abre el libro; solo el giro de hoja entre capítulos conserva su página congelada.
    if (!fromFlip) this.bookFlip.cancelFrozen();
    this.bookClosed = null;
    this.chromeVisible.set(false);
    this.stopNarrationForChapterChange();
    if (target.wordIdx !== undefined) {
      this.savedProgressData = { percentage: 0, wordId: `word-${target.wordIdx}`, timestamp: Date.now() };
    } else if (target.spread !== undefined && this.isPagedView) {
      this.pendingSpreadIndex = target.spread;
    } else if (target.fraction !== undefined) {
      this.pendingSpreadFraction = target.fraction;
    }
    this.currentPage = index + 1;
    this.currentSpreadIndex = 0;
    this.pageOffsetX = 0;
    this.applyPageTransform(false);
    this.renderCurrentChapter();
    this.queueProgress(index, `word-${target.wordIdx ?? 0}`);
  }

  // ── NAVEGACIÓN ENTRE PÁGINAS ─────────────────────────────────────
  get isFirstSpread(): boolean {
    return this.currentSpreadIndex === 0;
  }

  get isLastSpread(): boolean {
    return this.currentSpreadIndex >= this.totalSpreads - 1;
  }

  toggleChrome(): void {
    this.chromeVisible.update(visible => !visible);
  }

  get bookProgressPercent(): number {
    return Math.round(((this.currentPage - 1 + this.chapterScrollPercent / 100) / Math.max(1, this.totalPages)) * 100);
  }

  /**
   * Cambió la vista (libro abierto ↔ lectura continua). Se conserva la página: `anchor`, la primera
   * palabra que se veía, sigue a la vista en el otro modo.
   */
  private relayoutForView(anchor: number) {
    this.coverSwing.finishNow();
    this.bookFlip.finishNow();
    if (!this.isBookView) this.bookClosed = null;
    this.applyBookGeometry(); // quita o pone las medidas del libro (Desplazamiento no re-maqueta pliegos)
    if (this.activeHighlight) this.closeHighlightPopover();
    if (this.activePostIt && !this.isEditingPostIt) this.closePostIt();
    this.invalidateRulerLines(); // cambia por completo el layout (columnas vs. continuo)
    this.currentSpreadIndex = 0;
    this.pendingSpreadIndex = null;
    this.pendingSpreadFraction = null;
    this.cdr.detectChanges();
    setTimeout(() => {
      const canvas = this.canvasEl();
      if (canvas) {
        this.pageOffsetX = 0;
        canvas.style.transform = '';
        canvas.style.height = '';
        canvas.style.columnCount = '';
        canvas.scrollTop = 0;
      }
      this.recalculateSpreads();
      const el = anchor >= 0 ? document.getElementById(`word-${anchor}`) : null;
      if (el && this.isPagedView) {
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
    if (!this.isPagedView) return;
    const canvas = this.canvasEl();
    if (!canvas) return;
    this.invalidateRulerLines(); // el layout de columnas puede haber cambiado
    this.columnsPerSpread = columnsForViewport(window.innerWidth, window.innerHeight);
    canvas.style.columnCount = String(this.columnsPerSpread);
    this.fitLinesToPage(canvas);
    const viewport = this.viewportEl();
    if (!viewport) return;
    const gap = this.columnGap(canvas);
    const last = canvas.querySelector<HTMLElement>('.word:last-of-type');
    const words = canvas.querySelectorAll<HTMLElement>('.word');
    const finalWord = words.length ? words[words.length - 1] : last;
    const lastBlockRects = canvas.lastElementChild?.getClientRects();
    const lastRight = Math.max(finalWord?.getBoundingClientRect().right ?? 0,
      ...Array.from(lastBlockRects ?? []).map(rect => rect.right)) - canvas.getBoundingClientRect().left;
    this.chapterPageCount = countChapterPages(canvas.scrollWidth, viewport.clientWidth, gap, this.columnsPerSpread, lastRight);
    this.totalSpreads = countSpreads(this.chapterPageCount, this.columnsPerSpread);

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
    this.pageOffsetX = this.currentSpreadIndex * this.spreadStride(canvas);
    this.applyPageTransform(false);

    this.updateSpreadPages();
    this.updateSpreadProgress();
    const keptAnchor = anchorEl ? this.spreadAnchorWord : -1;
    this.afterSpreadChange();
    // Re-maquetar no es leer: mientras siga a la vista, el ancla es la misma palabra de antes. Si no,
    // girar el teléfono y volver retrocedía hasta el comienzo de la página apaisada.
    if (keptAnchor >= 0 && this.isWordVisible(keptAnchor)) this.spreadAnchorWord = keptAnchor;
    this.cdr.detectChanges();
    // Giro hacia el capítulo anterior: su última página ya está maquetada, la hoja puede dar vuelta.
    if (this.bookFlip.frozenDirection === -1 && this.isFullyRendered) this.bookFlip.resumeFrozen(this.currentSpreadIndex);
  }

  updateSpreadProgress() {
    if (!this.isPagedView) return;
    const progress = this.totalSpreads > 1
      ? (this.currentSpreadIndex / (this.totalSpreads - 1))
      : 1;
    this.chapterScrollPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
    this.isNearEnd = this.currentSpreadIndex >= this.totalSpreads - 1;

    this.trackPace(progress);

    const exactPage = (this.currentPage - 1) + (this.totalSpreads > 1 ? (this.currentSpreadIndex / this.totalSpreads) : 0);
    this.queueProgress(exactPage, `word-${this.firstWordOnSpread()}`);
    this.checkBackToReadingVisibility();
  }

  updateSpreadPages() {
    this.currentLeftPageNum = (this.currentSpreadIndex * this.columnsPerSpread) + 1;
    this.currentRightPageNum = Math.min(this.chapterPageCount, this.currentLeftPageNum + 1);
    this.recomputeBookPages();
  }

  turnSpreadNext() {
    this.coverSwing.finishNow(); // la tapa que todavía gira se apoya antes de pasar de página
    if (this.isBookView && this.bookClosed) {
      if (this.bookClosed === 'front') this.openClosedBook();
      return;
    }
    if (!this.isPagedView) {
      const canvas = this.canvasEl();
      if (canvas && canvas.scrollTop < canvas.scrollHeight - canvas.clientHeight - 2) canvas.scrollBy({ top: canvas.clientHeight * 0.9, behavior: 'smooth' });
      else this.nextPage();
      this.chromeVisible.set(false);
      return;
    }
    if (this.currentSpreadIndex < this.totalSpreads - 1) {
      this.goToSpread(this.currentSpreadIndex + 1, { animate: true });
    } else if (this.currentPage < this.totalPages) {
      // La hoja da vuelta sobre el capítulo siguiente apenas se pinta su primera página.
      const flipping = this.canFlip() && this.bookFlip.freeze(1, this.currentSpreadIndex);
      this.openChapter(this.currentPage, {}, flipping);
    } else if (this.isBookView) {
      this.closeBook('back');
    }
  }

  turnSpreadPrev() {
    this.coverSwing.finishNow();
    if (this.isBookView && this.bookClosed) {
      if (this.bookClosed === 'back') this.openClosedBook();
      return;
    }
    if (!this.isPagedView) {
      const canvas = this.canvasEl();
      if (canvas && canvas.scrollTop > 2) canvas.scrollBy({ top: -canvas.clientHeight * 0.9, behavior: 'smooth' });
      else this.previousPage();
      this.chromeVisible.set(false);
      return;
    }
    if (this.currentSpreadIndex > 0) {
      this.goToSpread(this.currentSpreadIndex - 1, { animate: true });
    } else if (this.currentPage > 1) {
      // Como en un libro de papel: al retroceder se llega a la ÚLTIMA página del capítulo anterior.
      const flipping = this.canFlip() && this.bookFlip.freeze(-1, this.currentSpreadIndex);
      this.openChapter(this.currentPage - 2, { spread: Infinity }, flipping);
    } else if (this.isBookView) {
      this.closeBook('front');
    }
  }

  /** Vista Libro: cierra el libro en la tapa (antes de la primera página) o en la contratapa. */
  private closeBook(side: 'front' | 'back') {
    this.coverSwing.finishNow();
    this.bookFlip.finishNow();
    if (side === 'back' && this.autoScrollActive) this.toggleAutoScroll(false);
    // La cara de adentro de la tapa es la página sobre la que estaba apoyada.
    const inner = this.canAnimateCover()
      ? this.bookFlip.copyPage(this.currentSpreadIndex, side === 'front' ? 'left' : 'right')
      : null;
    this.bookClosed = side;
    this.chromeVisible.set(true); // con el libro cerrado se ve cómo volver a la biblioteca
    this.pageAnnouncement = side === 'front' ? `Tapa de ${this.bookTitle}` : `Contratapa de ${this.bookTitle}`;
    if (!inner) return;
    // El libro cerrado se pone ya (oculto) para saber dónde termina la tapa; el abierto sigue a la vista.
    this.bookCoverClosing = true;
    this.cdr.detectChanges();
    const closing = this.coverSwing.close(side, inner, () => {
      this.bookCoverClosing = false;
      this.cdr.detectChanges(); // en el mismo cuadro en que se quita la tapa que giraba
    });
    if (!closing) {
      this.bookCoverClosing = false;
      this.cdr.markForCheck();
    }
  }

  /** Abre el libro cerrado: desde la tapa en la primera página, desde la contratapa en la última. */
  openClosedBook() {
    this.coverSwing.finishNow();
    const side = this.bookClosed;
    if (!side) return;
    const needsChapter = side === 'front' && (this.currentPage !== 1 || this.currentSpreadIndex !== 0);
    // Antes de quitar el libro cerrado: dónde está y cómo se ve su tapa.
    const closed = !needsChapter && this.canAnimateCover(true) ? this.coverSwing.snapshot() : null;
    this.bookClosed = null;
    this.chromeVisible.set(false);
    if (needsChapter) {
      this.openChapter(0);
      return;
    }
    this.bookCoverOpening = closed ? side : null;
    this.cdr.detectChanges();
    const inner = closed ? this.bookFlip.copyPage(this.currentSpreadIndex, side === 'front' ? 'left' : 'right') : null;
    const opening = !!closed && !!inner && this.coverSwing.open(side, closed, inner, () => {
      this.bookCoverOpening = null;
      this.cdr.detectChanges();
    });
    if (!opening && this.bookCoverOpening) {
      this.bookCoverOpening = null;
      this.cdr.markForCheck();
    }
    this.scheduleMarginLayout();
    this.announcePage();
  }

  /**
   * La tapa gira al abrir y cerrar con dos páginas a la vista, en la vista Libro y si no se pidió
   * menos movimiento. `closed`: el libro está cerrado (canFlip lo descarta, aquí es lo esperado).
   */
  private canAnimateCover(closed = false): boolean {
    return this.isBookView && this.columnsPerSpread === 2 && !this.bookCompact
      && this.settings.value.pageTurn === 'flip' && this.isFullyRendered
      && (closed || !this.bookClosed)
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Flechas |‹ ›| de la vista Libro: al comienzo o al final del capítulo. */
  goToChapterEdge(edge: 'start' | 'end') {
    this.goToSpread(edge === 'start' ? 0 : this.totalSpreads - 1, { animate: true });
  }

  /**
   * Muestra un pliego con controles ocultos. Con la hoja (vista Libro, dos páginas) el pliego vecino
   * llega dando vuelta una hoja; los saltos más largos y las demás vistas deslizan o cambian directo.
   */
  private goToSpread(index: number, opts: { animate?: boolean } = {}) {
    const canvas = this.canvasEl();
    if (!canvas || !this.isPagedView) return;
    const target = Math.max(0, Math.min(index, this.totalSpreads - 1));
    this.bookClosed = null;
    if (opts.animate && Math.abs(target - this.currentSpreadIndex) === 1 && this.canFlip()) {
      const from = this.currentSpreadIndex;
      const flipped = this.bookFlip.turn(target > from ? 1 : -1, from, () => {
        this.moveToSpread(target, false);
        this.cdr.detectChanges(); // folios y cabecera del pliego nuevo, antes de copiar su página
      });
      if (flipped) return;
    }
    this.bookFlip.finishNow();
    this.moveToSpread(target, !!opts.animate);
  }

  private moveToSpread(target: number, animate: boolean) {
    const canvas = this.canvasEl();
    if (!canvas || !this.isPagedView) return;
    if (this.activeHighlight) this.closeHighlightPopover();
    if (this.activePostIt && !this.isEditingPostIt) this.closePostIt();
    // En la vista Libro un salto de varias páginas no desliza el texto por dentro del papel: funde.
    const jump = this.isBookView && Math.abs(target - this.currentSpreadIndex) > 1;
    this.invalidateRulerLines(); // el pliego cambia: las líneas visibles ya no son las mismas
    this.currentSpreadIndex = target;
    this.updateSpreadPages();
    this.updateSpreadProgress();

    this.chromeVisible.set(false);
    this.pageOffsetX = this.currentSpreadIndex * this.spreadStride(canvas);
    this.applyPageTransform(animate ? (jump ? 'fade' : true) : false);
    this.afterSpreadChange();
    clearTimeout(this.flipTimer);
    this.flipTimer = setTimeout(() => {
      this.afterSpreadChange();
      this.cdr.markForCheck();
    }, animate && !jump && this.settings.value.pageTurn !== 'none' ? 220 : 0);
  }

  /** Mueve el lienzo al pliego actual: deslizando, con un fundido (`'fade'`) o directo. */
  private applyPageTransform(animate: boolean | 'fade'): void {
    const canvas = this.canvasEl();
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const turn = this.settings.value.pageTurn;
    // "Hoja" desliza cuando no puede doblar (una sola página, o mientras el capítulo se pinta).
    const slide = animate === true && turn !== 'none' && !reduced;
    canvas.style.transition = slide ? 'transform 220ms ease-out' : 'none';
    canvas.style.transform = this.isPagedView ? `translateX(${-this.pageOffsetX + this.dragOffsetX}px)` : '';
    if ((animate === 'fade' || (animate && reduced)) && turn !== 'none') {
      canvas.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: reduced ? 120 : 180, easing: 'ease-out' });
    }
  }

  /** Muestra el pliego que contiene un elemento (una palabra) del capítulo abierto. */
  private showSpreadOf(el: HTMLElement, animate: boolean) {
    const canvas = this.canvasEl();
    if (!canvas) return;
    const spread = this.spreadOfElement(el, canvas);
    if (spread >= this.totalSpreads) this.recalculateSpreads(); // el capítulo seguía cargando
    if (spread !== this.currentSpreadIndex) {
      this.goToSpread(spread, { animate });
    }
  }

  /** Tras cambiar de pliego: marcador de la página, ancla de lectura y pestaña de la voz. */
  private afterSpreadChange() {
    this.refreshVisiblePage();
    this.announcePage();
    this.updateNarrationMarker();
    this.checkBackToReadingVisibility(); // con el pliego nuevo ya a la vista
    this.scheduleMarginLayout();
    this.scheduleAutoPage();
  }

  /** El lienzo del texto (lo usan también el menú de la selección y los post-its). */
  canvasEl(): HTMLElement | null {
    return document.querySelector('.reading-canvas') as HTMLElement | null;
  }

  /** Separación entre columnas (el lomo en vista libro; 0 con una sola página). */
  private columnGap(canvas: HTMLElement): number {
    const gap = parseFloat(getComputedStyle(canvas).columnGap);
    return isNaN(gap) ? 0 : gap;
  }

  /** Lo que oye un lector de pantalla al pasar de página (región aria-live del lector). */
  pageAnnouncement = '';

  private announcePage() {
    if (!this.isPagedView) return;
    this.pageAnnouncement = this.pagePositionLabel
      .replace('Págs.', 'Páginas').replace('Pág.', 'Página').replace('–', ' y ');
  }

  /** Ventana inmóvil: recorta el texto y sirve de origen a regla, post-its y narración. */
  viewportEl(): HTMLElement | null {
    return document.querySelector('.reader-viewport');
  }

  /** El papel (en la vista Libro, las páginas del libro abierto). */
  private shellEl(): HTMLElement | null {
    return document.querySelector('.rd-shell');
  }

  /** Contenedor del lector: lleva las medidas del libro (--book-*) y el color de la tapa. */
  private containerEl(): HTMLElement | null {
    return document.querySelector('.workbench-container');
  }

  /** Vista Libro: tamaño del libro, márgenes del papel y cantos, como variables CSS del contenedor. */
  private applyBookGeometry() {
    const container = this.containerEl();
    if (!container) return;
    if (!this.isBookView) {
      if (this.bookFrameState) {
        BOOK_CSS_VAR_NAMES.forEach(name => container.style.removeProperty(name));
        this.bookFrameState = null;
      }
      return;
    }
    const frame = bookFrame({
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight,
      columns: columnsForViewport(window.innerWidth, window.innerHeight),
    });
    const vars = bookCssVars(frame, this.settings.value.margins, this.bookReadFraction());
    for (const [name, value] of Object.entries(vars)) container.style.setProperty(name, value);
    this.bookFrameState = frame;
  }

  private bookReadFraction(): number {
    return this.bookPageTotal > 1 ? (this.bookPageCurrent - 1) / (this.bookPageTotal - 1) : 0;
  }

  /** Los cantos acompañan la lectura: crecen a la izquierda y se adelgazan a la derecha. */
  private updateBookEdges() {
    if (!this.isBookView || !this.bookFrameState) return;
    const edges = bookEdges(this.bookReadFraction(), this.bookFrameState);
    const style = this.containerEl()?.style;
    style?.setProperty('--book-edge-left', `${edges.left}px`);
    style?.setProperty('--book-edge-right', `${edges.right}px`);
  }

  /** "Págs. 34–35 de 612" (en la vista Libro, páginas de todo el libro; en Páginas, del capítulo). */
  get pagePositionLabel(): string {
    if (this.isBookView && this.bookClosed) return this.bookClosed === 'front' ? 'Tapa' : 'Contratapa';
    const two = this.columnsPerSpread === 2 && this.currentLeftPageNum < this.chapterPageCount;
    const left = this.isBookView ? this.bookPageCurrent : this.currentLeftPageNum;
    const total = this.isBookView ? this.bookPageTotal : this.chapterPageCount;
    return `${two ? `Págs. ${left}–${left + 1}` : `Pág. ${left}`} de ${total}`;
  }

  private spreadStride(canvas: HTMLElement): number {
    return spreadStride(this.viewportEl()?.clientWidth || canvas.clientWidth, this.columnGap(canvas));
  }

  private spreadOfElement(el: HTMLElement, canvas: HTMLElement): number {
    const viewport = this.viewportEl() || canvas;
    return spreadOfElement(el.getBoundingClientRect(), canvas.getBoundingClientRect().left,
      0, viewport.clientWidth, this.columnGap(canvas), this.columnsPerSpread);
  }

  private pageOfElement(el: HTMLElement, canvas: HTMLElement): number {
    const viewport = this.viewportEl() || canvas;
    return pageOfElement(el.getBoundingClientRect(), canvas.getBoundingClientRect().left,
      0, viewport.clientWidth, this.columnGap(canvas), this.columnsPerSpread);
  }

  /** El guardado usa el destino del giro, aunque el texto siga animándose desde la página anterior. */
  private firstWordOnSpread(): number {
    const canvas = this.canvasEl();
    if (!canvas) return 0;
    const words = canvas.querySelectorAll<HTMLElement>('.word');
    let left = 0, right = words.length;
    while (left < right) {
      const middle = (left + right) >> 1;
      if (this.spreadOfElement(words[middle], canvas) < this.currentSpreadIndex) left = middle + 1;
      else right = middle;
    }
    return Number(words[Math.min(left, words.length - 1)]?.id.slice(5)) || 0;
  }

  private fitLinesToPage(canvas: HTMLElement) {
    this.applyBookGeometry(); // en la vista Libro el papel tiene el tamaño del libro, no de la pantalla
    const viewport = this.viewportEl();
    if (!viewport) return;
    this.linesPerPage = fitLinesToPage(viewport.clientHeight, this.fontSize, this.lineHeight);
    canvas.style.height = `${this.linesPerPage * Math.round(this.fontSize * this.lineHeight)}px`;
    canvas.style.setProperty('--reader-lines-per-page', String(this.linesPerPage));
  }

  /** La tipografía o el espacio cambió: vuelve a medir los pliegos sin perder la página. */
  private scheduleRelayout() {
    if (!this.isPagedView || !this.isFullyRendered) return;
    clearTimeout(this.relayoutTimer);
    this.relayoutTimer = setTimeout(() => this.recalculateSpreads(true), 150);
  }

  private resizeTimer: any = null;
  private resizePending = false;

  /**
   * Girar el teléfono re-maqueta al primer evento (sin un instante con el texto desarmado) y,
   * si la ventana siguió cambiando (arrastrarla manda decenas de eventos), una vez más al final.
   */
  @HostListener('window:resize')
  onWindowResize() {
    if (this.resizeTimer === null) this.relayoutAfterResize();
    else this.resizePending = true;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      if (this.resizePending) {
        this.resizePending = false;
        this.relayoutAfterResize();
      }
    }, 150);
  }

  private relayoutAfterResize() {
    this.coverSwing.finishNow();
    this.bookFlip.finishNow(); // las copias de la hoja tienen el tamaño de antes
    this.invalidateRulerLines(); // el reflow puede desplazar todas las líneas
    this.scheduleMarginLayout();
    if (this.isPagedView) {
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
    if (target?.closest('button, a') && (event.key === ' ' || event.key === 'Enter')) return;
    if (this.isSettingsOpen || this.isTocOpen || this.isAudioPanelOpen || this.isMoreOpen || this.isSummaryModalOpen || this.showImageModal || this.showRestartModal || this.showBreakModal) return;
    if (this.isVocabularyOpen || this.isSearchOpen) return; // esos paneles tienen su propio teclado
    // Ctrl/Cmd+F busca en todo el libro: la búsqueda del navegador solo ve el capítulo abierto.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    // B marca o desmarca la página (como la esquina doblada).
    if (event.key.toLowerCase() === 'b' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggleBookmarkHere();
      return;
    }
    // Izquierda/derecha cambian de página o capítulo en cualquier modo de vista:
    // turnSpreadNext/turnSpreadPrev ya delegan a nextPage/previousPage cuando no
    // está activa la doble página, así que no hace falta repetir esa rama aquí.
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
      event.preventDefault();
      this.turnSpreadNext();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
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
    const cr = (this.viewportEl() || canvas).getBoundingClientRect();
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
    const cr = (this.viewportEl() || canvas).getBoundingClientRect();
    const place = (i: number): number => { // -1 antes de la vista, 0 visible, 1 después
      const el = document.getElementById(`word-${i}`);
      if (!el) return 1; // todavía no renderizada: está más adelante
      const r = el.getBoundingClientRect();
      if (this.isPagedView) {
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
      ? this.annotations.bookmarkIn(chapterIndex, range[0], range[1])
      : null;
  }

  /** En lectura continua el scroll es constante: se recalcula como mucho una vez por cuadro. */
  private scheduleVisibleRefresh() {
    if (this.visibleRefreshRaf !== null) return;
    this.visibleRefreshRaf = requestAnimationFrame(() => {
      this.visibleRefreshRaf = null;
      const before = this.currentSpreadBookmark;
      this.refreshVisiblePage();
      // Agendado desde el scroll (fuera de la zona): el ícono de marcador solo se repinta si cambió.
      if (this.currentSpreadBookmark !== before && !NgZone.isInAngularZone()) {
        this.ngZone.run(() => this.cdr.markForCheck());
      }
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
      const columnWidth = canvas && this.isPagedView
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
    const perSpread = this.isPagedView ? this.columnsPerSpread : 1;

    // Otra letra, otro tamaño u otro ancho de página invalidan lo medido.
    const layoutKey = this.bookLayoutKey();
    if (layoutKey !== this.measuredLayoutKey) {
      this.measuredLayoutKey = layoutKey;
      this.measuredChapterPages.clear();
    }
    if (this.isPagedView && this.isFullyRendered) {
      this.measuredChapterPages.set(cur, this.chapterPageCount);
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
    this.updateBookEdges();
  }

  private bookLayoutKey(): string {
    const canvas = this.canvasEl();
    return [this.layoutMode, this.settings.value.margins, this.columnsPerSpread, this.linesPerPage, canvas?.clientWidth ?? 0,
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
    this.sliderPreviewLabel = `${Math.round((page - 1) / Math.max(1, this.bookPageTotal - 1) * 100)} % · ${this.chapterLabel(this.chapterIndexForBookPage(page))}`;
  }

  onBookSliderChange(value: string | number) {
    this.sliderDragPage = null;
    this.sliderPreviewLabel = '';
    this.goToBookPage(Math.round(Number(value)));
  }

  goToBookPage(page: number) {
    if (!this.chapterStartPages.length) return;
    const index = this.chapterIndexForBookPage(page);
    const perSpread = this.isPagedView ? this.columnsPerSpread : 1;
    const spread = Math.max(0, Math.floor((page - this.chapterStartPages[index]) / perSpread));
    if (!this.isPagedView) {
      const fraction = Math.min(1, Math.max(0, (page - this.chapterStartPages[index]) / Math.max(1, this.chapterPageEstimates[index] - 1)));
      if (index === this.currentPage - 1) {
        const canvas = this.canvasEl();
        if (canvas) canvas.scrollTop = fraction * (canvas.scrollHeight - canvas.clientHeight);
      } else this.openChapter(index, { fraction });
      return;
    }
    if (index === this.currentPage - 1) {
      this.goToSpread(spread, { animate: true });
    } else {
      // Las páginas de ese capítulo son estimadas: se va a la misma fracción del capítulo.
      const estimatedSpreads = Math.max(1, (this.chapterPageEstimates[index] || perSpread) / perSpread);
      this.openChapter(index, { fraction: Math.min(1, spread / estimatedSpreads) });
    }
  }

  /** Para el panel de vocabulario (función flecha: conserva `this`). */
  readonly vocabularyPageLabel = (chapterIndex: number, wordIdx: number, wordCount: number): string => {
    const word = chapterIndex === this.currentPage - 1 ? document.getElementById(`word-${wordIdx}`) : null;
    const canvas = this.canvasEl();
    if (!this.isPagedView || !word || !canvas) return `cap. ${chapterIndex + 1}`;
    const page = this.pageOfElement(word, canvas);
    // En la vista Libro, la página de todo el libro (la misma del folio).
    return `pág. ${this.isBookView ? (this.chapterStartPages[chapterIndex] || 1) + page : page + 1}`;
  };

  /** Cuaderno → lector: abre el capítulo del pasaje y lo resalta (espera a los capítulos si aún no llegan). */
  private goToPassage(chapterId: string, wordIdx: number, lastWordIdx = -1) {
    const index = this.chapters.findIndex(chapter => String(chapter.id) === chapterId);
    if (index >= 0) {
      this.jumpToWord(index, wordIdx, 'Pasaje en', lastWordIdx);
    } else if (!this.chapters.length) {
      this.pendingPassage = { chapterId, word: wordIdx, lastWord: lastWordIdx };
    }
  }

  /** Lleva a una palabra de cualquier capítulo y la resalta unos segundos (hasta `lastWordIdx`, si es una frase). */
  private jumpToWord(chapterIndex: number, wordIdx: number, label: string, lastWordIdx: number = -1) {
    this.nextJumpLabel = label;
    this.nextJumpLastWord = lastWordIdx;
    if (chapterIndex === this.currentPage - 1) {
      this.scrollWordIntoView(wordIdx, true);
    } else {
      this.openChapter(chapterIndex, { wordIdx });
    }
  }

  // ── MARCADORES DE PÁGINA ──────────────────────────────────────────

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
    if (!range || !this.currentChapterId) return;
    const page = this.isBookView ? this.bookPageCurrent : this.currentLeftPageNum;
    this.isBookmarkBusy = true;
    this.annotations.addBookmark(this.currentPage - 1, range[0], this.snippetFrom(range[0])).subscribe({
      next: () => {
        this.isBookmarkBusy = false;
        this.refreshVisiblePage();
        this.refreshBookmarkLabels();
        this.flashToast('🔖', this.isPagedView ? `Página ${page} marcada` : 'Marcador guardado');
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
    this.annotations.removeBookmark(bookmark).subscribe({
      next: () => {
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
    const label = this.vocabularyPageLabel(bookmark.chapterIndex, bookmark.wordIdx, 0);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private refreshBookmarkLabels() {
    this.bookmarks.forEach(bookmark => bookmark.pageLabel = this.bookmarkPageLabel(bookmark));
  }

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

  flashToast(icon: string, text: string, durationMs: number = 2500) {
    this.toastIcon = icon;
    this.bookmarkToastText = text;
    this.showBookmarkToast = true;
    clearTimeout(this.bookmarkToastTimer);
    this.bookmarkToastTimer = setTimeout(() => this.showBookmarkToast = false, durationMs);
  }

  // ── NARRACIÓN DESDE EL LIBRO ──────────────────────────────────────

  /** Hay una palabra marcada a mano (no la que va leyendo la narración en este momento). */
  get canClearWordFocus(): boolean {
    return this.currentWordIndex >= 0 && !this.isNarrationPlaying && !this.isAudioLoading;
  }

  /**
   * Quita la palabra marcada y el foco de frase/párrafo que la acompaña. Esa palabra también es
   * la posición guardada de la narración (por eso volvía al recargar): se borra, y "Escuchar"
   * parte desde la página a la vista.
   */
  clearWordFocus() {
    if (!this.canClearWordFocus) return;
    this.currentWordIndex = -1;
    this.lastAudioWordIndex = 0;
    this.saveAudioPosition();
    this.showBackToReadingBtn = false;
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
    this.currentWordIndex = idx; // palabra, frase y párrafo se marcan directo en el DOM
    if (idx !== -1) {
      this.lastAudioWordIndex = idx;
      this.saveAudioPosition();
      // La voz llega fuera de la zona: solo pasar de página cambia lo que muestran las barras y el pie.
      if (this.wordLeavesSpread(idx)) this.ngZone.run(() => this.scrollWordIntoView(idx));
      else this.scrollWordIntoView(idx);
    }
    this.narrationWordIdx = idx;
    this.updateNarrationMarker();
  }

  /** En Páginas: ¿la palabra está en otro pliego? (en Desplazamiento el scroll avisa por su cuenta) */
  private wordLeavesSpread(idx: number): boolean {
    if (!this.isPagedView) return false;
    const el = document.getElementById(`word-${idx}`);
    const canvas = this.canvasEl();
    return !!el && !!canvas && this.spreadOfElement(el, canvas) !== this.currentSpreadIndex;
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
    const cr = (this.viewportEl() || canvas).getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) {
      marker.classList.remove('is-visible'); // la palabra quedó fuera de la vista
      return;
    }

    let side: 'left' | 'right' = 'left';
    let x: number;
    if (this.isPagedView && this.columnsPerSpread > 1) {
      side = cx > cr.left + cr.width / 2 ? 'right' : 'left';
      x = side === 'left' ? (cr.left - hr.left) / 2 : (cr.right - hr.left) + (hr.right - cr.right) / 2;
    } else if (this.isPagedView) {
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

  // ── REPORTE DE ERRORES DEL LIBRO ──────────────────────────────────

  openReportModal(contextOverride?: Partial<ReportContextData>): void {
    const currentChapter = this.chapters[this.currentPage - 1];
    const isAudioActive = this.narration.isPlaying || this.narration.isPaused;
    const audioTimestamp = isAudioActive ? this.narration.audio.currentTime : null;

    this.reportContext = {
      bookId: this.bookId || '',
      bookTitle: this.bookTitle,
      chapterId: currentChapter?.id || '',
      chapterTitle: this.chapterTitle,
      chapterOrder: this.currentPage,
      audioTimestamp: audioTimestamp,
      voiceName: this.narration.voice,
      ...contextOverride,
    };
    this.showReportModal = true;
    this.cdr.markForCheck();
  }

  closeReportModal(): void {
    this.showReportModal = false;
    this.reportContext = null;
    this.cdr.markForCheck();
  }

  // ── BUSCAR EN EL LIBRO ────────────────────────────────────────────

  openSearch() {
    if (!this.chapters.length) return;
    this.isSearchOpen = true;
    this.isTocOpen = false;
    this.isSettingsOpen = false;
    this.isVocabularyOpen = false;
  }

  /** Lleva al resultado `index` de la búsqueda. El primer salto recuerda dónde estaba el lector. */
  goToSearchResult(index: number) {
    const result = this.bookSearch.results[index];
    if (!result) return;
    this.isSearchOpen = false;
    if (!this.bookSearch.origin) {
      this.bookSearch.origin = { chapterIndex: this.currentPage - 1, wordIdx: this.visibleWordRange()?.[0] ?? 0 };
    }
    this.bookSearch.activeIndex = index;
    this.jumpToWord(result.chapterIndex, result.firstWord, 'Resultado', result.lastWord);
  }

  /** Siguiente (+1) o anterior (-1) resultado, aunque esté en otro capítulo. */
  stepSearchResult(delta: number) {
    const index = this.bookSearch.step(delta);
    if (index >= 0) this.goToSearchResult(index);
  }

  /** Vuelve a la página donde estaba antes de recorrer los resultados. */
  returnFromSearch() {
    const origin = this.bookSearch.origin;
    if (!origin) return;
    this.bookSearch.origin = null;
    this.jumpToWord(origin.chapterIndex, origin.wordIdx, 'De vuelta en');
  }

  closeSearch() {
    this.bookSearch.reset();
    this.clearBookmarkHighlight();
  }

  // ── RESUMEN HASTA DONDE VOY (ANTI-SPOILERS) ──────────────────────
  openProgressSummary(): void {
    this.isSummaryModalOpen = true;
    this.isTocOpen = false;
    this.isSettingsOpen = false;
    this.isVocabularyOpen = false;
    this.fetchProgressSummary();
  }

  closeProgressSummary(): void {
    this.isSummaryModalOpen = false;
    this.progressSummaryRequest?.unsubscribe();
    this.progressSummaryRequest = null;
  }

  fetchProgressSummary(): void {
    if (this.isSummaryLoading) return;
    this.progressSummary = null;
    this.summaryError = '';
    this.summaryUpToChapter = this.currentPage;
    if (!this.inventoryId) {
      this.summaryError = 'No se pudo identificar el libro. Vuelve a abrirlo desde tu biblioteca.';
      return;
    }
    this.isSummaryLoading = true;

    this.progressSummaryRequest = this.readingSummary.load(this.inventoryId, this.summaryUpToChapter).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSummaryLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res) => {
        if (res.status === 'ready' && res.summary) {
          this.progressSummary = res.summary;
        } else {
          this.summaryError = res.message || 'No se pudo cargar el resumen.';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.summaryError = err instanceof TimeoutError
          ? 'El resumen está tardando más de lo normal. Vuelve a intentarlo en unos segundos.'
          : err.error?.message || err.error?.error || 'Error al conectar con el servicio de resúmenes.';
        this.cdr.markForCheck();
      }
    });
  }

  // ── PERSONAJES ────────────────────────────────────────────────────
  /** Personajes del libro: se conversa en la ventana rápida, la misma de Personajes y Mi Biblioteca.
   *  `draft` deja escrita una pregunta (la de "Preguntar a un personaje" sobre una cita). */
  openCharacters(draft?: string) {
    this.isTocOpen = false;
    this.isSettingsOpen = false;
    this.characterChat.openForBook(this.inventoryId, draft);
  }

  private loadInkBalance() {
    this.chatService.loadInitialInk();
  }

  /** El texto congelado se volvió a pintar (capítulo, subrayados, biónica): se vuelve a marcar la palabra. */
  onTextRefreshed(): void {
    this.highlighter.refresh();
  }

  trackByToken(index: number, token: any): number {
    return token.idx >= 0 ? token.idx : -(index + 1);
  }

  // ── SUBRAYADOS, MENÚ DE LA SELECCIÓN Y POST-ITS (ver sus componentes) ──
  get currentChapterId(): string | undefined {
    return this.chapters[this.currentPage - 1]?.id;
  }

  /** Libro (UUID) del capítulo abierto: lo piden las flashcards y los logros. */
  get bookId(): string | null {
    return this._bookIdForSession;
  }

  /** Marca en cada palabra del capítulo abierto el color de su subrayado. */
  private applyHighlightsToTokens() {
    const byWord = this.annotations.highlightsByWord(this.currentChapterId);
    const paint = (tok: ReaderToken) => {
      if (!tok.isWord) return;
      tok.hl = byWord.get(tok.idx)?.color ?? null;
    };
    this.titleTokens.forEach(paint);
    this.parsedBlocks.forEach(block => block.tokens.forEach(paint));
    this.textVersion++; // los tokens cambiaron por dentro: el texto congelado se vuelve a pintar
  }

  /** Se creó, recoloreó o quitó un subrayado: se repintan las palabras. */
  onHighlightsChanged() {
    this.applyHighlightsToTokens();
    this.cdr.detectChanges();
  }

  openHighlightPopover(highlight: ReaderHighlight) {
    this.menu?.openHighlightPopover(highlight);
  }

  closeHighlightPopover() {
    this.menu?.closeHighlightPopover();
  }

  dismissSelection() {
    this.menu?.dismissSelection();
  }

  hideWordMenu() {
    if (this.menu) this.menu.showWordMenu = false;
  }

  createPostIt() {
    this.postIts?.create();
  }

  closePostIt() {
    this.postIts?.closePostIt();
  }

  /** Recoloca los papelitos (scroll, giro de página, tamaño): los mueve su componente. */
  private scheduleMarginLayout() {
    this.postIts?.scheduleLayout();
  }

  /** "Narrar desde aquí" del menú de la selección: narra desde esa palabra. */
  narrateFromWord(wordIdx: number) {
    if (wordIdx < 0) {
      this.playAudio();
      return;
    }
    this.lastAudioWordIndex = wordIdx;
    this.currentWordIndex = wordIdx;
    this.saveAudioPosition();
    this.stopAudio(true);
    setTimeout(() => this.playAudio(), 150); // que la detención alcance a hacer efecto
  }

  /**
   * Escape cierra lo que esté encima, de lo último que se abre hacia el texto: imagen, avisos, resumen,
   * diccionario, nota, subrayado, menú de la selección, Más, Aa, narración e índice. Si no hay nada
   * abierto quita la palabra marcada. Buscar y Vocabulario se cierran solos.
   */
  @HostListener('document:keydown.escape')
  onReaderEscape() {
    if (this.isSearchOpen || this.isVocabularyOpen) return;
    if (this.showImageModal) return this.closeImageModal();
    if (this.showBreakModal) return this.keepReading();
    if (this.showRestartModal) return this.closeRestartModal();
    if (this.isSummaryModalOpen) return this.closeProgressSummary();
    if (this.menu?.showDictionaryModal) return this.menu.closeDictionary();
    if (this.activePostIt) return this.closePostIt();
    if (this.activeHighlight) return this.closeHighlightPopover();
    if (this.menu?.showWordMenu) return this.dismissSelection();
    if (this.isMoreOpen) {
      this.isMoreOpen = false;
      return;
    }
    if (this.isSettingsOpen) return this.toggleSettings(); // devuelve el foco al botón que la abrió
    if (this.isAudioPanelOpen) return this.toggleAudioPanel();
    if (this.isTocOpen) return this.toggleToc();
    this.clearWordFocus();
  }

  private syncProgressToBackend(exactPage: number, wordId: string = '') {
    this.queueProgress(exactPage, wordId, true);
  }

  private queueProgress(exactPage: number, wordId = '', immediate = false) {
    // Mirar la tapa no es empezar a leer: hasta abrirlo, el libro vuelve a aparecer cerrado.
    if (this.bookClosed === 'front') return;
    const firstWord = !wordId && this.isFullyRendered ? this.visibleWordRange()?.[0] : undefined;
    const anchor = wordId || (firstWord !== undefined ? `word-${firstWord}` : '');
    this.saveProgressSubject.next({ chapter: this.currentPage, exactPage, wordId: anchor, immediate });
    const word = Number(anchor.replace('word-', ''));
    this.livePosition = {
      chapter: this.currentPage,
      word: anchor && Number.isFinite(word) ? word : null,
      fraction: Math.min(1, Math.max(0, this.chapterScrollPercent / 100)),
    };
    this.livePosition$.next(this.livePosition);
  }

  // ── LECTURA CONJUNTA (ver ReaderCompanionsComponent) ─────────────────

  /** Dónde va la lectura (primera palabra a la vista): la lectura conjunta se la avisa a los compañeros. */
  livePosition: ReaderLivePosition | null = null;
  /** Avisa cada cambio de página; puede emitir fuera de la zona de Angular (el scroll va fuera). */
  readonly livePosition$ = new Subject<ReaderLivePosition>();

  /** Lleva a donde va un compañero. `quiet` (al seguirlo) pasa de página sin resaltar ni avisar. */
  goToCompanion(chapter: number, word: number | null, label: string, quiet = false) {
    const index = chapter - 1;
    if (index < 0 || index >= this.chapters.length) return;
    const sameChapter = index === this.currentPage - 1 && !this.bookClosed;
    if (word === null) {
      if (!sameChapter) this.openChapter(index);
    } else if (!quiet) {
      this.jumpToWord(index, word, label);
    } else if (sameChapter) {
      this.scrollWordIntoView(word, false);
    } else {
      this.openChapter(index, { wordIdx: word });
    }
  }

  /** ¿Lo que lee el compañero ya está a la vista? Entonces seguirlo no pasa de página. */
  isCompanionOnScreen(chapter: number, word: number | null): boolean {
    if (this.bookClosed || chapter !== this.currentPage) return false;
    return word === null || this.isWordVisible(word);
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
}
