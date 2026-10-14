import type { jsPDF as JsPDF } from 'jspdf';

import { drawStroke } from './notebook-ink';
import { NotebookDigest, NotebookStroke } from './notebook.models';

/**
 * PDF de una pestaña del cuaderno, para estudiar: los apuntes con su formato (títulos, listas,
 * negritas, tablas), el dibujo como imagen y, si es la pestaña de un libro, sus subrayados por
 * capítulo, los post-its con el texto que los rodea y la tabla de palabras guardadas.
 * jsPDF se descarga recién al pedir el PDF.
 */
export interface NotebookPdfInput {
  title: string;
  content: Record<string, unknown>;
  drawing: NotebookStroke[];
  digest?: NotebookDigest | null;
}

interface PmNode {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: { type: string; attrs?: Record<string, any> }[];
  content?: PmNode[];
}

interface Run {
  text: string;
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
  mono: boolean;
  underline: boolean;
  strike: boolean;
  color: [number, number, number];
  highlight: [number, number, number] | null;
}

const MARGIN = 56;
const BODY = 11;
const INK: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [100, 116, 139];
const LINK: [number, number, number] = [37, 99, 235];
const HIGHLIGHT_COLORS: Record<string, [number, number, number]> = {
  gold: [245, 197, 66], blue: [96, 165, 250], green: [74, 222, 128], pink: [244, 114, 182],
};
// Caracteres que las fuentes estándar del PDF (WinAnsi) sí saben dibujar fuera de Latin-1.
const WIN_ANSI_EXTRA = '–—‘’‚“”„•…‰‹›€™ŒœŠšŽžŸƒˆ˜†‡';

export async function downloadNotebookPdf(input: NotebookPdfInput): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pdf = new PdfWriter(doc, (options: any) => autoTable(doc as any, options));

  pdf.header(input.title, input.digest);
  const blocks = (input.content?.['content'] as PmNode[] | undefined) || [];
  if (blocks.some(block => hasText(block))) {
    pdf.section('Apuntes');
    pdf.blocks(blocks, 0);
  }
  if (input.drawing?.length) {
    pdf.section('Dibujo');
    pdf.drawing(input.drawing);
  }
  if (input.digest) pdf.digest(input.digest);
  pdf.footer(input.title);
  doc.save(`cuaderno-${slug(input.title)}.pdf`);
}

class PdfWriter {
  private y = MARGIN;
  private readonly pageW: number;
  private readonly pageH: number;
  private readonly width: number;

  constructor(private readonly doc: JsPDF, private readonly table: (options: any) => void) {
    this.pageW = doc.internal.pageSize.getWidth();
    this.pageH = doc.internal.pageSize.getHeight();
    this.width = this.pageW - MARGIN * 2;
  }

  header(title: string, digest?: NotebookDigest | null): void {
    this.font('bold', 20);
    this.paragraph([this.run(title, { style: 'bold' })], 0, 20, 26);
    const subtitle = digest ? [digest.book_title, digest.book_author].filter(Boolean).join(' · ') : '';
    this.font('italic', 11);
    this.paragraph([this.run(`${subtitle ? subtitle + ' · ' : ''}Cuaderno de Literatus · ${new Date().toLocaleDateString('es-CL')}`,
      { style: 'italic', color: MUTED })], 0, 11, 15);
    this.y += 10;
  }

  section(title: string): void {
    this.ensure(40);
    this.y += 8;
    this.font('bold', 14);
    this.doc.setTextColor(...INK);
    this.doc.text(clean(title), MARGIN, this.y + 12);
    this.y += 18;
    this.doc.setDrawColor(203, 213, 225);
    this.doc.setLineWidth(0.6);
    this.doc.line(MARGIN, this.y, MARGIN + this.width, this.y);
    this.y += 10;
  }

  blocks(nodes: PmNode[], indent: number): void {
    for (const node of nodes) this.block(node, indent);
  }

