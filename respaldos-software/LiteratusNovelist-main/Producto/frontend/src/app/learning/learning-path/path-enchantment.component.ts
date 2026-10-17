import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** The illustrated landscape stays still; these small vector layers bring each realm to life. */
@Component({
  selector: 'app-path-enchantment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-realm]': 'realm',
    '[class.is-paused]': 'paused',
  },
  template: `
    <span class="mote" *ngFor="let mote of motes; let i = index"
      [class.is-snow]="realm === 'aurora'" [class.is-firefly]="realm === 'forest'"
      [style.left.%]="mote.x" [style.top.%]="mote.y"
      [style.--drift]="mote.drift + 'px'" [style.--rise]="mote.rise + 'px'"
      [style.--duration]="mote.duration + 's'" [style.--delay]="mote.delay + 's'"
      [style.--size]="mote.size + 'px'"></span>

    <ng-container [ngSwitch]="realm">
      <ng-container *ngSwitchCase="'forest'">
        <svg *ngFor="let butterfly of butterflies" class="butterfly" viewBox="0 0 80 60"
          [style.left.%]="butterfly.x" [style.top.%]="butterfly.y"
          [style.--delay]="butterfly.delay + 's'" [style.--tilt]="butterfly.tilt + 'deg'">
          <g class="butterfly-trail" fill="#e7ffb6">
            <circle cx="13" cy="48" r="1.7"/><circle cx="6" cy="53" r="1"/>
            <circle cx="20" cy="43" r="1.2"/>
          </g>
          <g class="wing wing-left">
            <path d="M39 31C28 6 6 6 11 25C13 34 25 35 39 31Z" fill="#c5f8ab"/>
            <path d="M39 31C23 28 14 36 22 45C29 52 35 40 39 31Z" fill="#a9d6b0"/>
            <path d="M16 20L35 29M25 41L35 34" stroke="#fbf7b4" stroke-width="1.5"/>
          </g>
          <g class="wing wing-right">
            <path d="M41 31C52 6 74 6 69 25C67 34 55 35 41 31Z" fill="#dcf8bb"/>
            <path d="M41 31C57 28 66 36 58 45C51 52 45 40 41 31Z" fill="#aedcba"/>
            <path d="M64 20L45 29M55 41L45 34" stroke="#fff5bd" stroke-width="1.5"/>
          </g>
          <path d="M40 24V40M39 24L35 19M41 24L45 19" stroke="#fcf2aa" stroke-width="2.2" stroke-linecap="round" fill="none"/>
          <circle cx="40" cy="24" r="2.7" fill="#fff7be"/>
        </svg>
      </ng-container>

      <ng-container *ngSwitchCase="'lake'">
        <svg *ngFor="let side of waterSides" class="moon-water" viewBox="0 0 300 420"
          [class.on-right]="side === 'right'" preserveAspectRatio="none">
          <g class="water-reflection" fill="none" stroke="#d2f5ff" stroke-linecap="round">
            <path d="M132 55H168M124 69H177M135 85H163" stroke-width="3" opacity=".75"/>
            <path d="M110 104H188M121 123H174M102 143H199" stroke-width="4" opacity=".5"/>
            <path d="M117 169H181M93 195H207M108 222H192" stroke-width="4" opacity=".35"/>
            <path d="M124 255H177M97 286H202M118 319H185" stroke-width="3" opacity=".25"/>
          </g>
          <g class="water-rings" fill="none" stroke="#b2e6f6" stroke-width="1.5">
            <ellipse class="water-ring ring-one" cx="150" cy="170" rx="52" ry="9"/>
            <ellipse class="water-ring ring-two" cx="150" cy="170" rx="52" ry="9"/>
            <ellipse class="water-ring ring-three" cx="145" cy="290" rx="43" ry="7"/>
          </g>
        </svg>
        <span class="silver-star" *ngFor="let star of stars"
          [style.left.%]="star.x" [style.top.%]="star.y" [style.--delay]="star.delay + 's'"></span>
      </ng-container>

      <ng-container *ngSwitchCase="'library'">
        <svg class="floating-book" *ngFor="let book of books" viewBox="0 0 160 110"
          [style.left.%]="book.x" [style.top.%]="book.y"
          [style.--book-size]="book.size + 'px'" [style.--tilt]="book.tilt + 'deg'"
          [style.--delay]="book.delay + 's'">
          <ellipse cx="80" cy="67" rx="69" ry="25" fill="#d7c4ff" opacity=".09"/>
          <path d="M13 34Q45 25 80 48Q114 25 147 34L146 87Q111 80 80 99Q47 81 14 88Z" fill="#45466b" stroke="#ddba76" stroke-width="2"/>
          <path d="M18 29Q48 22 79 43V90Q48 72 18 80ZM142 29Q112 22 81 43V90Q112 72 142 80Z" fill="#f0e5c8" stroke="#c6b58e" stroke-width="1.7" stroke-linejoin="round"/>
          <path class="book-page" d="M81 43Q109 20 137 23V72Q108 72 81 90Z" fill="#fff2d2" stroke="#d4c099" stroke-width="1.2"/>
          <path d="M28 39Q49 37 66 49M28 48Q48 46 66 57M28 58Q48 56 66 66M28 68Q48 65 60 72M95 48Q110 38 128 38M95 57Q110 47 128 47M95 66Q110 56 128 56" fill="none" stroke="#ac9a78" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M80 44V97M80 97L80 102" stroke="#d2aa61" stroke-width="2"/>
          <path d="M104 77V96L110 91L116 96V73" fill="#a889c8" stroke="#d8bfeb" stroke-width="1"/>
          <path d="M36 16V25M31.5 20.5H40.5M135 91V98M131.5 94.5H138.5" stroke="#f3db9c" stroke-width="1.5"/>
        </svg>
      </ng-container>

      <ng-container *ngSwitchCase="'ruins'">
        <svg class="rune-crystal" *ngFor="let crystal of crystals" viewBox="0 0 180 240"
          [style.left.%]="crystal.x > 50 ? null : crystal.x"
          [style.right.%]="crystal.x > 50 ? 4 : null" [style.top.%]="crystal.y"
          [style.--delay]="crystal.delay + 's'" [style.--crystal-size]="crystal.size + 'px'">
          <path class="crystal-beam" d="M90 22L39 188Q90 211 141 188Z" fill="#78e2b0" opacity=".09"/>
          <ellipse class="crystal-glow" cx="90" cy="172" rx="64" ry="17" fill="#91edbe" opacity=".18"/>
          <g transform="translate(90 172) scale(1 .34)">
            <g class="rune-circle" fill="none" stroke="#a5efc2" stroke-width="1.4">
              <circle r="66"/><circle r="54" opacity=".45"/>
              <path d="M-4-62L0-57L4-62M-4 62L0 57L4 62M-62-4L-57 0L-62 4M62-4L57 0L62 4M-45-45L-38-45L-45-38M45-45H38L45-38M-45 45V38L-38 45M45 45V38L38 45" stroke-width="2.2"/>
              <circle cx="0" cy="-60" r="1.5" fill="#ebffcd"/>
            </g>
          </g>
          <g class="crystal-stone" stroke="#b6f6d5" stroke-width="1.1" stroke-linejoin="round">
            <path d="M90 41L114 76L109 130L90 156L69 130L65 76Z" fill="#59b799"/>
            <path d="M90 41L83 82L90 156L69 130L65 76Z" fill="#92dfbb"/>
            <path d="M90 41L114 76L100 86L90 156L83 82Z" fill="#d0f6cf"/>
            <path d="M100 86L114 76L109 130L90 156Z" fill="#3a8e83"/>
            <path d="M65 76L83 82L100 86L114 76M83 82L69 130M100 86L109 130" fill="none" opacity=".7"/>
          </g>
          <path class="crystal-glint" d="M126 70V84M119 77H133M53 120V128M49 124H57" stroke="#e0ffd4" stroke-width="2"/>
        </svg>
      </ng-container>

      <ng-container *ngSwitchCase="'aurora'">
        <span class="aurora-ribbon ribbon-left"></span>
        <span class="aurora-ribbon ribbon-right"></span>
        <span class="silver-star" *ngFor="let star of stars"
          [style.left.%]="star.x" [style.top.%]="star.y" [style.--delay]="star.delay + 's'"></span>
      </ng-container>

      <ng-container *ngSwitchCase="'citadel'">
        <svg class="sky-lantern" *ngFor="let lantern of lanterns" viewBox="0 0 70 130"
          [style.left.%]="lantern.x" [style.top.%]="lantern.y"
          [style.--lantern-size]="lantern.size + 'px'" [style.--delay]="lantern.delay + 's'">
          <path d="M35 0V32" stroke="#d2aa64" stroke-width="1.5"/>
          <path d="M28 43V35Q35 24 42 35V43" fill="none" stroke="#e8c784" stroke-width="2"/>
          <circle class="lantern-glow" cx="35" cy="73" r="30" fill="#ffc875" opacity=".17"/>
          <path d="M20 54H50L46 92H24Z" fill="#6a482f" stroke="#e7c17d" stroke-width="1.8"/>
          <path class="lantern-light" d="M25 58H45L42 86H28Z" fill="#ffd990"/>
          <path d="M21 53L27 43H43L49 53ZM22 94H48L43 99H27Z" fill="#b18b52" stroke="#efd49c" stroke-width="1.4"/>
          <path d="M35 55V91M24 91H46" stroke="#926937" stroke-width="2"/>
          <path d="M35 101V111M31 111H39M35 113V118" stroke="#dfb66d" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="citadel-light light-left"></span>
        <span class="citadel-light light-right"></span>
      </ng-container>
    </ng-container>
  `,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      contain: layout paint;
      mask-image: linear-gradient(90deg, #000 25%, transparent 30%, transparent 70%, #000 75%);
      --mote-color: #e5f4af;
    }

    :host([data-realm='lake']) { --mote-color: #dbf3ff; }
    :host([data-realm='library']) { --mote-color: #e9d4ff; }
    :host([data-realm='ruins']) { --mote-color: #aff6cc; }
    :host([data-realm='aurora']) { --mote-color: #e4f7ff; }
    :host([data-realm='citadel']) { --mote-color: #ffdc99; }

    svg { position: absolute; overflow: visible; }

    .mote {
      position: absolute;
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      background: var(--mote-color);
      box-shadow: 0 0 9px 2px color-mix(in srgb, var(--mote-color) 65%, transparent);
      animation: mote-drift var(--duration) ease-in-out var(--delay) infinite;
    }

    .is-firefly { box-shadow: 0 0 13px 4px #d8f59870; }
    .is-snow { box-shadow: none; opacity: .7; animation-name: snowfall; }

    .butterfly {
      width: clamp(42px, 5.3vw, 76px);
      filter: drop-shadow(0 0 8px #d6f5a878);
      animation: butterfly-flight 8s ease-in-out var(--delay) infinite;
    }

    .wing { transform-origin: 40px 31px; animation: wing-flutter .65s ease-in-out infinite alternate; }
    .wing-right { animation-delay: -.1s; }
    .butterfly-trail { animation: glimmer 2s ease-in-out infinite; }

    .moon-water { left: 1%; top: 41%; width: 27%; height: 57%; opacity: .75; }
    .moon-water.on-right { left: auto; right: 1%; top: 28%; opacity: .55; }
    .water-reflection { animation: reflection-shimmer 5s ease-in-out infinite; }
    .on-right .water-reflection { animation-delay: -2s; }
    .water-ring { transform-box: fill-box; transform-origin: center; animation: ripple 5s ease-out infinite; }
    .ring-two { animation-delay: -2.5s; }
    .ring-three { animation-delay: -1.4s; animation-duration: 6s; }

    .silver-star {
      position: absolute;
      width: 13px;
      height: 13px;
      background: #e6f8ff;
      clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%);
      animation: star-shimmer 4s ease-in-out var(--delay) infinite;
    }

    .floating-book {
      width: clamp(60px, 9vw, var(--book-size));
      filter: drop-shadow(0 0 15px #d7b0ff40);
      animation: book-hover 7s ease-in-out var(--delay) infinite;
    }

    .book-page { transform-origin: 81px 65px; animation: page-breathe 5s ease-in-out var(--delay) infinite; }
    .rune-crystal { width: clamp(90px, 14vw, var(--crystal-size)); }
    .crystal-stone { filter: drop-shadow(0 0 11px #87f3bc90); animation: crystal-hover 6s ease-in-out var(--delay) infinite; }
    .crystal-glow, .crystal-beam { animation: crystal-pulse 4s ease-in-out var(--delay) infinite; }
    .crystal-glint { animation: glimmer 3s ease-in-out var(--delay) infinite; }
    .rune-circle { transform-origin: 0 0; animation: rune-turn 28s linear var(--delay) infinite; }

    .aurora-ribbon {
      position: absolute;
      top: 2%;
      width: 39%;
      height: 31%;
      border-radius: 51% 49% 38% 62%;
      background: linear-gradient(105deg, transparent 8%, #7cd9c619 28%, #9aefcc85 47%, #75c4de59 61%, #a18ae678 74%, transparent 94%);
      filter: blur(12px);
      transform-origin: top center;
      animation: aurora-wave 11s ease-in-out infinite alternate;
      opacity: .8;
    }

    .ribbon-left { left: -8%; --ribbon-tilt: -18deg; }
    .ribbon-right { right: -8%; top: 9%; --ribbon-tilt: 18deg; animation-delay: -7s; animation-duration: 14s; }
    .sky-lantern { width: clamp(32px, 4.8vw, var(--lantern-size)); transform-origin: 50% 0; animation: lantern-sway 7s ease-in-out var(--delay) infinite; }
    .lantern-light { animation: lantern-flicker 3s ease-in-out var(--delay) infinite; }
    .lantern-glow { animation: glimmer 4s ease-in-out var(--delay) infinite; }

    .citadel-light {
      position: absolute;
      top: 48%;
      width: 21%;
      height: 39%;
      border-radius: 50%;
      background: radial-gradient(ellipse, #ffbf6d35, #ffc96b0a 48%, transparent 70%);
      animation: city-glow 7s ease-in-out infinite;
    }

    .light-left { left: -3%; }
    .light-right { right: -3%; top: 25%; animation-delay: -3s; }

    @keyframes mote-drift {
      0%, 100% { transform: translate(0, 0) scale(.7); opacity: .2; }
      35% { opacity: .95; }
      55% { transform: translate(var(--drift), var(--rise)) scale(1.15); opacity: .8; }
      80% { opacity: .35; }
    }

    @keyframes snowfall {
      0% { transform: translate(0, -35px); opacity: 0; }
      15%, 75% { opacity: .75; }
      100% { transform: translate(var(--drift), 95px); opacity: 0; }
    }

    @keyframes butterfly-flight {
      0%, 100% { transform: translate(0, 0) rotate(var(--tilt)); }
      40% { transform: translate(15px, -36px) rotate(calc(var(--tilt) + 9deg)); }
      70% { transform: translate(-12px, -18px) rotate(calc(var(--tilt) - 6deg)); }
    }

    @keyframes wing-flutter { from { transform: scaleX(1); } to { transform: scaleX(.37); } }
    @keyframes glimmer { 0%, 100% { opacity: .24; } 50% { opacity: .85; } }
    @keyframes reflection-shimmer { 0%, 100% { transform: translateY(0) scaleX(.96); opacity: .45; } 50% { transform: translateY(5px) scaleX(1.04); opacity: .95; } }
    @keyframes ripple { 0% { transform: scale(.4); opacity: .65; } 80%, 100% { transform: scale(1.9); opacity: 0; } }
    @keyframes star-shimmer { 0%, 100% { transform: scale(.55) rotate(0); opacity: .15; } 50% { transform: scale(1.15) rotate(14deg); opacity: .9; } }
    @keyframes book-hover { 0%, 100% { transform: translateY(0) rotate(var(--tilt)); } 50% { transform: translateY(-23px) rotate(calc(var(--tilt) + 6deg)); } }
    @keyframes page-breathe { 0%, 100% { transform: skewY(0); } 50% { transform: skewY(-5deg); } }
    @keyframes crystal-hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-17px); } }
    @keyframes crystal-pulse { 0%, 100% { opacity: .08; } 50% { opacity: .3; } }
    @keyframes rune-turn { to { transform: rotate(360deg); } }
    @keyframes aurora-wave { from { transform: translateY(-9px) rotate(var(--ribbon-tilt)) scaleY(.72) skewX(-9deg); } to { transform: translateY(24px) rotate(calc(var(--ribbon-tilt) + 8deg)) scaleY(1.15) skewX(9deg); } }
    @keyframes lantern-sway { 0%, 100% { transform: rotate(-4deg) translateY(0); } 50% { transform: rotate(4deg) translateY(-8px); } }
    @keyframes lantern-flicker { 0%, 100% { opacity: .65; } 44% { opacity: 1; } 52% { opacity: .8; } 75% { opacity: .95; } }
    @keyframes city-glow { 0%, 100% { opacity: .4; } 50% { opacity: .95; } }

    :host(.is-paused) *, :host-context(.motion-reduced) * { animation-play-state: paused !important; }
    :host-context(.motion-reduced) * { animation: none !important; }

    @media (max-width: 600px) {
      .butterfly { width: 44px; }
      .floating-book { width: 61px; }
      .rune-crystal { width: 94px; }
      .sky-lantern { width: 35px; }
      .aurora-ribbon { width: 36%; height: 27%; }
      .silver-star { width: 9px; height: 9px; }
    }

    @media (prefers-reduced-motion: reduce) {
      :host * { animation: none !important; }
      .mote { opacity: .45; }
      .water-ring { opacity: .25; }
    }
  `],
})
export class PathEnchantmentComponent {
  @Input() realm = 'forest';
  @Input() paused = false;

  // All anchors are outside the middle 40%, keeping the route and its labels clear.
  readonly motes = Array.from({ length: 18 }, (_, i) => ({
    x: i % 2 === 0 ? 3 + (i * 7) % 21 : 76 + (i * 9) % 21,
    y: 10 + (i * 17) % 79,
    drift: i % 2 === 0 ? 12 + i % 12 : -12 - i % 12,
    rise: -24 - (i * 7) % 40,
    duration: 5 + (i % 6) * .8,
    delay: -(i * 1.37),
    size: 2.5 + (i % 3) * .85,
  }));

  readonly butterflies = [
    { x: 7, y: 27, tilt: -15, delay: -2 },
    { x: 82, y: 65, tilt: 12, delay: -5 },
  ];
  readonly waterSides = ['left', 'right'];
  readonly stars = [
    { x: 8, y: 17, delay: -.8 }, { x: 23, y: 32, delay: -2.1 },
    { x: 17, y: 74, delay: -3.2 }, { x: 77, y: 20, delay: -1.4 },
    { x: 89, y: 42, delay: -2.8 }, { x: 82, y: 84, delay: -.3 },
  ];
  readonly books = [
    { x: 3, y: 25, size: 130, tilt: -12, delay: -1 },
    { x: 10, y: 67, size: 100, tilt: 8, delay: -4 },
    { x: 81, y: 43, size: 145, tilt: 11, delay: -2.5 },
  ];
  readonly crystals = [
    { x: 3, y: 54, size: 180, delay: -1.5 },
    { x: 79, y: 23, size: 155, delay: -4 },
  ];
  readonly lanterns = [
    { x: 7, y: 17, size: 64, delay: -.4 },
    { x: 21, y: 61, size: 49, delay: -3.2 },
    { x: 85, y: 40, size: 57, delay: -1.8 },
  ];
}
