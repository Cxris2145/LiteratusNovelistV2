import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { MembershipComponent } from './membership.component';
import { OwnInkPipe } from '../core/pipes/own-ink.pipe';

describe('MembershipComponent', () => {
  let component: MembershipComponent;
  let fixture: ComponentFixture<MembershipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MembershipComponent],
      imports: [CommonModule, FormsModule, HttpClientTestingModule, RouterTestingModule, MatDialogModule, MatSnackBarModule, NoopAnimationsModule, OwnInkPipe],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();

    localStorage.removeItem('access_token');
    fixture = TestBed.createComponent(MembershipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sin sesión muestra los planes sin pedir la cuenta ni el Bazar', () => {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url.includes('finance/plans/'));
    http.expectNone(req => req.url.includes('finance/subscription/'));
    http.expectNone(req => req.url.includes('learning/shop'));
    expect(component.isLoggedIn()).toBeFalse();
  });

  it('solo trata planes, membresía y Tinta: el Bazar vive en La Taberna', () => {
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('h1')?.textContent).toContain('Sé parte de Literatus');
    expect(page.querySelector('#plans-title')).not.toBeNull();
    expect(page.querySelector('#tinta')).not.toBeNull();
    expect(page.querySelector('#bazar-title')).toBeNull();
    expect(page.querySelector('app-maguito')).toBeNull();
  });

  it('calcula el precio por Tinta de cada cofre', () => {
    expect(component.unitPrice({ amount: 200, price: '990' })).toBe('$4,95');
    expect(component.unitPrice({ amount: 0, price: '990' })).toBe('');
  });

  it('marca el cofre con el menor precio por Tinta', () => {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(req => req.url.includes('finance/ink-packages/')).flush([
      { amount: 200, price: '990', currency: 'CLP' },
      { amount: 1200, price: '3990', currency: 'CLP' },
      { amount: 500, price: '1990', currency: 'CLP' },
    ]);
    expect(component.bestPackAmount).toBe(1200);
  });

  it('con un plan activo no ofrece planes: solo la compra de Tinta', () => {
    const plan = { code: 'aprendiz', name: 'Aprendiz', price: '4.99', currency: 'USD', daily_token_limit: 1000,
      daily_time_limit: 18000, monthly_ink_bonus: 0, benefits: [], purchasable: true };
    (component as any).session = true;
    component.plans = [plan];
    component.account = {
      subscription: { plan, status: 'ACTIVE', active: true, paid_until: null, renews_at: null, cancel_at_period_end: false, pending_plan: null },
      cosmetics: { maestro: false, frame: null }, ink_balance: 0,
    };
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('h1')?.textContent).toContain('Ya eres parte de Literatus');
    expect(page.querySelector('#plans-title')).toBeNull();
    expect(page.querySelector('.plan-button')).toBeNull();
    const heroButtons = Array.from(page.querySelectorAll('.tv-hero-actions .button'));
    expect(heroButtons.length).toBe(1);
    expect(heroButtons[0].textContent).toContain('Comprar Tinta');
    expect(page.querySelector('#tinta')).not.toBeNull();
  });
});
