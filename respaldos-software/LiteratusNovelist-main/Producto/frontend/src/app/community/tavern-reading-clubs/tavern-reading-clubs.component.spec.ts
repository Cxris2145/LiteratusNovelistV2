import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER } from 'rxjs';
import { CommunityService, ReadingClubChapterInfo, ReadingClubSummary } from '../../core/services/community.service';
import { NotificationService } from '../../core/services/notification.service';
import { TavernReadingClubsComponent } from './tavern-reading-clubs.component';

describe('TavernReadingClubsComponent drafts', () => {
  it('preserves chapter drafts and spoiler flags through navigation and reopening', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: CommunityService, useValue: { chapterMessages: () => NEVER, readingClubDetail: () => NEVER } },
      { provide: NotificationService, useValue: {} },
      { provide: Router, useValue: {} },
    ] });
    const component = TestBed.runInInjectionContext(() => new TavernReadingClubsComponent());
    const chapter = (order: number) => ({ order, locked: false } as ReadingClubChapterInfo);
    component.open = true;
    component.activeClub = { id: 'CLUB' } as ReadingClubSummary;
    component.openChapter(chapter(1));
    component.draft = 'Me sorprendió el desenlace';
    component.draftSpoiler = true;
    component.openChapter(chapter(2));
    expect(component.draft).toBe('');
    expect(component.draftSpoiler).toBeFalse();
    component.draft = 'Mis notas del segundo capítulo';
    component.open = false;
    component.ngOnChanges({ open: new SimpleChange(true, false, false) });
    component.open = true;
    component.clubId = 'CLUB';
    component.ngOnChanges({ open: new SimpleChange(false, true, false) });
    component.openChapter(chapter(1));
    expect(component.draft).toBe('Me sorprendió el desenlace');
    expect(component.draftSpoiler).toBeTrue();
    component.openChapter(chapter(2));
    expect(component.draft).toBe('Mis notas del segundo capítulo');
    component.ngOnDestroy();
  });
});
