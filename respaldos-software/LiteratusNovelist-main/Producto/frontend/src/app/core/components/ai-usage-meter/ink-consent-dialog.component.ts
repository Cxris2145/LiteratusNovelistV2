import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({ selector: 'app-ink-consent-dialog', standalone: true, imports: [CommonModule, MatDialogModule],
  template: `<h2 mat-dialog-title>{{ data.usage.has_plan ? 'Tu magia necesita descansar' : 'Conversar usando Tinta' }}</h2>
    <mat-dialog-content><p *ngIf="data.usage.has_plan">El cupo incluido no alcanza para esta respuesta. Se renueva a las 00:00 de Santiago.</p>
      <p>Esta respuesta cuesta <strong>{{ data.ink_cost }} Tinta</strong>.</p><p>Tu saldo disponible: {{ data.usage.ink_balance | number:'1.0-0' }} Tinta.</p>
      <p>Si el personaje no puede responder, no se realizará ningún cargo.</p></mat-dialog-content>
    <mat-dialog-actions align="end"><button type="button" [mat-dialog-close]="false">Volver al chat</button>
      <button type="button" [mat-dialog-close]="true" [disabled]="data.usage.ink_balance < data.ink_cost">Enviar por {{ data.ink_cost }} Tinta</button></mat-dialog-actions>`,
  styles: [`:host{display:block;background:var(--home-bg-surface);color:var(--home-ink)}h2,p{color:var(--home-ink)}button{font:inherit;min-height:44px;padding:.7rem 1rem;border:1px solid var(--home-glass-border);border-radius:.6rem;background:var(--home-bg);color:var(--home-ink);cursor:pointer}button:last-child{background:var(--color-warning);color:var(--home-bg)}button:focus-visible{outline:3px solid var(--color-warning);outline-offset:3px}button:disabled{opacity:.5;cursor:default}`]
})
export class InkConsentDialogComponent { constructor(@Inject(MAT_DIALOG_DATA) public data: any) {} }
