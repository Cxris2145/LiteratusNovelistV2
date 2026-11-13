/**
 * Utilidades para formatear precios y montos en formato de pesos chilenos (CLP).
 * En Chile, el peso no utiliza decimales para montos estándar de compras y transacciones ($1.990 CLP).
 * El separador de miles es el punto (.) y el separador decimal es la coma (,).
 */

export interface ClpFormatOptions {
  /** Si incluye el código 'CLP' al final (por defecto: true). Ej: '$1.990 CLP' vs '$1.990' */
  showCode?: boolean;
  /** Si incluye el símbolo '$' al inicio (por defecto: true). */
  showSymbol?: boolean;
  /** Cantidad mínima de decimales (por defecto: 0 para CLP entero). */
  minimumFractionDigits?: number;
  /** Cantidad máxima de decimales (por defecto: 0 para CLP entero). */
  maximumFractionDigits?: number;
}

/**
 * Formatea un número o monto como precio chileno (CLP).
 *
 * Ejemplos:
 *   formatClp(1990) -> "$1.990 CLP"
 *   formatClp(1990, false) -> "$1.990"
 *   formatClp(3.98, { maximumFractionDigits: 2 }) -> "$3,98 CLP"
 */
export function formatClp(
  value: number | string | null | undefined,
  options?: ClpFormatOptions | boolean | number
): string {
  if (value === null || value === undefined || value === '') return '$0 CLP';

  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(num)) return '$0 CLP';

  let opts: ClpFormatOptions = {};
  if (typeof options === 'boolean') {
    opts = { showCode: options };
  } else if (typeof options === 'number') {
    opts = { showCode: true, minimumFractionDigits: options, maximumFractionDigits: options };
  } else if (options) {
    opts = options;
  }

  const showCode = opts.showCode !== false;
  const showSymbol = opts.showSymbol !== false;

  const hasDecimals = !Number.isInteger(num) && (opts.maximumFractionDigits ?? 0) > 0;
  const minDigits = opts.minimumFractionDigits ?? (hasDecimals ? 2 : 0);
  const maxDigits = opts.maximumFractionDigits ?? (hasDecimals ? 2 : 0);

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formattedNum = absNum.toLocaleString('es-CL', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });

  const sign = isNegative ? '-' : '';
  const symbol = showSymbol ? '$' : '';
  const code = showCode ? ' CLP' : '';

  return `${sign}${symbol}${formattedNum}${code}`;
}

/**
 * Formatea un número según las convenciones numéricas de Chile (separador de miles con punto).
 * Ejemplo: formatChileanNumber(1500000) -> "1.500.000"
 */
export function formatChileanNumber(
  value: number | string | null | undefined,
  fractionDigits: number = 0
): string {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('es-CL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

