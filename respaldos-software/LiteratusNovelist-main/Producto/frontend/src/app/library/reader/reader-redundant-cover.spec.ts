import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { ReadingSessionService } from '../../core/services/reading-session.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { ReaderTabsService } from '../../core/services/reader-tabs.service';
import { CharacterChatService } from '../../core/services/character-chat.service';
import { NotificationService } from '../../core/services/notification.service';
import { VocabularyService } from '../../core/services/vocabulary.service';
import { ReadingSummaryService } from '../../core/services/reading-summary.service';
import { NotebookService } from '../../notebook/notebook.service';
import { AuthService } from '../../core/services/auth.service';
import { BookSearchService } from './book-search.service';
import { ReaderComponent } from './reader.component';
import { ReaderAnnotationsService } from './reader-annotations.service';
import { ReaderNarrationService } from './reader-narration.service';
import { ReaderSettingsService } from './reader-settings.service';
import { DEFAULT_READER_SETTINGS, ReaderSettings } from './reader-settings';
import { ReaderBlock } from '../../core/utils/chapter-parser.util';

describe('Detección y prevención de metadatos redundantes de portada en ReaderComponent', () => {
  let reader: ReaderComponent;
  let settings: { value: ReaderSettings; changes$: Subject<(keyof ReaderSettings)[]>; update: (patch: Partial<ReaderSettings>) => void };

  const createBlock = (tag: string, text: string, idx = 0): ReaderBlock => ({
    tag,
    tokens: [
      { text, isWord: true, isImg: false, isBr: false, idx },
    ],
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    settings = {
      value: { ...DEFAULT_READER_SETTINGS, layoutMode: 'book' },
      changes$: new Subject(),
      update: patch => {
        settings.value = { ...settings.value, ...patch };
      },
    };

    TestBed.configureTestingModule({
      providers: [
        ...[ApiService, ChatService, ActivatedRoute, Router, FavoritesService, ReaderTabsService,
          CharacterChatService, NotificationService, VocabularyService, ReadingSummaryService,
          NotebookService, BookSearchService].map(provide => ({ provide, useValue: {} })),
        { provide: ReaderSettingsService, useValue: settings },
        { provide: ReaderNarrationService, useValue: { stop: () => undefined } },
        { provide: ReaderAnnotationsService, useValue: { bookmarks: [], bookmarkIn: () => null } },
        { provide: ReadingSessionService, useValue: { endSession: () => undefined } },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: ChangeDetectorRef, useValue: { detectChanges: () => undefined, markForCheck: () => undefined } },
      ],
    });

    reader = TestBed.runInInjectionContext(() => new ReaderComponent());
    reader.bookTitle = 'El Principito';
    reader.authorName = 'Antoine de Saint-Exupéry';
    reader.chapters = [
      { id: 'c1', title: 'El Principito', content_html: '<p>Antoine de Saint-Exupéry</p>' },
      { id: 'c2', title: 'Capítulo 1', content_html: '<p>Pido perdón a los niños...</p>' },
    ];
    reader.currentPage = 1;
  });

  it('detecta coincidencia de metadatos con isMetadataMatch para títulos, autores y variantes', () => {
    expect(reader.isMetadataMatch('El Principito')).toBeTrue();
    expect(reader.isMetadataMatch('el principito')).toBeTrue();
    expect(reader.isMetadataMatch('Antoine de Saint-Exupéry')).toBeTrue();
    expect(reader.isMetadataMatch('Por Antoine de Saint-Exupery')).toBeTrue();
    expect(reader.isMetadataMatch('escrito por Antoine de Saint-Exupéry')).toBeTrue();
    expect(reader.isMetadataMatch('El Principito por Antoine de Saint-Exupéry')).toBeTrue();
    expect(reader.isMetadataMatch('Portada')).toBeTrue();
    expect(reader.isMetadataMatch('Cover')).toBeTrue();

    // Texto narrativo real no debe coincidir
    expect(reader.isMetadataMatch('Cuando yo tenía seis años vi en un libro...')).toBeFalse();
  });

  it('detecta capítulo inicial redundante cuando solo repite título y autor de la portada', () => {
    reader.chapterTitle = 'El Principito';
    reader.parsedBlocks = [
      createBlock('p', 'Antoine de Saint-Exupéry', 0),
    ];
    reader.renderedBlocks = [...reader.parsedBlocks];

    expect(reader.hasRedundantInitialMetadata()).toBeTrue();
    expect(reader.isInitialChapterRedundant).toBeTrue();
    expect(reader.isChapterTitleRedundant).toBeTrue();
    expect(reader.shouldRenderChapterTitle).toBeFalse();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[0], 0)).toBeFalse();
    expect(reader.visibleRenderedBlocks.length).toBe(0);
  });

  it('detecta cuando el capítulo inicial solo tiene etiqueta de portada y bloques de metadatos', () => {
    reader.chapterTitle = 'Portada';
    reader.parsedBlocks = [
      createBlock('h1', 'El Principito', 0),
      createBlock('p', 'Por Antoine de Saint-Exupéry', 1),
    ];
    reader.renderedBlocks = [...reader.parsedBlocks];

    expect(reader.hasRedundantInitialMetadata()).toBeTrue();
    expect(reader.isInitialChapterRedundant).toBeTrue();
    expect(reader.shouldRenderChapterTitle).toBeFalse();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[0], 0)).toBeFalse();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[1], 1)).toBeFalse();
    expect(reader.visibleRenderedBlocks.length).toBe(0);
  });

  it('detecta sección inicial redundante pero permite renderizar el contenido narrativo posterior', () => {
    reader.chapterTitle = 'El Principito';
    reader.parsedBlocks = [
      createBlock('p', 'Antoine de Saint-Exupéry', 0),
      createBlock('p', 'Pido perdón a los niños por haber dedicado este libro...', 1),
    ];
    reader.renderedBlocks = [...reader.parsedBlocks];

    expect(reader.hasRedundantInitialMetadata()).toBeTrue();
    expect(reader.isFirstSectionRedundant(0)).toBeTrue();
    expect(reader.isFirstSectionRedundant(1)).toBeFalse();
    // El capítulo completo no es solo portada porque tiene texto narrativo
    expect(reader.isInitialChapterRedundant).toBeFalse();

    // En vista libro con portadilla ya presente, oculta título y bloque 0 redundante, pero renderiza bloque 1
    expect(reader.isTitlePageInCanvas).toBeTrue();
    expect(reader.shouldRenderChapterTitle).toBeFalse();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[0], 0)).toBeFalse();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[1], 1)).toBeTrue();
    expect(reader.visibleRenderedBlocks.length).toBe(1);
    expect(reader.visibleRenderedBlocks[0].tokens[0].text).toContain('Pido perdón');
  });

  it('no marca como redundante un capítulo inicial normal con contenido real y título propio', () => {
    reader.chapterTitle = 'Capítulo I';
    reader.parsedBlocks = [
      createBlock('p', 'Una vez vi una magnífica lámina en un libro sobre la selva virgen.', 0),
    ];
    reader.renderedBlocks = [...reader.parsedBlocks];

    expect(reader.hasRedundantInitialMetadata()).toBeFalse();
    expect(reader.isInitialChapterRedundant).toBeFalse();
    expect(reader.isChapterTitleRedundant).toBeFalse();
    expect(reader.shouldRenderChapterTitle).toBeTrue();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[0], 0)).toBeTrue();
    expect(reader.visibleRenderedBlocks.length).toBe(1);
  });

  it('no aplica supresión en capítulos posteriores a la página 1', () => {
    reader.currentPage = 2;
    reader.chapterTitle = 'El Principito';
    reader.parsedBlocks = [
      createBlock('p', 'Antoine de Saint-Exupéry', 0),
    ];
    reader.renderedBlocks = [...reader.parsedBlocks];

    expect(reader.hasRedundantInitialMetadata()).toBeFalse();
    expect(reader.isInitialChapterRedundant).toBeFalse();
    expect(reader.shouldRenderChapterTitle).toBeTrue();
    expect(reader.shouldRenderBlock(reader.parsedBlocks[0], 0)).toBeTrue();
    expect(reader.visibleRenderedBlocks.length).toBe(1);
  });
});

