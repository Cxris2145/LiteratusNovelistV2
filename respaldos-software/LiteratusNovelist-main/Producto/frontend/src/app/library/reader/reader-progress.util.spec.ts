import { readerProgressPayload } from './reader-progress.util';

describe('readerProgressPayload', () => {
  it('keeps the end of a chapter in that chapter, without revealing the next', () => {
    const payload = readerProgressPayload({ chapter: 2, exactPage: 2, wordId: 'word-89', immediate: false }, 5);
    expect(payload.current_page).toBe(2);
    expect(payload.completion_percentage).toBe(40);
    expect(JSON.parse(payload.current_cfi).scrollPercent).toBe(1);
  });

  it('preserves the chapter and word captured before a chapter change', () => {
    const payload = readerProgressPayload({ chapter: 1, exactPage: 0.5, wordId: 'word-42', immediate: false }, 3);
    expect(payload.current_page).toBe(1);
    expect(JSON.parse(payload.current_cfi).wordId).toBe('word-42');
    expect(JSON.parse(payload.current_cfi).scrollPercent).toBe(0.5);
  });
});
