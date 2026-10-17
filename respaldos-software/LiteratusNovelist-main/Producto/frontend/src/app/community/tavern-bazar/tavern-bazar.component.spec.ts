import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { TavernBazarComponent } from './tavern-bazar.component';
import { ChatService } from '../../core/services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { GamificationService } from '../../core/services/gamification.service';
import { LearningService, ShopItem } from '../../core/services/learning.service';
import { NotificationService } from '../../core/services/notification.service';

function piece(value: string, name = value, owned = false, equipped = false): ShopItem {
  return { id: value, code: value, name, description: '', item_type: 'maguito_wear', cost_ink: 100,
    icon: '', asset_url: '', value, sort_order: 0, is_purchasable: true, earned_by: null,
    is_owned: owned, is_equipped: equipped, quantity: owned ? 1 : 0 };
}

function object(code: string, item_type: ShopItem['item_type'], owned = false): ShopItem {
  return { id: code, code, name: code, description: '', item_type, cost_ink: 50,
    icon: 'shield', asset_url: '', value: '', sort_order: 0, is_purchasable: true, earned_by: null,
    is_owned: owned, is_equipped: false, quantity: owned ? 2 : 0 };
}

describe('TavernBazarComponent', () => {
  let fixture: ComponentFixture<TavernBazarComponent>;
  let component: TavernBazarComponent;
  let learning: jasmine.SpyObj<LearningService>;
  let balance: BehaviorSubject<number>;
  let items: ShopItem[];

  beforeEach(() => {
    items = [];
    balance = new BehaviorSubject(500);
    learning = jasmine.createSpyObj('LearningService', ['getShopItems', 'buyShopItem', 'equipShopItem', 'unequipShopSlot']);
    learning.getShopItems.and.callFake(() => of(items));
    TestBed.configureTestingModule({
      declarations: [TavernBazarComponent],
      providers: [
        { provide: LearningService, useValue: learning },
        { provide: ChatService, useValue: { inkBalance$: balance, loadInitialInk: () => {}, getUserProfile: () => of({ username: 'Lector QA' }), updateInkBalance: (v: number) => balance.next(v), notifyProfileUpdate: () => {} } },
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'Lector QA' }) } },
        { provide: GamificationService, useValue: { getDailyRewardStatus: () => of({ can_claim: false, ink_reward: 10 }), claimDailyReward: () => of({}) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'gamify']) },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(TavernBazarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function open(): void {
    component.open = true;
    component.ngOnChanges({ open: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false } });
  }

  it('cerrado no pide nada; al abrir carga el Bazar una sola vez', () => {
    expect(learning.getShopItems).not.toHaveBeenCalled();
    open();
    expect(learning.getShopItems).toHaveBeenCalledTimes(1);
    component.open = false;
    component.ngOnChanges({ open: { currentValue: false, previousValue: true, firstChange: false, isFirstChange: () => false } });
    open();
    expect(learning.getShopItems).toHaveBeenCalledTimes(1);
  });

  it('combina piezas de varios espacios y la mesa recibe la combinación', () => {
    const crown = piece('head:crown'), beard = piece('face:beard'), monocle = piece('eyes:monocle'), stars = piece('eyes:star');
    items = [crown, beard, monocle, stars];
    const previews: unknown[] = [];
    component.preview.subscribe(look => previews.push(look));
    open();
    component.tryOn(crown); component.tryOn(beard); component.tryOn(monocle); component.tryOn(stars);
    expect(component.previewOutfit).toEqual({ head: 'crown', face: 'beard', eyes: 'star' });
    expect(component.isTrying(monocle)).toBeFalse();
    expect(previews.at(-1)).toEqual({ head: 'crown', face: 'beard', eyes: 'star' });
    component.removeTry(beard);
    expect(component.previewOutfit).toEqual({ head: 'crown', eyes: 'star' });
  });

  it('mirar una pieza no borra la combinación ni toca la ropa puesta; al cerrar la mesa vuelve a tu ropa', () => {
    const tophat = piece('head:tophat', 'Chistera', true, true), crown = piece('head:crown'), beret = piece('head:beret'), beard = piece('face:beard');
    items = [tophat, crown, beret, beard];
    const previews: unknown[] = [];
    component.preview.subscribe(look => previews.push(look));
    open();
    expect(component.currentOutfit).toEqual({ head: 'tophat' });
    component.tryOn(crown); component.tryOn(beard); component.peek(beret);
    expect(component.previewOutfit).toEqual({ head: 'beret', face: 'beard' });
    component.peek(null);
    expect(component.previewOutfit).toEqual({ head: 'crown', face: 'beard' });
    expect(component.currentOutfit).toEqual({ head: 'tophat' });
    component.open = false;
    component.ngOnChanges({ open: { currentValue: false, previousValue: true, firstChange: false, isFirstChange: () => false } });
    expect(previews.at(-1)).toBeNull();
    expect(component.tryingItems.length).toBe(0);
  });

  it('separa el ropero de la racha y busca sin acentos dentro del baúl', () => {
    const monocle = piece('eyes:monocle', 'Monóculo del erudito', true), stars = piece('eyes:star', 'Gafas estelares'), crown = piece('head:crown', 'Corona');
    const shield = object('shield', 'streak_shield');
    items = [monocle, stars, crown, shield];
    open();
    expect(component.tabs).toEqual(['ropero', 'racha']);
    expect(component.visibleItems).toEqual([monocle, stars, crown]);
    component.setWearFilter('eyes');
    component.query = 'MONOCULO'; component.ownedOnly = true; component.applyFilter();
    expect(component.visibleItems).toEqual([monocle]);
    component.clearFilters();
    component.selectTab('racha');
    expect(component.visibleItems).toEqual([shield]);
  });

  it('no deja canjear sin Tinta suficiente y avisa a la mesa al canjear', () => {
    const crown = piece('head:crown');
    items = [crown];
    learning.buyShopItem.and.returnValue(of({ success: true, ink_balance: 400, message: 'Listo' }));
    const gestures: string[] = [];
    component.gesture.subscribe(g => gestures.push(g));
    open();
    balance.next(40);
    expect(component.missingInk(crown)).toBe(60);
    component.buy(crown);
    expect(learning.buyShopItem).not.toHaveBeenCalled();
    balance.next(500);
    component.buy(crown);
    expect(learning.buyShopItem).toHaveBeenCalledWith('head:crown');
    expect(gestures).toEqual(['buy']);
    expect(component.balance).toBe(400);
  });

  it('las prendas de La Senda se prueban sin comprarse ni equiparse automáticamente', () => {
    const reward: ShopItem = {
      ...piece('neck:firefly-brooch', 'Broche de luciérnaga'),
      is_purchasable: false, cost_ink: 0,
      earned_from: { kind: 'path_chest', code: 'realm-1', title: 'Bosque de las Primeras Páginas', unit_number: 5 },
    };
    items = [reward];
    open();
    component.tryOn(reward);
    component.buy(reward);
    component.equip(reward);
    expect(component.previewOutfit).toEqual({ neck: 'firefly-brooch' });
    expect(component.currentOutfit).toEqual({});
    expect(learning.buyShopItem).not.toHaveBeenCalled();
    expect(learning.equipShopItem).not.toHaveBeenCalled();
  });

  it('una prenda obtenida de La Senda se equipa solo con una acción explícita', () => {
    const reward: ShopItem = {
      ...piece('cape:moonlit', 'Capa lunar', true), is_purchasable: false, cost_ink: 0,
      earned_from: { kind: 'path_chest', code: 'realm-2', title: 'Lago de la Luna', unit_number: 10 },
    };
    items = [reward];
    learning.equipShopItem.and.callFake(() => {
      reward.is_equipped = true;
      return of({ outfit: { cape: 'moonlit' }, message: 'Capa equipada' });
    });
    open();
    expect(component.canBuy(reward)).toBeFalse();
    expect(component.canEquip(reward)).toBeTrue();
    expect(learning.equipShopItem).not.toHaveBeenCalled();
    component.equip(reward);
    expect(learning.equipShopItem).toHaveBeenCalledOnceWith('cape:moonlit');
    expect(component.currentOutfit).toEqual({ cape: 'moonlit' });
  });
});
