export interface ReaderProgressSnapshot {
  chapter: number;
  exactPage: number;
  wordId: string;
  immediate: boolean;
}

/** Lectura conjunta: capítulo (1 = el primero), primera palabra a la vista y avance dentro del capítulo. */
export interface ReaderLivePosition {
  chapter: number;
  word: number | null;
  fraction: number;
}

/** A scroll fraction of 1 still belongs to the current chapter. */
export function readerProgressPayload(snapshot: ReaderProgressSnapshot, totalChapters: number) {
  const chapter = Math.max(1, Math.min(snapshot.chapter, totalChapters));
  const scrollPercent = Math.max(0, Math.min(snapshot.exactPage - (snapshot.chapter - 1), 1));
  const percentage = Math.max(0, Math.min(Math.round(((chapter - 1 + scrollPercent) / totalChapters) * 100), 100));
  return {
    current_page: chapter,
    completion_percentage: percentage,
    current_cfi: JSON.stringify({ percentage, wordId: snapshot.wordId, timestamp: Date.now(), scrollPercent }),
  };
}
