import { NotebookStroke } from './notebook.models';

export type InkTool = 'pen' | 'marker' | 'eraser';

const MARKER_OPACITY = 0.35;
const MIN_STEP_PX = 0.8;
const ROUND = 10000;

/**
 * Capa de dibujo a mano alzada sobre la hoja del cuaderno (mouse, dedo o lápiz con presión).
 *
 * Los trazos se guardan en proporción al ancho de la hoja, así el dibujo acompaña a la ventana
 * cuando cambia de tamaño. El borrador quita trazos enteros (como en OneNote), lo que mantiene
 * el dibujo liviano y fácil de deshacer.
 */
export class InkLayer {
  tool: InkTool = 'pen';
  color = '#f8fafc';
  /** Grosor en píxeles de pantalla. */
  size = 3;
  /** Hoja clara (papel o tema claro): la tinta casi blanca se muestra oscura, y al revés. */
  lightBackground = false;

  private strokes: NotebookStroke[] = [];
  private undoStack: NotebookStroke[][] = [];
  private redoStack: NotebookStroke[][] = [];
  private current: NotebookStroke | null = null;
  private erasing: NotebookStroke[] | null = null;
  private enabled = false;
  private width = 1;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onChange: (strokes: NotebookStroke[]) => void) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    this.canvas.style.touchAction = enabled ? 'none' : 'auto';
  }

  setStrokes(strokes: NotebookStroke[]): void {
    this.strokes = Array.isArray(strokes) ? strokes : [];
    this.undoStack = [];
    this.redoStack = [];
    this.render();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get isEmpty(): boolean {
    return this.strokes.length === 0;
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.strokes);
    this.commit(previous, false);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.strokes);
    this.commit(next, false);
  }

  clear(): void {
    if (!this.strokes.length) return;
    this.commit([], true);
  }

  /** Lo más bajo que llega el dibujo, en píxeles (para que la hoja crezca hasta ahí). */
  bottom(width: number): number {
    let max = 0;
    for (const stroke of this.strokes) {
      for (const point of stroke.p) max = Math.max(max, point[1]);
    }
    return max * width;
  }

  /** Ajusta el lienzo a la hoja (al abrir, al cambiar el tamaño de la ventana o crecer el texto). */
  resize(width: number, height: number): void {
    const ratio = window.devicePixelRatio || 1;
    this.width = Math.max(1, width);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.render();
  }

  render(): void {
    const ratio = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / ratio, this.canvas.height / ratio);
    for (const stroke of this.strokes) drawStroke(this.ctx, stroke, this.width, this.visible(stroke.c));
    if (this.current) drawStroke(this.ctx, this.current, this.width, this.visible(this.current.c));
  }

  /** Un trazo blanco hecho en la hoja oscura seguiría invisible en el papel claro (y uno negro, al revés). */
  private visible(color: string): string {
    const lum = luminance(color);
    if (this.lightBackground && lum > 0.82) return '#1f2937';
    if (!this.lightBackground && lum < 0.18) return '#f8fafc';
    return color;
  }

  private commit(strokes: NotebookStroke[], recordUndo: boolean): void {
    if (recordUndo) {
      this.undoStack.push(this.strokes);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    this.strokes = strokes;
    this.render();
    this.onChange(this.strokes);
  }

  private point(event: PointerEvent): number[] {
    const rect = this.canvas.getBoundingClientRect();
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    // Con el puntero capturado se puede salir de la hoja: el trazo se queda en el borde.
    const x = Math.min(Math.max((event.clientX - rect.left) / this.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / this.width, 0), 999);
    return [Math.round(x * ROUND) / ROUND, Math.round(y * ROUND) / ROUND, Math.round(pressure * 100) / 100];
  }

  private readonly down = (event: PointerEvent) => {
    if (!this.enabled || event.button > 0) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    if (this.tool === 'eraser') {
      this.erasing = this.strokes;
      this.eraseAt(this.point(event));
      return;
    }
    const marker = this.tool === 'marker';
    this.current = {
      c: this.color,
      w: Math.round(((marker ? this.size * 4 : this.size) / this.width) * ROUND) / ROUND,
      ...(marker ? { o: MARKER_OPACITY } : {}),
      p: [this.point(event)],
    };
    this.render();
  };

  private readonly move = (event: PointerEvent) => {
    if (this.erasing) {
      this.eraseAt(this.point(event));
      return;
    }
    if (!this.current) return;
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const e of events.length ? events : [event]) {
      const next = this.point(e);
      const last = this.current.p[this.current.p.length - 1];
      if (Math.hypot(next[0] - last[0], next[1] - last[1]) * this.width >= MIN_STEP_PX) this.current.p.push(next);
    }
    this.render();
  };

  private readonly up = () => {
    if (this.erasing) {
      const before = this.erasing;
      this.erasing = null;
      if (before !== this.strokes) {
        this.undoStack.push(before);
        this.redoStack = [];
        this.onChange(this.strokes);
      }
      return;
    }
    const stroke = this.current;
    this.current = null;
    if (!stroke) return;
    this.commit([...this.strokes, stroke], true);
  };

  /** Borra los trazos que toca el borrador (radio de unos pocos píxeles). */
  private eraseAt(point: number[]): void {
    const radius = Math.max(this.size * 2, 8) / this.width;
    const kept = this.strokes.filter(stroke => !stroke.p.some(p =>
      Math.hypot(p[0] - point[0], p[1] - point[1]) <= radius + stroke.w / 2));
    if (kept.length !== this.strokes.length) {
      this.strokes = kept;
      this.render();
    }
  }
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.5;
  return (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
}

/** Pinta un trazo con curvas suaves; el grosor sigue la presión del lápiz. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: NotebookStroke, width: number,
                           color = stroke.c): void {
  const points = stroke.p;
  if (!points.length) return;
  ctx.save();
  ctx.globalAlpha = stroke.o ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const base = Math.max(stroke.w * width, 0.5);
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0] * width, points[0][1] * width, base / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const pressureVaries = stroke.o === undefined && points.some(p => p[2] !== undefined && p[2] !== 0.5);
  if (!pressureVaries) {
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(points[0][0] * width, points[0][1] * width);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = ((points[i][0] + points[i + 1][0]) / 2) * width;
      const midY = ((points[i][1] + points[i + 1][1]) / 2) * width;
      ctx.quadraticCurveTo(points[i][0] * width, points[i][1] * width, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0] * width, last[1] * width);
    ctx.stroke();
  } else {
    // Con presión cada tramo lleva su grosor (un trazo de grosor fijo no lo permite).
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      ctx.lineWidth = base * (0.4 + ((a[2] ?? 0.5) + (b[2] ?? 0.5)) * 0.6);
      ctx.beginPath();
      ctx.moveTo(a[0] * width, a[1] * width);
      ctx.lineTo(b[0] * width, b[1] * width);
      ctx.stroke();
    }
  }
  ctx.restore();
}
