import { Injectable } from '@angular/core';

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

export interface DictionaryResult {
  word: string;
  phonetic?: string;
  meanings: DictionaryMeaning[];
  error?: string;
}

/**
 * Definiciones para el menú del lector: Wikcionario en español y, si la palabra no está (nombres
 * propios, mitología, conceptos), el resumen de Wikipedia. Lo ya buscado queda en memoria
 * mientras dura la sesión.
 */
@Injectable({ providedIn: 'root' })
export class ReaderDictionaryService {
  private readonly cache = new Map<string, DictionaryResult>();

  /** La palabra limpia (sin signos en los bordes, en minúsculas) o '' si no queda nada. */
  clean(raw: string): string {
    return raw.trim().split(/\s+/)[0].replace(/^[^\wáéíóúÁÉÍÓÚñÑ]+|[^\wáéíóúÁÉÍÓÚñÑ]+$/g, '').toLowerCase();
  }

  async define(rawText: string): Promise<DictionaryResult> {
    const rawWord = rawText.trim().split(/\s+/)[0];
    const word = this.clean(rawText);
    if (!word) return { word: rawWord, meanings: [], error: 'Por favor, selecciona una palabra válida.' };
    const cached = this.cache.get(word);
    if (cached) return cached;

    try {
      const url = `https://es.wiktionary.org/w/api.php?action=query&format=json&prop=extracts&explaintext=true&origin=*&titles=${encodeURIComponent(word)}`;
      const json = await (await fetch(url)).json();
      const pages = json.query?.pages || {};
      const page = pages[Object.keys(pages)[0]];
      if (page && page.missing === undefined && page.extract) {
        const parsed = parseWiktionaryExtract(word, page.extract);
        if (parsed.meanings.length > 0) {
          this.cache.set(word, parsed);
          return parsed;
        }
      }
    } catch { /* sin red o respuesta rara: se intenta con Wikipedia */ }

    try {
      const res = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error('No encontrado');
      const wiki = await res.json();
      if (wiki.extract) {
        const result: DictionaryResult = {
          word: wiki.title || rawWord,
          meanings: [{ partOfSpeech: wiki.description || 'Definición enciclopédica', definitions: [{ definition: wiki.extract }] }],
        };
        this.cache.set(word, result);
        return result;
      }
    } catch { /* tampoco está en Wikipedia */ }
    return { word: rawWord, meanings: [], error: `No se encontró una definición exacta para "${rawWord}".` };
  }
}

/** Saca del texto plano de Wikcionario las acepciones en español (sustantivo, verbo…), hasta 3 por tipo. */
function parseWiktionaryExtract(word: string, text: string): DictionaryResult {
  let section = text;
  const espIdx = text.indexOf('== Español ==');
  if (espIdx !== -1) {
    const after = text.substring(espIdx + '== Español =='.length);
    const nextLang = after.search(/\n== [^=]+ ==/);
    section = nextLang !== -1 ? after.substring(0, nextLang) : after;
  }

  const meanings: DictionaryMeaning[] = [];
  const headerRegex = /(?:={3,4})\s*([^=\n]+)\s*(?:={3,4})/g;
  const headers: { title: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(section)) !== null) {
    headers.push({ title: match[1].trim(), index: match.index + match[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const current = headers[i];
    const next = headers[i + 1];
    const block = section.substring(current.index, next ? next.index - next.title.length - 8 : undefined);
    if (!/(sustantivo|adjetivo|verbo|adverbio|pronombre|interjección)/i.test(current.title)) continue;

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const defs: string[] = [];
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      if (/^(sinónimos|antónimos|hipónimos|hiperónimos|derivados|uso|ejemplo|relacionados|análisis|cognado)/i.test(line)) continue;
      if (/^a este lema le falta/i.test(line)) continue;
      if (/^(\d+)(\s+[A-Za-zÀ-ÿ]+)?$/.test(line)) {
        if (j + 1 < lines.length && !/^(\d+)/.test(lines[j + 1])) {
          defs.push(lines[j + 1]);
          j++;
        }
      } else if (/^\d+\s+(.*)/.test(line)) {
        const m = line.match(/^\d+\s+(.*)/);
        if (m && m[1].length > 8) defs.push(m[1]);
      }
    }
    if (defs.length === 0) {
      for (const line of lines) {
        if (line.length > 15 && !/^(etimología|véase|traducciones|enlaces|referencias)/i.test(line)) {
          defs.push(line);
          if (defs.length >= 2) break;
        }
      }
    }
    if (defs.length > 0) meanings.push({ partOfSpeech: current.title, definitions: defs.slice(0, 3).map(d => ({ definition: d })) });
  }

  // Sin secciones formales pero con texto en español
  if (meanings.length === 0 && section.trim().length > 20) {
    const fallback = section.split('\n').map(l => l.trim())
      .filter(l => l.length > 20 && !l.startsWith('=') && !/^(etimología|traducciones|referencias)/i.test(l));
    if (fallback.length > 0) meanings.push({ partOfSpeech: 'Definición', definitions: fallback.slice(0, 2).map(d => ({ definition: d })) });
  }
  return { word, meanings };
}
