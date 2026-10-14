import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone,
  OnDestroy, ViewChild, ViewEncapsulation, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Subscription } from 'rxjs';
import { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';

import { NotebookService } from '../notebook.service';
import {
  NotebookDigest, NotebookGeometry, NotebookPrefs, NotebookSaveState, NotebookStroke, NotebookTab, NotebookTabMeta,
  NotebookVisibility,
} from '../notebook.models';
import { InkLayer, InkTool } from '../notebook-ink';
import { NotebookBookPanelComponent } from '../notebook-book-panel/notebook-book-panel.component';
import { Viewport, clampGeometry, defaultGeometry, parseGeometry } from '../window-geometry';

type Mode = 'write' | 'draw';
type ResizeEdge = 'e' | 's' | 'se';

const CONTENT_DEBOUNCE_MS = 350;

/**
 * Ventana del cuaderno, como el Bloc de notas de Windows: pestañas, menús Archivo/Editar/Ver,
 * barra de formato (títulos, viñetas, negrita, tablas…), modo Dibujar y barra de estado.
 * Se mueve por la barra de título, cambia de tamaño desde los bordes, se minimiza y se cierra
 * sin perder nada (todo se guarda en la cuenta). En el celular ocupa la pantalla completa.
 *
 * Se crea la primera vez que se abre el cuaderno (AppComponent) y queda viva: al minimizar o
 * cerrar solo se oculta, así el editor no pierde el cursor ni el historial de deshacer.
 */
@Component({
  selector: 'app-notebook-window',
  standalone: true,
  imports: [CommonModule, FormsModule, MatMenuModule, NotebookBookPanelComponent],
  templateUrl: './notebook-window.component.html',
  styleUrl: './notebook-window.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotebookWindowComponent implements AfterViewInit, OnDestroy {
  readonly notebook = inject(NotebookService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @ViewChild('editorHost', { static: true }) private editorHost!: ElementRef<HTMLElement>;
  @ViewChild('inkCanvas', { static: true }) private inkCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sheet', { static: true }) private sheet!: ElementRef<HTMLElement>;
  @ViewChild('scroller', { static: true }) private scroller!: ElementRef<HTMLElement>;
  @ViewChild('renameInput') private renameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('linkInput') private linkInput?: ElementRef<HTMLInputElement>;

  readonly fonts = [
    { name: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans (predeterminada)', css: "'Plus Jakarta Sans', system-ui, sans-serif" },
    { name: 'Literata', label: 'Literata', css: "'Literata', Georgia, serif" },
    { name: 'Merriweather', label: 'Merriweather', css: "'Merriweather', Georgia, serif" },
    { name: 'EB Garamond', label: 'EB Garamond', css: "'EB Garamond', Georgia, serif" },
    { name: 'Space Grotesk', label: 'Space Grotesk', css: "'Space Grotesk', system-ui, sans-serif" },
    { name: 'Outfit', label: 'Outfit', css: "'Outfit', system-ui, sans-serif" },
    { name: 'Consolas', label: 'Consolas (monoespaciada)', css: "Consolas, 'Cascadia Mono', 'Courier New', monospace" },
  ];
  readonly sizes = [12, 14, 16, 18, 20, 24, 28];
  readonly textColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#64748b'];
  readonly highlightColors = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];
  readonly inkColors = ['#f8fafc', '#1f2937', '#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];

  visibility: NotebookVisibility = 'closed';
  tabs: NotebookTabMeta[] = [];
  activeId: string | null = null;
  activeTab: NotebookTab | null = null;
  loadingTab = false;
  tabError = '';
  saveStates: Record<string, NotebookSaveState> = {};
  conflict: NotebookTab | null = null;
  prefs: NotebookPrefs = this.notebook.prefs$.value;
  geometry: NotebookGeometry = defaultGeometry(this.viewport());
  mobile = false;
  mode: Mode = 'write';
  inkTool: InkTool = 'pen';
  inkColor = '#f8fafc';
  inkSize = 3;
  renamingId: string | null = null;
  renameValue = '';
  confirmDelete: NotebookTabMeta | null = null;
  linkOpen = false;
  linkValue = '';
  bookPanelOpen = true;
  digest: NotebookDigest | null = null;
  exporting = false;
  toast = '';
  status = { line: 1, col: 1, chars: 0 };

  editor: Editor | null = null;
  private ink!: InkLayer;
  private readonly subs = new Subscription();
  private resizeObserver?: ResizeObserver;
  private contentTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private applying = false;
  private draggedTabId: string | null = null;
  private mobileQuery = window.matchMedia('(max-width: 640px)');
  private layoutFrame = 0;

  ngAfterViewInit(): void {
    this.mobile = this.mobileQuery.matches;
    this.mobileQuery.addEventListener('change', this.onMobileChange);
    this.geometry = clampGeometry(parseGeometry(this.notebook.readGeometry()) || defaultGeometry(this.viewport()), this.viewport());
    this.createEditor();
    this.ink = new InkLayer(this.inkCanvas.nativeElement, strokes => this.onInkChange(strokes));
    this.applyPrefs(this.notebook.prefs$.value);

    this.zone.runOutsideAngular(() => {
      // El ajuste va al siguiente cuadro: hacerlo dentro del aviso cambia tamaños observados
      // y el navegador reporta "ResizeObserver loop" (la app lo muestra como error).
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
      this.resizeObserver.observe(this.scroller.nativeElement);
      this.resizeObserver.observe(this.editorHost.nativeElement);
    });

    this.subs.add(this.notebook.visibility$.subscribe(visibility => {
      if (this.visibility === 'open' && visibility !== 'open') this.flushEditor();
      this.visibility = visibility;
      if (visibility === 'open') {
        this.notebook.loadTabs().then(() => this.ensureOneTab()).catch(() => this.showToast('No se pudo cargar el cuaderno. Revisa tu conexión.'));
        this.scheduleLayout();
      }
      this.cdr.markForCheck();
    }));
    this.subs.add(this.notebook.tabs$.subscribe(tabs => {
      this.tabs = tabs;
      this.cdr.markForCheck();
    }));
    this.subs.add(this.notebook.activeId$.subscribe(id => this.showTab(id)));
    this.subs.add(this.notebook.saveStates$.subscribe(states => {
      this.saveStates = states;
      this.cdr.markForCheck();
    }));
    this.subs.add(this.notebook.conflicts$.subscribe(conflicts => {
      this.conflict = this.activeId ? conflicts[this.activeId] || null : null;
      this.cdr.markForCheck();
    }));
    this.subs.add(this.notebook.replaced$.subscribe(tab => {
      if (tab.id === this.activeId) this.applyTab(tab);
    }));
    this.subs.add(this.notebook.errors$.subscribe(message => this.showToast(message)));
    this.subs.add(this.notebook.prefs$.subscribe(prefs => this.applyPrefs(prefs)));
  }

  ngOnDestroy(): void {
    this.flushEditor();
    this.subs.unsubscribe();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.layoutFrame);
    this.mobileQuery.removeEventListener('change', this.onMobileChange);
    this.ink?.destroy();
    this.editor?.destroy();
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  private createEditor(): void {
    this.editor = new Editor({
      element: this.editorHost.nativeElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
        }),
        TextStyleKit.configure({ lineHeight: false, backgroundColor: false }),
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder: 'Escribe aquí tus apuntes…' }),
        CharacterCount,
      ],
      editorProps: {
        attributes: { class: 'nb-prose', spellcheck: 'true', 'aria-label': 'Apuntes', 'aria-multiline': 'true' },
      },
      onUpdate: () => {
        if (this.applying) return;
        this.scheduleContentSave();
        this.updateStatus();
      },
      onSelectionUpdate: () => this.updateStatus(),
      onTransaction: () => this.cdr.markForCheck(),
    });
  }

  private scheduleContentSave(): void {
    clearTimeout(this.contentTimer);
    this.contentTimer = setTimeout(() => this.flushEditor(), CONTENT_DEBOUNCE_MS);
  }

  /** Pasa al servicio lo último que se escribió (antes de cambiar de pestaña, minimizar o cerrar). */
  private flushEditor(): void {
    if (this.contentTimer === undefined) return;
    clearTimeout(this.contentTimer);
    this.contentTimer = undefined;
    if (this.activeTab && this.editor) {
      this.notebook.update(this.activeTab.id, { content: this.editor.getJSON() as Record<string, unknown> });
    }
  }

  private async showTab(id: string | null): Promise<void> {
    this.flushEditor();
    this.activeId = id;
    this.activeTab = null;
    this.tabError = '';
    this.digest = null;
    this.linkOpen = false;
    this.conflict = id ? this.notebook.conflicts$.value[id] || null : null;
    if (!id) {
      this.applyTab(null);
      return;
    }
    const cached = this.notebook.peekTab(id);
    if (cached) {
      this.activeTab = cached;
      this.applyTab(cached);
      return;
    }
    this.loadingTab = true;
    this.cdr.markForCheck();
    try {
      const tab = await this.notebook.getTab(id);
      if (this.activeId !== id) return;
      this.activeTab = tab;
      this.applyTab(tab);
    } catch {
      if (this.activeId === id) this.tabError = 'No se pudo abrir esta pestaña. Revisa tu conexión.';
    } finally {
      if (this.activeId === id) this.loadingTab = false;
      this.cdr.markForCheck();
    }
  }

  private applyTab(tab: NotebookTab | null): void {
    if (!this.editor) return;
    this.applying = true;
    const content = tab?.content && Object.keys(tab.content).length ? (tab.content as JSONContent) : '';
    try {
      this.editor.commands.setContent(content, { emitUpdate: false });
    } catch {
      this.editor.commands.setContent('', { emitUpdate: false });
      this.showToast('Parte de esta pestaña no se pudo mostrar.');
    }
    this.applying = false;
    this.ink.setStrokes(tab?.drawing || []);
    this.editor.setEditable(!!tab);
    this.scroller.nativeElement.scrollTop = 0;
    this.updateStatus();
    this.layoutSheet();
    this.cdr.markForCheck();
  }

  private updateStatus(): void {
    const editor = this.editor;
    if (!editor) return;
    const { $head } = editor.state.selection;
    let line = 0;
    editor.state.doc.nodesBetween(0, $head.pos, node => {
      if (node.isTextblock) line++;
      return true;
    });
    this.status = {
      line: Math.max(line, 1),
      col: $head.parentOffset + 1,
      chars: editor.storage['characterCount']?.characters?.() ?? editor.state.doc.textContent.length,
    };
    this.cdr.markForCheck();
  }

  // Formato (barra como la del Bloc de notas)
  chain() {
    return this.editor!.chain().focus();
  }

  isActive(name: string, attrs?: Record<string, unknown>): boolean {
    return !!this.editor?.isActive(name, attrs);
  }

  blockLabel(): string {
    for (const level of [1, 2, 3]) if (this.isActive('heading', { level })) return `H${level}`;
    return 'Texto';
  }

  setBlock(level: 0 | 1 | 2 | 3): void {
    if (level === 0) this.chain().setParagraph().run();
    else this.chain().toggleHeading({ level }).run();
  }

  openLink(): void {
    this.linkValue = this.editor?.getAttributes('link')['href'] || '';
    this.linkOpen = true;
    this.cdr.markForCheck();
    setTimeout(() => this.linkInput?.nativeElement.focus());
  }

  applyLink(): void {
    const href = this.linkValue.trim();
    if (!href) {
      this.chain().extendMarkRange('link').unsetLink().run();
    } else {
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
      this.chain().extendMarkRange('link').setLink({ href: safe }).run();
    }
    this.linkOpen = false;
  }

  insertTable(): void {
    this.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  insertDate(): void {
    const now = new Date();
    this.chain().insertContent(`${now.toLocaleDateString('es-CL')} ${now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`).run();
  }

  undo(): void {
    if (this.mode === 'draw') this.ink.undo();
    else this.chain().undo().run();
  }

  redo(): void {
    if (this.mode === 'draw') this.ink.redo();
    else this.chain().redo().run();
  }

  canUndo(): boolean {
    return this.mode === 'draw' ? !!this.ink?.canUndo : !!this.editor?.can().undo();
  }

  canRedo(): boolean {
    return this.mode === 'draw' ? !!this.ink?.canRedo : !!this.editor?.can().redo();
  }

  /** "Copiar al cuaderno" desde el panel del libro: se pega donde está el cursor. */
  insertFragment(fragment: Record<string, unknown>[]): void {
    this.setMode('write');
    this.chain().insertContent(fragment as JSONContent[]).run();
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────

  setMode(mode: Mode): void {
    if (mode === 'draw' && !this.activeTab) return;
    this.mode = mode;
    this.ink.setEnabled(mode === 'draw');
    this.editor?.setEditable(mode === 'write' && !!this.activeTab);
    this.cdr.markForCheck();
  }

  setInkTool(tool: InkTool): void {
    this.inkTool = tool;
    this.ink.tool = tool;
  }

  setInkColor(color: string): void {
    this.inkColor = color;
    this.ink.color = color;
    if (this.inkTool === 'eraser') this.setInkTool('pen');
  }

  setInkSize(size: number): void {
    this.inkSize = size;
    this.ink.size = size;
  }

  clearDrawing(): void {
    this.ink.clear();
  }

  private onInkChange(strokes: NotebookStroke[]): void {
    if (!this.activeTab) return;
    this.notebook.update(this.activeTab.id, { drawing: strokes });
    this.layoutSheet();
    this.cdr.markForCheck();
  }

  private scheduleLayout(): void {
    if (this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.layoutSheet();
    });
  }

  /** La hoja crece con el texto y con el dibujo (siempre queda espacio para seguir dibujando abajo). */
  private layoutSheet(): void {
    const sheet = this.sheet?.nativeElement;
    if (!sheet || !this.ink) return;
    const width = sheet.clientWidth;
    if (!width) return;
    const viewport = this.scroller.nativeElement.clientHeight;
    const text = this.editorHost.nativeElement.offsetHeight + 48;
    const height = Math.ceil(Math.max(viewport, text, this.ink.bottom(width) + (this.mode === 'draw' ? 320 : 80)));
    sheet.style.minHeight = `${height}px`;
    this.ink.resize(width, Math.max(height, sheet.scrollHeight));
  }

  // ── Pestañas ──────────────────────────────────────────────────────────────

  selectTab(tab: NotebookTabMeta): void {
    if (this.renamingId) return;
    this.notebook.activeId$.next(tab.id);
  }

  newTab(): void {
    this.notebook.createTab();
  }

  startRename(tab: NotebookTabMeta): void {
    this.renamingId = tab.id;
    this.renameValue = tab.title;
    this.cdr.markForCheck();
    setTimeout(() => this.renameInput?.nativeElement.select());
  }

  async commitRename(): Promise<void> {
    const id = this.renamingId;
    const title = this.renameValue.trim().slice(0, 80) || 'Sin título';
    this.renamingId = null;
    if (!id) return;
    try {
      await this.notebook.getTab(id);
      this.notebook.update(id, { title }, true);
    } catch {
      this.showToast('No se pudo renombrar la pestaña.');
    }
    this.cdr.markForCheck();
  }

  cancelRename(): void {
    this.renamingId = null;
  }

  askDelete(tab: NotebookTabMeta, event?: Event): void {
    event?.stopPropagation();
    const loaded = this.notebook.peekTab(tab.id);
    const empty = loaded && !loaded.drawing?.length && !hasText(loaded.content);
    if (empty) {
      this.deleteTab(tab);
    } else {
      this.confirmDelete = tab;
      this.cdr.markForCheck();
    }
  }

  async deleteTab(tab: NotebookTabMeta): Promise<void> {
    this.confirmDelete = null;
    if (tab.id === this.activeId) {
      clearTimeout(this.contentTimer); // lo que faltaba guardar ya no importa: se borra
      this.contentTimer = undefined;
    }
    await this.notebook.deleteTab(tab.id);
    this.ensureOneTab();
  }

  /** Como el Bloc de notas: siempre queda al menos una pestaña "Sin título". */
  private ensureOneTab(): void {
    if (!this.notebook.tabs$.value.length) this.notebook.createTab();
  }

  onTabDragStart(tab: NotebookTabMeta, event: DragEvent): void {
    this.draggedTabId = tab.id;
    event.dataTransfer?.setData('text/plain', tab.title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onTabDrop(target: NotebookTabMeta, event: DragEvent): void {
    event.preventDefault();
    const dragged = this.draggedTabId;
    this.draggedTabId = null;
    if (!dragged || dragged === target.id) return;
    const ids = this.tabs.map(tab => tab.id).filter(id => id !== dragged);
    ids.splice(ids.indexOf(target.id) + (this.tabs.findIndex(t => t.id === dragged) < this.tabs.findIndex(t => t.id === target.id) ? 1 : 0), 0, dragged);
    this.notebook.reorder(ids);
  }

  tabIcon(tab: NotebookTabMeta): string {
    return tab.inventory ? 'menu_book' : 'description';
  }

  get saveState(): NotebookSaveState {
    return (this.activeId && this.saveStates[this.activeId]) || 'saved';
  }

  saveLabel(): string {
    switch (this.saveState) {
      case 'pending':
      case 'saving': return 'Guardando…';
      case 'offline': return 'Sin conexión · guardado en este equipo';
      case 'conflict': return 'Cambios en otro dispositivo';
      case 'error': return 'No se pudo guardar';
      default: return 'Guardado';
    }
  }

  resolveConflict(keep: 'mine' | 'theirs'): void {
    if (this.activeId) this.notebook.resolveConflict(this.activeId, keep);
  }

  // ── Libro ─────────────────────────────────────────────────────────────────

  get showBookPanel(): boolean {
    return !!this.activeTab?.inventory && this.bookPanelOpen;
  }

  goToPassage(target: { chapterId: string; word: number; lastWord?: number }): void {
    if (this.activeTab?.inventory) this.notebook.goToPassage(this.activeTab.inventory, target.chapterId, target.word, target.lastWord);
  }

  onDigest(digest: NotebookDigest): void {
    this.digest = digest;
  }

  // ── Archivo ───────────────────────────────────────────────────────────────

  async downloadPdf(): Promise<void> {
    const tab = this.activeTab;
    if (!tab || !this.editor || this.exporting) return;
    this.flushEditor();
    this.exporting = true;
    this.cdr.markForCheck();
    try {
      let digest = this.digest;
      if (tab.inventory && !digest) {
        digest = await new Promise<NotebookDigest | null>(resolve =>
          this.notebook.digest(tab.inventory!).subscribe({ next: resolve, error: () => resolve(null) }));
      }
      const { downloadNotebookPdf } = await import('../notebook-pdf');
      await downloadNotebookPdf({ title: tab.title, content: this.editor.getJSON() as Record<string, unknown>,
                                  drawing: tab.drawing || [], digest });
    } catch {
      this.showToast('No se pudo generar el PDF.');
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  // ── Ver ───────────────────────────────────────────────────────────────────

  setPrefs(changes: Partial<NotebookPrefs>): void {
    this.notebook.setPrefs(changes);
  }

  zoom(delta: number): void {
    this.setPrefs({ zoom: delta === 0 ? 100 : this.prefs.zoom + delta });
  }

  fontLabel(): string {
    return this.fonts.find(font => font.name === this.prefs.font)?.name || this.prefs.font;
  }

  private applyPrefs(prefs: NotebookPrefs): void {
    const lightPaper = prefs.paper === 'light';
    const switchedPaper = !!this.prefs && this.prefs.paper !== prefs.paper;
    this.prefs = prefs;
    const font = this.fonts.find(f => f.name === prefs.font) || this.fonts[0];
    const sheet = this.sheet?.nativeElement;
    if (sheet) {
      sheet.style.setProperty('--nb-font', font.css);
      sheet.style.setProperty('--nb-size', `${(prefs.size * prefs.zoom) / 100}px`);
    }
    // La tinta por omisión contrasta con la hoja (clara sobre una oscura, oscura sobre el papel).
    const lightBackground = lightPaper || !this.darkTheme();
    if (switchedPaper || this.inkColor === '#f8fafc' || this.inkColor === '#1f2937') {
      this.setInkColorSilently(lightBackground ? '#1f2937' : '#f8fafc');
    }
    if (this.ink) {
      this.ink.lightBackground = lightBackground;
      this.ink.render();
    }
    this.scheduleLayout();
    this.cdr.markForCheck();
  }

  /** La app tiene temas claros y oscuros: se mira el color del texto del tema activo. */
  private darkTheme(): boolean {
    const value = getComputedStyle(document.body).getPropertyValue('--color-text-primary').trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
    const rgb = hex ? [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) : (value.match(/\d+/g) || []).slice(0, 3).map(Number);
    if (rgb.length < 3) return true;
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.5; // texto claro = tema oscuro
  }

  private setInkColorSilently(color: string): void {
    this.inkColor = color;
    if (this.ink) this.ink.color = color;
  }

  // ── Ventana: mover, cambiar tamaño, minimizar ────────────────────────────

  minimize(): void {
    this.flushEditor();
    this.notebook.minimize();
  }

  close(): void {
    this.flushEditor();
    this.notebook.close();
  }

  restore(): void {
    this.notebook.open();
  }

  toggleMaximize(): void {
    if (this.mobile) return;
    this.geometry = { ...this.geometry, maximized: !this.geometry.maximized };
    this.notebook.saveGeometry(this.geometry);
    this.scheduleLayout();
  }

  onTitlebarDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (this.mobile || this.geometry.maximized || event.button !== 0
        || target.closest('button, input, .nb-tab, [role="tab"]')) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, gx: this.geometry.x, gy: this.geometry.y };
    this.track(event, e => clampGeometry({ ...this.geometry, x: start.gx + e.clientX - start.x, y: start.gy + e.clientY - start.y }, this.viewport()));
  }

  onResizeDown(edge: ResizeEdge, event: PointerEvent): void {
    if (this.mobile || this.geometry.maximized || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, w: this.geometry.w, h: this.geometry.h };
    this.track(event, e => clampGeometry({
      ...this.geometry,
      w: edge === 's' ? start.w : start.w + e.clientX - start.x,
      h: edge === 'e' ? start.h : start.h + e.clientY - start.y,
    }, this.viewport()));
  }

  /** Arrastre fuera de Angular (sin detección de cambios en cada movimiento); guarda al soltar. */
  private track(event: PointerEvent, next: (e: PointerEvent) => NotebookGeometry): void {
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const windowEl = element.closest('.nb-window') as HTMLElement;
    this.zone.runOutsideAngular(() => {
      const move = (e: PointerEvent) => {
        this.geometry = next(e);
        windowEl.style.left = `${this.geometry.x}px`;
        windowEl.style.top = `${this.geometry.y}px`;
        windowEl.style.width = `${this.geometry.w}px`;
        windowEl.style.height = `${this.geometry.h}px`;
      };
      const up = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        this.zone.run(() => {
          this.notebook.saveGeometry(this.geometry);
          this.layoutSheet();
          this.cdr.markForCheck();
        });
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', up);
    });
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    this.geometry = clampGeometry(this.geometry, this.viewport());
    this.cdr.markForCheck();
  }

  /** Ctrl+S guarda ya (y evita el "Guardar página" del navegador) con el foco en el cuaderno. */
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.flushEditor();
      this.notebook.flushAll();
    }
  }

  private readonly onMobileChange = (event: MediaQueryListEvent) => {
    this.zone.run(() => {
      this.mobile = event.matches;
      this.scheduleLayout();
      this.cdr.markForCheck();
    });
  };

  private viewport(): Viewport {
    return { w: window.innerWidth, h: window.innerHeight };
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.cdr.markForCheck();
    }, 6000);
    this.cdr.markForCheck();
  }

  trackTab(_: number, tab: NotebookTabMeta): string {
    return tab.id;
  }
}

function hasText(content: Record<string, unknown> | undefined): boolean {
  const walk = (node: any): boolean => !!node && ((typeof node.text === 'string' && node.text.trim().length > 0)
    || node.type === 'table' || node.type === 'horizontalRule' || (Array.isArray(node.content) && node.content.some(walk)));
  return walk(content);
}
