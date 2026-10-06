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

describe('MembershipComponent', () => {
  let component: MembershipComponent;
  let fixture: ComponentFixture<MembershipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MembershipComponent],
      imports: [CommonModule, FormsModule, HttpClientTestingModule, RouterTestingModule, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
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
});
