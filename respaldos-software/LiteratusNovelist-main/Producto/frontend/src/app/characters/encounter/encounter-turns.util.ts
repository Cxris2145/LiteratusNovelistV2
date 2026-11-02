/** Quién responde y en qué orden en un encuentro de personajes (funciones puras, sin Angular). */

export interface Speaker { id: string; name: string; }

/** Un turno: el personaje que habla y el texto del lector que lo acompaña ('' si siguen solos). */
export interface EncounterStep { speakerId: string; message: string; }

/** A quién le habla el lector: a los dos o a uno (su id). */
export type EncounterTarget = 'both' | string;

/** Pausa entre turnos automáticos, para alcanzar a leer antes de que hable el otro. */
export const AUTO_STEP_PAUSE_MS = 600;
/** Mensajes que intercambian solos con «Que sigan conversando». */
export const AUTO_RUN_STEPS = 4;

// Palabras de un nombre que no bastan para decir que el lector nombró al personaje.
const NAME_FILLERS = new Set(['del', 'las', 'los', 'the', 'don', 'dona', 'sir', 'san', 'senor', 'senora', 'van', 'von']);

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** ¿El texto nombra al personaje? Basta una palabra de su nombre (Quijote, Holmes, Watson…). */
export function mentions(text: string, name: string): boolean {
  const words = new Set(fold(text).split(' '));
  return fold(name).split(' ').some(word => word.length >= 3 && !NAME_FILLERS.has(word) && words.has(word));
}

function other(pair: readonly [Speaker, Speaker], speaker: Speaker): Speaker {
  return speaker.id === pair[0].id ? pair[1] : pair[0];
}

/** Empieza quien no habló último (si nadie ha hablado, el primero). */
function nextAfter(pair: readonly [Speaker, Speaker], lastSpeakerId: string | null): Speaker {
  return lastSpeakerId === pair[0].id ? pair[1] : pair[0];
}

/**
 * Los turnos que siguen a un mensaje del lector. A uno solo: responde ese. A los dos: empieza el
 * que nombró (si nombró a uno solo) o el que no habló último, y luego el otro reacciona.
 */
export function planRound(pair: readonly [Speaker, Speaker], target: EncounterTarget, lastSpeakerId: string | null,
                          text: string): EncounterStep[] {
  const chosen = pair.find(p => p.id === target);
  if (chosen) return [{ speakerId: chosen.id, message: text }];
  const named = pair.filter(p => mentions(text, p.name));
  const first = named.length === 1 ? named[0] : nextAfter(pair, lastSpeakerId);
  return [{ speakerId: first.id, message: text }, { speakerId: other(pair, first).id, message: '' }];
}

/** «Que sigan conversando»: hablan por turnos, sin texto del lector. */
export function planAutoRun(pair: readonly [Speaker, Speaker], lastSpeakerId: string | null,
                            count = AUTO_RUN_STEPS): EncounterStep[] {
  const steps: EncounterStep[] = [];
  let speaker = nextAfter(pair, lastSpeakerId);
  for (let i = 0; i < count; i++) {
    steps.push({ speakerId: speaker.id, message: '' });
    speaker = other(pair, speaker);
  }
  return steps;
}

/** Primera palabra del nombre, para botones cortos («Hablarle a: Sherlock»). */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words.find(word => !NAME_FILLERS.has(fold(word))) || words[0] || name;
  return first.replace(/[,.;:]+$/, '');
}

/** Ideas para empezar; cambian un poco si los dos vienen de la misma historia. */
export function openingIdeas(sameBook: boolean): string[] {
  return sameBook
    ? ['¿Qué piensan de verdad el uno del otro?', 'Recuerden juntos cómo se conocieron.', 'Debatan: ¿quién tomó la peor decisión?', '¿Qué le aconsejarían a quien lee?']
    : ['Preséntense el uno al otro.', 'Cuéntense cómo es un día normal en su mundo.', 'Debatan: ¿el deber o el corazón?', '¿Qué es lo que más temen?'];
}

/** Temas sugeridos al armar el encuentro. */
export const TOPIC_IDEAS = ['El amor y el deber', 'La libertad', 'Sus mayores miedos', 'La amistad', 'Un consejo para quien lee'];
