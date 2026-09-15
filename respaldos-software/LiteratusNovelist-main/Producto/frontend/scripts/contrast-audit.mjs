import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cases = [
  { component: 'Público', element: 'Bordes de tarjetas', before: ['#DED5D5', '#FAF6F0'], after: ['#8F8289', '#FAF6F0'], required: 3, issue: 'El borde no delimitaba la superficie.', fix: 'Token --color-border.' },
  { component: 'Panel', element: 'Navegación lateral', before: ['#64748B', '#020617'], after: ['#C9BEB0', '#0A1914'], required: 4.5, issue: 'Texto normal bajo AA.', fix: 'Token --color-text-secondary.' },
  { component: 'Panel', element: 'Etiqueta de sección', before: ['rgba(74,85,104,.8)', '#020617'], after: ['#C9BEB0', '#0A1914'], required: 4.5, issue: 'Etiqueta casi invisible.', fix: 'Texto secundario opaco.' },
  { component: 'Panel', element: 'Placeholder', before: ['#334155', '#0F172A'], after: ['#A99B8C', '#0F211A'], required: 4.5, issue: 'Ayuda de campo ilegible.', fix: 'Token --color-text-disabled.' },
  { component: 'Panel', element: 'Versión del sistema', before: ['#1E293B', '#020617'], after: ['#A99B8C', '#0A1914'], required: 4.5, issue: 'Texto informativo de bajo contraste.', fix: 'Token --color-text-disabled.' },
  { component: 'Lector oscuro', element: 'Placeholder', before: ['rgba(255,255,255,.35)', '#1A1A2E'], after: ['#A9B3C1', '#1A1A2E'], required: 4.5, issue: 'Instrucción de entrada tenue.', fix: 'Texto opaco accesible.' },
  { component: 'Lector claro', element: 'Texto secundario', before: ['rgba(30,41,59,.6)', '#F8FAFC'], after: ['#4E5968', '#F8FAFC'], required: 4.5, issue: 'Metadatos bajo AA.', fix: 'Gris opaco accesible.' },
  { component: 'Lector sepia', element: 'Texto secundario', before: ['rgba(74,59,50,.6)', '#F4ECD8'], after: ['#66513F', '#F4ECD8'], required: 4.5, issue: 'Metadatos bajo AA.', fix: 'Tinta sepia reforzada.' },
  { component: 'Lector gris', element: 'Placeholder', before: ['rgba(43,46,51,.5)', '#D9DADD'], after: ['#595E65', '#D9DADD'], required: 4.5, issue: 'Placeholder bajo AA.', fix: 'Gris de apoyo opaco.' },
  { component: 'Lector nocturno', element: 'Placeholder OLED', before: ['rgba(232,232,232,.3)', '#0A0A0A'], after: ['#A3A3A3', '#0A0A0A'], required: 4.5, issue: 'Placeholder bajo AA.', fix: 'Gris OLED accesible.' },
  { component: 'Marca', element: 'Tinta sobre pergamino', before: ['#5C5259', '#EDDBC4'], after: ['#5C5259', '#EDDBC4'], required: 4.5, issue: 'Par de marca válido.', fix: 'Reservado para texto normal.' },
  { component: 'Marca', element: 'Tinta sobre salvia', before: ['#FFFFFF', '#A3C9A7'], after: ['#40383E', '#A3C9A7'], required: 4.5, issue: 'Blanco sobre salvia falla.', fix: 'Tinta #40383E.' },
  { component: 'Marca', element: 'Tinta sobre ámbar', before: ['#FFFFFF', '#FFB353'], after: ['#40383E', '#FFB353'], required: 4.5, issue: 'Blanco sobre ámbar falla.', fix: 'Tinta #40383E.' },
  { component: 'Marca', element: 'Tinta sobre coral', before: ['#FFFFFF', '#FF6E4A'], after: ['#2A2025', '#FF6E4A'], required: 4.5, issue: 'Blanco sobre coral falla.', fix: 'Tinta #2A2025.' },
  { component: 'Light Gallery', element: 'Acción primaria', before: ['#FFFFFF', '#5C5259'], after: ['#FFFCF8', '#5C5259'], required: 4.5, issue: 'Par ya válido; se normaliza a superficie.', fix: 'Token --color-on-primary.' },
  { component: 'Classic Dark', element: 'Acción primaria', before: ['#1C1607', '#D4AF37'], after: ['#1C1607', '#D4AF37'], required: 4.5, issue: 'Par válido.', fix: 'Tokens primary/on-primary.' },
  { component: 'Cyber Neon', element: 'Acción primaria', before: ['#0B0F1A', '#93C5FD'], after: ['#0B0F1A', '#93C5FD'], required: 4.5, issue: 'Par válido.', fix: 'Tokens primary/on-primary.' },
  { component: 'Estado claro', element: 'Éxito', before: ['#2F6B3E', '#EAF3EA'], after: ['#2F6B3E', '#EAF3EA'], required: 4.5, issue: 'Par semántico.', fix: 'Tokens success.' },
  { component: 'Estado claro', element: 'Advertencia', before: ['#754915', '#FFF1D6'], after: ['#754915', '#FFF1D6'], required: 4.5, issue: 'Par semántico.', fix: 'Tokens warning.' },
  { component: 'Estado claro', element: 'Información', before: ['#275D74', '#E6F2F6'], after: ['#275D74', '#E6F2F6'], required: 4.5, issue: 'Par semántico.', fix: 'Tokens info.' },
  { component: 'Estado claro', element: 'Error', before: ['#96352E', '#FBE9E6'], after: ['#96352E', '#FBE9E6'], required: 4.5, issue: 'Par semántico.', fix: 'Tokens error.' }
];

