import { SimpleChange } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { CommunityService } from '../../core/services/community.service';
import { FriendChatComponent } from './friend-chat.component';

describe('FriendChatComponent drafts', () => {
  it('preserves each friend draft when changing threads and reopening the panel', fakeAsync(() => {
    TestBed.configureTestingModule({ providers: [{ provide: CommunityService, useValue: { chatMessages: () => NEVER, chatThreads: () => NEVER } }] });
    const component = TestBed.runInInjectionContext(() => new FriendChatComponent());
    component.open = true;
    component.code = 'LUNA';
    component.ngOnChanges({ open: new SimpleChange(false, true, true), code: new SimpleChange('', 'LUNA', true) });
    component.draft = 'El libro que te quería recomendar';
    component.code = 'SOL';
    component.ngOnChanges({ code: new SimpleChange('LUNA', 'SOL', false) });
    expect(component.draft).toBe('');
    component.draft = '¿Nos juntamos a leer?';
    component.code = '';
    component.open = false;
    component.ngOnChanges({ open: new SimpleChange(true, false, false), code: new SimpleChange('SOL', '', false) });
    component.code = 'LUNA';
    component.open = true;
    component.ngOnChanges({ open: new SimpleChange(false, true, false), code: new SimpleChange('', 'LUNA', false) });
    expect(component.draft).toBe('El libro que te quería recomendar');
    component.code = 'SOL';
    component.ngOnChanges({ code: new SimpleChange('LUNA', 'SOL', false) });
    expect(component.draft).toBe('¿Nos juntamos a leer?');
    tick(100);
    component.ngOnDestroy();
  }));
});
