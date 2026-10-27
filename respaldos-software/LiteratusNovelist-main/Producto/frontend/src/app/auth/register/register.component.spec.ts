import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { NEVER } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RegisterComponent } from './register.component';

const VALID_FORM = {
  username: 'LectorBrave', email: 'reader@example.com', birth_date: '1990-01-01',
  password: 'UnaClave123!', confirmPassword: 'UnaClave123!',
};

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let api: jasmine.SpyObj<ApiService>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    api.post.and.returnValue(NEVER);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['resendVerification']);
    TestBed.configureTestingModule({
      declarations: [RegisterComponent],
      imports: [CommonModule, ReactiveFormsModule, RouterTestingModule],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('escribir el usuario en el campo real conserva los demás datos y no llama a la API', () => {
    component.registerForm.patchValue({ ...VALID_FORM, username: '' });
    const input = fixture.nativeElement.querySelector('input[formControlName="username"]') as HTMLInputElement;

    for (let length = 1; length <= VALID_FORM.username.length; length++) {
      input.value = VALID_FORM.username.slice(0, length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    expect(component.registerForm.getRawValue()).toEqual(VALID_FORM);
    expect(component.registerForm.valid).toBeTrue();
    expect(api.post).not.toHaveBeenCalled();
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });

  it('corregir la contraseña original elimina el desacuerdo y permite enviar el formulario', () => {
    component.registerForm.setValue({ ...VALID_FORM, password: 'OtraClave123!' });
    expect(component.registerForm.hasError('passwordMismatch')).toBeTrue();

    component.f['password'].setValue(VALID_FORM.confirmPassword);

    expect(component.registerForm.hasError('passwordMismatch')).toBeFalse();
    expect(component.f['confirmPassword'].errors).toBeNull();
    expect(component.registerForm.valid).toBeTrue();
  });

  it('corregir la confirmación elimina el desacuerdo y permite enviar el formulario', () => {
    component.registerForm.setValue({ ...VALID_FORM, confirmPassword: 'OtraClave123!' });
    expect(component.registerForm.hasError('passwordMismatch')).toBeTrue();

    component.f['confirmPassword'].setValue(VALID_FORM.password);

    expect(component.registerForm.hasError('passwordMismatch')).toBeFalse();
    expect(component.registerForm.valid).toBeTrue();
  });

  it('una contraseña vacía mantiene required y no muestra un desacuerdo de contraseñas', () => {
    component.registerForm.setValue({ ...VALID_FORM, confirmPassword: '' });
    expect(component.f['confirmPassword'].hasError('required')).toBeTrue();
    expect(component.registerForm.hasError('passwordMismatch')).toBeFalse();

    component.registerForm.patchValue({ password: '', confirmPassword: VALID_FORM.confirmPassword });
    expect(component.f['password'].hasError('required')).toBeTrue();
    expect(component.registerForm.hasError('passwordMismatch')).toBeFalse();
    expect(component.registerForm.invalid).toBeTrue();
  });

  it('un registro inválido muestra los campos pendientes sin enviar datos', () => {
    component.onSubmit();

    expect(Object.values(component.f).every(control => control.touched)).toBeTrue();
    expect(component.isLoading).toBeFalse();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rechaza usuarios que superan el máximo del servidor y acepta el límite de 150 caracteres', () => {
    component.registerForm.setValue({ ...VALID_FORM, username: 'a'.repeat(151) });
    component.onSubmit();

    expect(component.f['username'].hasError('maxlength')).toBeTrue();
    expect(api.post).not.toHaveBeenCalled();

    component.f['username'].setValue('a'.repeat(150));
    expect(component.registerForm.valid).toBeTrue();
  });
});
