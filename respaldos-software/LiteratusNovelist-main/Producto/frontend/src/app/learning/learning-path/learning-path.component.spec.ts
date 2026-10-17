import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { LearningModule } from '../learning.module';
import { LearningPathComponent } from './learning-path.component';
import { ChestClaimResult, LearningPath, LearningService, LearningUnit, PathChest, UserStatus } from '../../core/services/learning.service';
import { ChatService } from '../../core/services/chat.service';

const status: UserStatus = { hearts: 5, max_hearts: 5, streak_current: 2, streak_max: 2, streak_shields: 0, is_secured_today: false, is_in_danger: false, ink_balance: 58, xp: 100, level: 2 };
function unit(number: number): LearningUnit {
  return { id: `u-${number}`, unit_number: number, slug: `unit-${number}`, title: `Unidad ${number}`, description: 'Descubre lo que una historia puede contar.', order: number, icon: 'menu_book', banner_color: '#317b72', min_user_level: 1, progress_percentage: 0, is_locked: number > 1,
    levels: Array.from({ length: 5 }, (_, index) => ({ id: `u-${number}-l-${index + 1}`, level_number: index + 1, order: index + 1, title: `Etapa ${index + 1}`, description: 'Un nuevo relato.', difficulty: 'facil', required_score: 70, xp_reward: 20, ink_reward: 15, is_exam: index === 4, is_chest: index === 2, icon: 'menu_book', stars: 0, best_score: 0, is_completed: false, is_unlocked: number === 1 && index === 0 })) };
}
function chest(code = 'unit-1', state: PathChest['state'] = 'available'): PathChest {
  return { code, kind: code.startsWith('realm') ? 'realm' : 'unit', unit_number: 1, realm_number: 1, title: 'Cofre de la unidad 1', state, ink_reward: 10, item: null, requirement: 'Supera la sala de minijuegos con estrellas.' };
}