function parseColor(value) {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
    return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16)).concat(1);
  }
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) throw new Error(`Color no compatible: ${value}`);
  const parts = match[1].split(',').map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function composite(foreground, background) {
  const [r, g, b, a] = parseColor(foreground);
  const [br, bg, bb] = parseColor(background);
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}

function luminance(rgb) {
  const channels = rgb.map(value => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const l1 = luminance(composite(foreground, background));
  const l2 = luminance(composite(background, '#FFFFFF'));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const rows = cases.map(item => ({
  ...item,
  beforeRatio: contrast(...item.before),
  afterRatio: contrast(...item.after)
}));

const header = '| Componente | Elemento | Antes (texto/fondo) | Contraste anterior | Requisito | Problema | Corrección | Contraste final |';
const separator = '|---|---|---|---:|---:|---|---|---:|';
const body = rows.map(row => `| ${row.component} | ${row.element} | \`${row.before[0]}\` / \`${row.before[1]}\` | ${row.beforeRatio.toFixed(2)}:1 | ${row.required.toFixed(1)}:1 | ${row.issue} | ${row.fix} \`${row.after[0]}\` / \`${row.after[1]}\` | ${row.afterRatio.toFixed(2)}:1 |`).join('\n');
const report = `${header}\n${separator}\n${body}\n`;

console.log(report);

if (process.argv.includes('--write')) {
  const here = dirname(fileURLToPath(import.meta.url));
  const output = resolve(here, '../docs/audits/visual-accessibility/contrast-table.md');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `# Tabla de contraste WCAG 2.2 AA\n\nGenerada por \`npm run audit:contrast\`. Los colores con alfa se componen sobre el fondo indicado antes de calcular luminancia relativa.\n\n${report}`, 'utf8');
  console.log(`Informe escrito en ${output}`);
}

const failures = rows.filter(row => row.afterRatio + 0.005 < row.required);
if (failures.length) {
  console.error(`Fallaron ${failures.length} pares finales: ${failures.map(row => `${row.component}/${row.element}`).join(', ')}`);
  process.exitCode = 1;
}
