import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TavernTableAction } from '../tavern-table/tavern-table.types';

/**
 * Ilustración del objeto de la mesa en la cabecera de su ventana. Cada uno hace un gesto al
 * abrirse (el libro pasa la página, las jarras chocan, el cofre se sacude, el reloj se da la
 * vuelta) y el cofre se abre del todo con `open`. Las ventanas se abren de vez en cuando, así
 * que hay margen para un gesto con carácter; con movimiento reducido queda quieta.
 */
@Component({
  selector: 'app-table-object-art',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 72 72" [attr.data-object]="action" [class.is-open]="open" aria-hidden="true" focusable="false">
      <circle class="oa-halo" cx="36" cy="38" r="30"/>
      <ng-container [ngSwitch]="action">
        <g *ngSwitchCase="'book'">
          <path d="M10 22Q22 17 36 22V56Q22 51 10 56Z" fill="#faf3e0"/>
          <path d="M62 22Q50 17 36 22V56Q50 51 62 56Z" fill="#efe4c8"/>
          <path class="oa-page" d="M36 22Q48 17 60 22V54Q48 49 36 54Z" fill="#fffaf0"/>
          <path d="M36 22V56" stroke="#8a6d3b" stroke-width="2"/>
          <path d="M15 30Q22 27 31 30M15 36Q22 33 31 36M15 42Q22 39 31 42" stroke="#a8915f" stroke-width="1.6" stroke-linecap="round" fill="none"/>
          <path class="oa-spark" d="M58 12l1.6 3.4 3.4 1.6-3.4 1.6L58 22l-1.6-3.4-3.4-1.6 3.4-1.6Z" fill="#ffd166"/>
        </g>
        <g *ngSwitchCase="'invite'">
          <g class="oa-mug oa-mug--l">
            <path d="M29 34q8 0 8 8t-8 8" stroke="#c8902a" stroke-width="3.5" fill="none"/>
            <rect x="10" y="28" width="20" height="28" rx="4" fill="#804d26"/>
            <rect x="10" y="33" width="20" height="3" fill="#462512"/>
            <ellipse cx="20" cy="28" rx="11" ry="5" fill="#fff4dc"/>
          </g>
          <g class="oa-mug oa-mug--r">
            <path d="M43 34q-8 0-8 8t8 8" stroke="#b07a3a" stroke-width="3.5" fill="none"/>
            <rect x="42" y="28" width="20" height="28" rx="4" fill="#6d3e1b"/>
            <rect x="42" y="33" width="20" height="3" fill="#3b1d09"/>
            <ellipse cx="52" cy="28" rx="11" ry="5" fill="#fff4dc"/>
          </g>
          <circle class="oa-drop" cx="33" cy="18" r="2.4" fill="#fff4dc"/>
          <circle class="oa-drop oa-drop--2" cx="40" cy="16" r="1.8" fill="#fff4dc"/>
        </g>
        <g *ngSwitchCase="'rewards'" class="oa-chest">
          <path class="oa-glow" d="M18 36h36l-6-22H24Z" fill="#ffd166"/>
          <rect x="12" y="36" width="48" height="22" rx="3" fill="#7a4520"/>
          <rect x="12" y="44" width="48" height="4" fill="#d4af37"/>
          <rect x="31" y="40" width="10" height="12" rx="2" fill="#d4af37"/>
          <circle cx="36" cy="46" r="1.8" fill="#3b1d09"/>
          <g class="oa-lid">
            <path d="M12 36V30Q12 18 36 18T60 30V36Z" fill="#8f5428"/>
            <path d="M12 32H60" stroke="#d4af37" stroke-width="3"/>
            <path d="M33 18V36M39 18V36" stroke="#d4af37" stroke-width="2.5"/>
          </g>
          <circle class="oa-coin" cx="36" cy="30" r="3.2" fill="#ffd166"/>
          <circle class="oa-coin oa-coin--2" cx="36" cy="30" r="2.6" fill="#f4c542"/>
          <circle class="oa-coin oa-coin--3" cx="36" cy="30" r="2.8" fill="#ffe08a"/>
        </g>
        <g *ngSwitchCase="'cat'">
          <path class="oa-tail" d="M50 56Q64 52 62 38Q60 28 54 32" stroke="#1b1624" stroke-width="5" stroke-linecap="round" fill="none"/>
          <ellipse cx="36" cy="52" rx="17" ry="10" fill="#1b1624"/>
          <circle cx="36" cy="34" r="16" fill="#1b1624"/>
          <path d="M23 26l4-14 7 10Z M49 26l-4-14-7 10Z" fill="#1b1624"/>
          <path d="M25 24l2.5-8 4 6Z M47 24l-2.5-8-4 6Z" fill="#e76f51" opacity=".6"/>
          <g class="oa-eyes">
            <ellipse cx="29.5" cy="33" rx="4" ry="5" fill="#ffd166"/>
            <ellipse cx="42.5" cy="33" rx="4" ry="5" fill="#ffd166"/>
            <ellipse cx="29.5" cy="33" rx="1.5" ry="3.6" fill="#0d0a14"/>
            <ellipse cx="42.5" cy="33" rx="1.5" ry="3.6" fill="#0d0a14"/>
          </g>
          <path d="M34.5 39l1.5 1.5 1.5-1.5" stroke="#e76f51" stroke-width="1.2" fill="none"/>
          <path d="M22 44Q36 51 50 44L48 50Q36 56 24 50Z" fill="#c0283a"/>
        </g>
        <g *ngSwitchCase="'potions'" class="oa-flask">
          <path d="M30 12h12v4h-2v12l14 20q4 8-6 10H24q-10-2-6-10l14-20V16h-2Z" fill="#d8ecff" opacity=".35"/>
          <path class="oa-liquid" d="M22 46l9-12h10l9 12q4 8-6 10H28q-10-2-6-10Z"/>
          <path d="M30 12h12v4h-2v12l14 20q4 8-6 10H24q-10-2-6-10l14-20V16h-2Z" stroke="#e9f1ff" stroke-width="2" fill="none" opacity=".8"/>
          <rect x="29" y="8" width="14" height="5" rx="2" fill="#8f5428"/>
          <circle class="oa-bubble" cx="32" cy="50" r="2.2"/>
          <circle class="oa-bubble oa-bubble--2" cx="39" cy="52" r="1.6"/>
          <circle class="oa-bubble oa-bubble--3" cx="44" cy="49" r="1.9"/>
        </g>
        <g *ngSwitchCase="'hourglass'" class="oa-hourglass">
          <rect x="18" y="10" width="36" height="5" rx="2" fill="#8f5428"/>
          <rect x="18" y="57" width="36" height="5" rx="2" fill="#8f5428"/>
          <path d="M21 15h3v42h-3ZM48 15h3v42h-3Z" fill="#d4af37"/>
          <path d="M26 15h20q0 12-8 19 8 7 8 23H26q0-16 8-23-8-7-8-19Z" fill="#d8ecff" opacity=".3" stroke="#e9f1ff" stroke-width="1.5"/>
          <path class="oa-sand-top" d="M29 19h14q-1 7-7 12-6-5-7-12Z" fill="#e9c46a"/>
          <path d="M28 57q2-9 8-11 6 2 8 11Z" fill="#e9c46a"/>
          <path class="oa-sand-stream" d="M36 32V48" stroke="#e9c46a" stroke-width="1.6"/>
        </g>
      </ng-container>
    </svg>`,
  styles: [`
    :host { display: block; width: 72px; height: 72px; flex: none; --oa-ease-out: var(--ease-out, cubic-bezier(.23, 1, .32, 1)); --oa-ease-in-out: var(--ease-in-out, cubic-bezier(.77, 0, .175, 1)); }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    svg * { transform-box: fill-box; }
    .oa-halo { fill: color-mix(in srgb, var(--th-gold, #d4af37) 16%, transparent); transform-origin: center;
      animation: oa-halo-in 420ms var(--oa-ease-out) backwards; }
    @keyframes oa-halo-in { from { opacity: 0; transform: scale(.85); } }

    /* Libro: la hoja derecha se pasa una vez al abrir. */
    .oa-page { transform-origin: left center; animation: oa-page-turn 700ms var(--oa-ease-in-out) 120ms backwards; }
    @keyframes oa-page-turn { from { transform: scaleX(-1); } }
    .oa-spark { transform-origin: center; animation: oa-twinkle 2.6s ease-in-out 800ms infinite; }
    @keyframes oa-twinkle { 0%, 100% { opacity: .35; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }

    /* Jarras: chocan una vez y salta espuma. */
    .oa-mug--l { transform-origin: 50% 100%; animation: oa-clink-l 560ms var(--oa-ease-out) 120ms backwards; }
    .oa-mug--r { transform-origin: 50% 100%; animation: oa-clink-r 560ms var(--oa-ease-out) 120ms backwards; }
    @keyframes oa-clink-l { 0% { transform: rotate(-10deg) translateX(-4px); } 45% { transform: rotate(10deg) translateX(3px); } }
    @keyframes oa-clink-r { 0% { transform: rotate(10deg) translateX(4px); } 45% { transform: rotate(-10deg) translateX(-3px); } }
    .oa-drop { transform-origin: center; opacity: 0; animation: oa-drop 700ms var(--oa-ease-out) 360ms; }
    .oa-drop--2 { animation-delay: 420ms; }
    @keyframes oa-drop { 0% { opacity: 0; transform: translateY(10px) scale(.6); } 40% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px) scale(1); } }

    /* Cofre: se sacude al abrir la ventana; con .is-open la tapa se levanta y salen monedas. */
    .oa-chest { transform-origin: 50% 100%; animation: oa-wiggle 520ms var(--oa-ease-out) 160ms backwards; }
    @keyframes oa-wiggle { 0% { transform: rotate(0); } 30% { transform: rotate(-5deg); } 60% { transform: rotate(4deg); } 100% { transform: rotate(0); } }
    .oa-lid { transform-origin: 0% 100%; transition: transform 500ms var(--oa-ease-out); }
    .oa-glow { opacity: 0; transition: opacity 400ms ease; }
    .oa-coin { opacity: 0; transform-origin: center; }
    .is-open .oa-lid { transform: rotate(-32deg) translate(-2px, -4px); }
    .is-open .oa-glow { opacity: .55; }
    .is-open .oa-coin { animation: oa-coin-a 900ms var(--oa-ease-out) 140ms forwards; }
    .is-open .oa-coin--2 { animation-name: oa-coin-b; animation-delay: 200ms; }
    .is-open .oa-coin--3 { animation-name: oa-coin-c; animation-delay: 260ms; }
    @keyframes oa-coin-a { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(-14px, -24px); } }
    @keyframes oa-coin-b { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(2px, -30px); } }
    @keyframes oa-coin-c { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(15px, -22px); } }

    /* Gato: parpadea de vez en cuando y mece la cola. */
    .oa-eyes { transform-origin: center; animation: oa-blink 4.8s ease-in-out 1.2s infinite; }
    @keyframes oa-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.12); } }
    .oa-tail { transform-origin: 0% 100%; animation: oa-tail 3.2s ease-in-out infinite; }
    @keyframes oa-tail { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-8deg); } }

    /* Poción: el color sigue a la poción elegida; las burbujas suben sin parar (es un brebaje). */
    .oa-liquid { fill: var(--potion, #9b5de5); transition: fill 300ms ease; }
    .oa-bubble { fill: color-mix(in srgb, var(--potion, #9b5de5) 40%, #fff); opacity: 0; transform-origin: center;
      animation: oa-bubble 2.2s linear infinite; }
    .oa-bubble--2 { animation-delay: .7s; }
    .oa-bubble--3 { animation-delay: 1.4s; }
    @keyframes oa-bubble { 0% { opacity: 0; transform: translateY(0) scale(.6); } 20% { opacity: .9; } 100% { opacity: 0; transform: translateY(-22px) scale(1); } }

    /* Reloj de arena: se da vuelta una vez al abrir y la arena cae. */
    .oa-hourglass { transform-origin: center; animation: oa-flip 800ms var(--oa-ease-in-out) 160ms backwards; }
    @keyframes oa-flip { from { transform: rotate(-180deg); } }
    .oa-sand-stream { stroke-dasharray: 3 3; animation: oa-sand .6s linear infinite; }
    @keyframes oa-sand { to { stroke-dashoffset: -6; } }

    @media (prefers-reduced-motion: reduce) {
      svg *, .oa-halo { animation: none !important; }
      .oa-lid, .oa-liquid { transition: none; }
      .oa-drop, .oa-coin, .oa-bubble { display: none; }
    }
  `],
})
export class TableObjectArtComponent {
  @Input() action: TavernTableAction = 'book';
  /** Cofre abierto (recompensa del día reclamada). */
  @Input() open = false;
}