describe('LearningPathComponent: mapa y tesoros', () => {
  let fixture: ComponentFixture<LearningPathComponent>;
  let component: LearningPathComponent;
  let api: jasmine.SpyObj<LearningService>;
  let chat: jasmine.SpyObj<ChatService>;
  let claim$: Subject<ChestClaimResult>;
  let path: LearningPath;
  let query$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    path = { user_status: { ...status }, units: [unit(1)], chests: [chest()] };
    claim$ = new Subject<ChestClaimResult>();
    query$ = new BehaviorSubject(convertToParamMap({}));
    api = jasmine.createSpyObj('LearningService', ['getPath', 'claimChest', 'getHeartsStatus']);
    api.getPath.and.callFake(() => of(path));
    api.claimChest.and.returnValue(claim$);
    api.getHeartsStatus.and.returnValue(of({ hearts: 0, can_refill: false, seconds_to_next_heart: 100 }));
    chat = jasmine.createSpyObj('ChatService', ['updateInkBalance', 'notifyProfileUpdate']);
    await TestBed.configureTestingModule({
      imports: [LearningModule, RouterTestingModule],
      providers: [{ provide: LearningService, useValue: api }, { provide: ChatService, useValue: chat }, { provide: ActivatedRoute, useValue: { queryParamMap: query$.asObservable() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(LearningPathComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  function render(): void { fixture.detectChanges(); }
  function confirmed(already = false): ChestClaimResult { return { success: true, already_claimed: already, ink_earned: already ? 0 : 10, ink_balance: 68, item_granted: null, chest: { ...chest(), state: 'claimed' } }; }
  function openBonus(): void { (fixture.nativeElement.querySelector('#chest-unit-1') as HTMLButtonElement).click(); render(); }

  it('conserva los 150 niveles, sus 30 castillos y las 30 salas en seis reinos', () => {
    path.units = Array.from({ length: 30 }, (_, index) => unit(index + 1));
    path.chests = [];
    render();
    expect(component.realms.length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('[data-level-id]').length).toBe(150);
    expect(fixture.nativeElement.querySelectorAll('.node-exam').length).toBe(30);
    expect(fixture.nativeElement.querySelectorAll('.node-games').length).toBe(30);
    expect(fixture.nativeElement.querySelectorAll('.current-companion').length).toBe(1);
    // Cada reino conserva un paisaje continuo, sin repetir la foto por unidad.
    expect(fixture.nativeElement.querySelectorAll('.realm-scene').length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('.realm-picture img').length).toBe(6);
    const portraits = Array.from(fixture.nativeElement.querySelectorAll('.realm-picture source')) as HTMLSourceElement[];
    expect(portraits.length).toBe(6);
    expect(portraits.every(portrait => portrait.media === '(max-width: 600px)' && portrait.srcset.endsWith('-mobile.webp'))).toBeTrue();
  });

  it('mantiene la silueta de edificios bloqueados y solo abre niveles disponibles', () => {
    render();
    expect(fixture.nativeElement.querySelector('.node-exam app-path-landmark')).not.toBeNull();
    component.onNodeClick(path.units[0], path.units[0].levels[4]);
    expect(component.showLevelModal).toBeFalse();
    (fixture.nativeElement.querySelector('[data-level-id="u-1-l-1"]') as HTMLButtonElement).click();
    render();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Etapa 1');
  });

  it('no abre ni entrega un cofre antes de confirmar el servidor y bloquea el doble clic', () => {
    render(); openBonus(); component.claimChest(); component.claimChest(); render();
    expect(api.claimChest).toHaveBeenCalledOnceWith('unit-1');
    expect(component.selectedChest?.state).toBe('available');
    expect(fixture.nativeElement.querySelector('.chest-reveal.reward-confirmed')).toBeNull();
    expect(fixture.nativeElement.querySelector('.claim-btn').disabled).toBeTrue();
    expect(chat.updateInkBalance).not.toHaveBeenCalled();
    claim$.next(confirmed()); render();
    expect(component.userStatus?.ink_balance).toBe(68);
    expect(fixture.nativeElement.querySelector('.chest-reveal.reward-confirmed')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.claim-btn')).toBeNull();
    expect(chat.updateInkBalance).toHaveBeenCalledOnceWith(68);
  });

  it('ofrece reintento tras un error sin fingir apertura ni modificar saldo', () => {
    render(); openBonus(); component.claimChest(); claim$.error({ status: 503 }); render();
    expect(component.selectedChest?.state).toBe('available');
    expect(component.userStatus?.ink_balance).toBe(58);
    expect(fixture.nativeElement.querySelector('.chest-reveal.reward-confirmed')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se pudo confirmar');
    const retry$ = new Subject<ChestClaimResult>(); api.claimChest.and.returnValue(retry$);
    (fixture.nativeElement.querySelector('.claim-btn') as HTMLButtonElement).click();
    expect(api.claimChest).toHaveBeenCalledTimes(2);
    retry$.next(confirmed()); render();
    expect(component.selectedChest?.state).toBe('claimed');
  });

  it('respeta una respuesta ya reclamada y no permite otra solicitud', () => {
    render(); openBonus(); component.claimChest(); claim$.next(confirmed(true)); render(); component.claimChest();
    expect(api.claimChest).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Este tesoro ya es tuyo');
    expect(fixture.nativeElement.textContent).not.toContain('¡Un nuevo tesoro para ti!');
  });

  it('explica el requisito de un cofre bloqueado sin enviar peticiones', () => {
    path.chests = [chest('unit-1', 'locked')]; render(); openBonus(); component.claimChest(); render();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Supera la sala de minijuegos con estrellas');
    expect(fixture.nativeElement.querySelector('.claim-btn')).toBeNull();
    expect(api.claimChest).not.toHaveBeenCalled();
  });

  it('no vuelve a abrir el modal si se cerró durante la confirmación', () => {
    render(); openBonus(); component.claimChest(); component.closeChest(); claim$.next(confirmed()); render();
    expect(component.selectedChest).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(component.chests[0].state).toBe('claimed');
    expect(component.userStatus?.ink_balance).toBe(68);
  });

  it('muestra los valores efectivos y las condiciones de práctica', () => {
    render(); component.onNodeClick(path.units[0], path.units[0].levels[0]); render();
    expect(fixture.nativeElement.querySelector('.modal-rewards-box').textContent).toContain('+10 de Tinta');
    expect(fixture.nativeElement.querySelector('.reward-explanation').textContent).toContain('10 XP y 3 de Tinta adicionales');
    component.closeLevelModal(); path.units[0].levels[0].is_completed = true;
    component.onNodeClick(path.units[0], path.units[0].levels[0]); render();
    expect(fixture.nativeElement.querySelector('.modal-rewards-box').textContent).toContain('+5 XP');
    expect(fixture.nativeElement.querySelector('.modal-rewards-box').textContent).toContain('0 de Tinta');
    expect(fixture.nativeElement.querySelector('.reward-explanation').textContent).toContain('Práctica');
  });

  it('usa la vista previa recibida del servidor al mostrar el nivel', () => {
    const level = path.units[0].levels[0]; level.reward_preview = { xp: 27, ink: 6, perfect_bonus_xp: 4, perfect_bonus_ink: 2, is_practice: false };
    render(); component.onNodeClick(path.units[0], level); render();
    expect(fixture.nativeElement.querySelector('.modal-rewards-box').textContent).toContain('+27 XP');
    expect(fixture.nativeElement.querySelector('.modal-rewards-box').textContent).toContain('+6 de Tinta');
    expect(fixture.nativeElement.querySelector('.reward-explanation').textContent).toContain('4 XP y 2 de Tinta adicionales');
  });

  it('retiene el foco en el modal y lo devuelve al cofre al cerrar con Escape', fakeAsync(() => {
    render(); const button = fixture.nativeElement.querySelector('#chest-unit-1') as HTMLButtonElement; button.focus(); openBonus(); tick();
    const close = fixture.nativeElement.querySelector('[aria-label="Cerrar cofre"]') as HTMLButtonElement;
    const claim = fixture.nativeElement.querySelector('.claim-btn') as HTMLButtonElement;
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(claim);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); render(); tick();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  }));

  it('prioriza el enlace a un cofre sobre el centrado en el nivel actual', fakeAsync(() => {
    path.units[0].levels[0].is_completed = true;
    path.units[0].levels[1].is_unlocked = true;
    query$.next(convertToParamMap({ chest: 'unit-1' }));
    const scroll = spyOn(HTMLElement.prototype, 'scrollIntoView'); render();
    query$.next(convertToParamMap({ chest: 'unit-1' })); tick();
    const button = fixture.nativeElement.querySelector('#chest-unit-1') as HTMLButtonElement;
    expect(document.activeElement).toBe(button);
    expect(scroll).toHaveBeenCalled();
    expect(component.currentLevelId).toBe('u-1-l-2');
  }));

  it('pausa las escenas si se solicita movimiento reducido', () => {
    path.units = [1, 6, 11, 16, 21, 26].map(number => unit(number));
    spyOn(window, 'matchMedia').and.returnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList);
    render(); expect(component.reducedMotion).toBeTrue();
    const scenes = Array.from(fixture.nativeElement.querySelectorAll('.realm-scene')) as HTMLElement[];
    expect(scenes.length).toBe(6);
    expect(scenes.every(scene => scene.classList.contains('scene-paused'))).toBeTrue();
  });

  it('alinea el inicio de una unidad enlazada para conservar visible su encabezado', fakeAsync(() => {
    query$.next(convertToParamMap({ unit: '1' }));
    const scroll = spyOn(HTMLElement.prototype, 'scrollIntoView');
    render(); tick();
    expect(scroll.calls.mostRecent().object).toBe(fixture.nativeElement.querySelector('#unit-1'));
    expect(scroll.calls.mostRecent().args[0]).toEqual({ block: 'start', behavior: 'auto' });
  }));

  it('presenta un error recuperable en lugar de un mapa vacío', () => {
    const request$ = new Subject<LearningPath>();
    api.getPath.and.returnValue(request$);
    render(); request$.error({ status: 503 }); render();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Revisa tu conexión');
    expect(fixture.nativeElement.querySelector('.path-container')).toBeNull();
  });
});
