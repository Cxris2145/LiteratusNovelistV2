import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { TavernComponent } from './tavern.component';

describe('TavernComponent', () => {
  let component: TavernComponent;
  let fixture: ComponentFixture<TavernComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TavernComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();

    localStorage.removeItem('access_token');
    fixture = TestBed.createComponent(TavernComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no pide el Bazar sin sesión (el 401 mandaría al visitante a /login)', () => {
    const http = TestBed.inject(HttpTestingController);
    http.expectNone(req => req.url.includes('learning/shop'));
    expect(component.isLoggedIn()).toBeFalse();
  });

  it('calcula el precio por Tinta de cada cofre', () => {
    expect(component.unitPrice({ amount: 200, price: '990' })).toBe('$4,95');
    expect(component.unitPrice({ amount: 0, price: '990' })).toBe('');
  });
});