  private block(node: PmNode, indent: number): void {
    switch (node.type) {
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.['level']) || 1, 1), 3);
        const size = [0, 18, 15, 13][level];
        this.y += 6;
        this.paragraph(this.runs(node, { style: 'bold' }), indent, size, size * 1.35, node.attrs?.['textAlign']);
        this.y += 2;
        break;
      }
      case 'paragraph':
        this.paragraph(this.runs(node), indent, BODY, BODY * 1.45, node.attrs?.['textAlign']);
        this.y += 4;
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        this.list(node, indent);
        this.y += 2;
        break;
      case 'blockquote': {
        const top = this.y;
        this.blocks(node.content || [], indent + 14);
        this.doc.setDrawColor(148, 163, 184);
        this.doc.setLineWidth(2);
        this.doc.line(MARGIN + indent + 4, this.y < top ? MARGIN : top, MARGIN + indent + 4, this.y - 4); // si cambió de página, desde arriba
        break;
      }
      case 'codeBlock':
        for (const line of plain(node).split('\n')) {
          this.paragraph([this.run(line || ' ', { mono: true })], indent + 8, 10, 13);
        }
        this.y += 4;
        break;
      case 'horizontalRule':
        this.ensure(14);
        this.doc.setDrawColor(203, 213, 225);
        this.doc.setLineWidth(0.8);
        this.doc.line(MARGIN + indent, this.y + 6, MARGIN + this.width, this.y + 6);
        this.y += 14;
        break;
      case 'table':
        this.tableBlock(node, indent);
        break;
      default:
        if (node.content) this.blocks(node.content, indent);
    }
  }

  private list(node: PmNode, indent: number): void {
    let number = Number(node.attrs?.['start']) || 1;
    for (const item of node.content || []) {
      const marker = node.type === 'orderedList' ? `${number++}.`
        : node.type === 'taskList' ? (item.attrs?.['checked'] ? '[x]' : '[ ]') : '•';
      this.ensure(BODY * 1.45);
      this.font('normal', BODY);
      this.doc.setTextColor(...INK);
      this.doc.text(marker, MARGIN + indent + 4, this.y + BODY);
      const [first, ...rest] = item.content || [];
      if (first?.type === 'paragraph') {
        this.paragraph(this.runs(first, item.attrs?.['checked'] ? { strike: true, color: MUTED } : {}),
          indent + 22, BODY, BODY * 1.45);
        this.blocks(rest, indent + 22);
      } else {
        this.blocks(item.content || [], indent + 22);
      }
    }
  }

  private tableBlock(node: PmNode, indent: number): void {
    const rows = (node.content || []).map(row => (row.content || []).map(cell => plain(cell)));
    if (!rows.length) return;
    const headerRow = (node.content?.[0]?.content || []).every(cell => cell.type === 'tableHeader');
    this.ensure(40);
    this.table({
      startY: this.y,
      margin: { left: MARGIN + indent, right: MARGIN },
      head: headerRow ? [rows[0].map(clean)] : undefined,
      body: (headerRow ? rows.slice(1) : rows).map(row => row.map(clean)),
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: [226, 232, 240], textColor: INK },
      theme: 'grid',
    });
    this.y = ((this.doc as any).lastAutoTable?.finalY || this.y) + 10;
  }

  drawing(strokes: NotebookStroke[]): void {
    const bottom = Math.max(...strokes.flatMap(stroke => stroke.p.map(p => p[1] + stroke.w)));
    const pixels = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = Math.max(1, Math.ceil((bottom + 0.02) * pixels));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // En la hoja oscura se dibuja con colores claros: sobre papel blanco no se verían.
    for (const stroke of strokes) drawStroke(ctx, stroke, pixels, luminance(stroke.c) > 0.82 ? '#1f2937' : stroke.c);
    const scale = this.width / pixels;
    let offset = 0;
    while (offset < canvas.height) {
      this.ensure(60);
      const room = Math.floor((this.pageH - MARGIN - this.y) / scale);
      const slice = Math.min(room, canvas.height - offset);
      const part = document.createElement('canvas');
      part.width = pixels;
      part.height = slice;
      part.getContext('2d')!.drawImage(canvas, 0, offset, pixels, slice, 0, 0, pixels, slice);
      this.doc.addImage(part.toDataURL('image/png'), 'PNG', MARGIN, this.y, this.width, slice * scale);
      this.y += slice * scale + 8;
      offset += slice;
      if (offset < canvas.height) this.newPage();
    }
  }

  digest(digest: NotebookDigest): void {
    if (digest.highlights.length) {
      this.section(`Subrayados (${digest.highlights.length})`);
      let chapter = '';
      for (const h of digest.highlights) {
        if (h.chapter_title !== chapter) {
          chapter = h.chapter_title;
          this.y += 4;
          this.paragraph([this.run(chapter, { style: 'bold', color: MUTED })], 0, 10, 14);
        }
        const top = this.y;
        this.paragraph([this.run(`“${h.text}”`)], 12, BODY, BODY * 1.45);
        this.doc.setDrawColor(...(HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS['gold']));
        this.doc.setLineWidth(3);
        this.doc.line(MARGIN + 3, (this.y < top ? MARGIN : top) + 2, MARGIN + 3, this.y - 2);
        this.y += 6;
      }
    }
    if (digest.post_its.length) {
      this.section(`Notas en el libro (${digest.post_its.length})`);
      for (const note of digest.post_its) {
        this.paragraph([this.run(note.text, { style: 'bold' })], 0, BODY, BODY * 1.45);
        this.paragraph([this.run(`${note.chapter_title} · ${note.context}`, { style: 'italic', color: MUTED })], 0, 10, 14);
        this.y += 8;
      }
    }
    if (digest.words.length) {
      this.section(`Palabras guardadas (${digest.words.length})`);
      this.table({
        startY: this.y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Palabra', 'Definición', 'Contexto', '']],
        body: digest.words.map(w => [clean(w.word), clean(w.definition), clean(w.context), w.is_learned ? 'Aprendida' : '']),
        styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 5, textColor: INK, valign: 'top' },
        headStyles: { fillColor: [226, 232, 240], textColor: INK },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 3: { cellWidth: 58, textColor: MUTED } },
        theme: 'grid',
      });
      this.y = ((this.doc as any).lastAutoTable?.finalY || this.y) + 10;
    }
  }

  footer(title: string): void {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      this.doc.setPage(page);
      this.font('normal', 8.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(clean(`Literatus · ${title}`), MARGIN, this.pageH - 28);
      this.doc.text(`${page} / ${pages}`, this.pageW - MARGIN, this.pageH - 28, { align: 'right' });
    }
  }

  /** Párrafo con estilos mezclados: corta en líneas palabra por palabra y respeta la alineación. */
  private paragraph(runs: Run[], indent: number, size: number, lineHeight: number, align?: string): void {
    const maxWidth = this.width - indent;
    const lines: { run: Run; text: string; width: number }[][] = [[]];
    let lineWidth = 0;
    for (const run of runs) {
      for (const piece of run.text.split(/(\n|\s+)/)) {
        if (!piece) continue;
        if (piece === '\n') {
          lines.push([]);
          lineWidth = 0;
          continue;
        }
        this.font(run.style, size, run.mono);
        const width = this.doc.getTextWidth(piece);
        const space = /^\s+$/.test(piece);
        if (!space && lineWidth + width > maxWidth && lineWidth > 0) {
          lines.push([]);
          lineWidth = 0;
        }
        if (space && lineWidth === 0) continue;
        lines[lines.length - 1].push({ run, text: piece, width });
        lineWidth += width;
      }
    }
    for (const line of lines) {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
      this.ensure(lineHeight);
      const total = line.reduce((sum, part) => sum + part.width, 0);
      let x = MARGIN + indent + (align === 'center' ? (maxWidth - total) / 2 : align === 'right' ? maxWidth - total : 0);
      const baseline = this.y + size;
      for (const part of line) {
        const { run } = part;
        if (run.highlight) {
          this.doc.setFillColor(...run.highlight);
          this.doc.rect(x, this.y + size * 0.1, part.width, size * 1.15, 'F');
        }
        this.font(run.style, size, run.mono);
        this.doc.setTextColor(...run.color);
        this.doc.text(part.text, x, baseline);
        if (run.underline || run.strike) {
          this.doc.setDrawColor(...run.color);
          this.doc.setLineWidth(0.6);
          const lineY = run.underline ? baseline + 1.5 : baseline - size * 0.3;
          this.doc.line(x, lineY, x + part.width, lineY);
        }
        x += part.width;
      }
      this.y += lineHeight;
    }
  }

  private runs(node: PmNode, base: Partial<Run> = {}): Run[] {
    const runs: Run[] = [];
    for (const child of node.content || []) {
      if (child.type === 'hardBreak') {
        runs.push(this.run('\n', base));
        continue;
      }
      if (child.type !== 'text' || !child.text) {
        if (child.content) runs.push(...this.runs(child, base));
        continue;
      }
      const marks = new Map((child.marks || []).map(mark => [mark.type, mark.attrs || {}]));
      const bold = marks.has('bold') || base.style === 'bold' || base.style === 'bolditalic';
      const italic = marks.has('italic') || base.style === 'italic' || base.style === 'bolditalic';
      const textColor = parseColor(marks.get('textStyle')?.['color']);
      const highlight = marks.has('highlight') ? mix(parseColor(marks.get('highlight')?.['color']) || [253, 224, 71], 0.45) : null;
      runs.push(this.run(child.text, {
        ...base,
        style: bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal',
        mono: marks.has('code') || !!base.mono,
        underline: marks.has('underline') || marks.has('link'),
        strike: marks.has('strike') || !!base.strike,
        color: marks.has('link') ? LINK : textColor && luminance(toHex(textColor)) < 0.82 ? textColor : base.color || INK,
        highlight,
      }));
    }
    return runs;
  }

  private run(text: string, options: Partial<Run> = {}): Run {
    return {
      text: text === '\n' ? text : clean(text), style: options.style || 'normal', mono: !!options.mono,
      underline: !!options.underline, strike: !!options.strike, color: options.color || INK,
      highlight: options.highlight || null,
    };
  }

  private font(style: Run['style'], size: number, mono = false): void {
    this.doc.setFont(mono ? 'courier' : 'helvetica', style);
    this.doc.setFontSize(size);
  }

  private ensure(height: number): void {
    if (this.y + height > this.pageH - MARGIN) this.newPage();
  }

  private newPage(): void {
    this.doc.addPage();
    this.y = MARGIN;
  }
}

function hasText(node: PmNode): boolean {
  return !!node.text?.trim() || node.type === 'table' || node.type === 'horizontalRule'
    || (node.content || []).some(hasText);
}

function plain(node: PmNode): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content || []).map(plain).join(node.type === 'tableCell' || node.type === 'tableHeader' ? '\n' : '');
}

/** Deja solo lo que las fuentes estándar del PDF pueden dibujar (emojis y símbolos raros fuera). */
function clean(text: string): string {
  return Array.from(String(text ?? '')).filter(ch => ch === '\n' || ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(ch)).join('');
}

function slug(text: string): string {
  return (text || 'cuaderno').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cuaderno';
}

function parseColor(value: unknown): [number, number, number] | null {
  const hex = typeof value === 'string' ? value.trim() : '';
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(hex);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function toHex(color: [number, number, number]): string {
  return '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');
}

function mix(color: [number, number, number], amount: number): [number, number, number] {
  return color.map(c => Math.round(255 - (255 - c) * amount)) as [number, number, number];
}

function luminance(hex: string): number {
  const color = parseColor(hex) || [0, 0, 0];
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}
