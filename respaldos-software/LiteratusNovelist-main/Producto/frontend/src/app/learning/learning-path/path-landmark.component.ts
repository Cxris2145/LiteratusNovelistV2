import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Los edificios conservan su silueta incluso cuando la etapa está bloqueada. */
@Component({
  selector: 'app-path-landmark',
  template: `
    <svg *ngIf="kind === 'castle'" viewBox="0 0 180 156" aria-hidden="true">
      <ellipse cx="90" cy="143" rx="76" ry="10" fill="#071722" opacity=".55"/>
      <path d="M19 135L28 115H150L165 137L133 148H47Z" fill="#487267" stroke="#243d45" stroke-width="3"/>
      <path d="M31 75H63V133H31ZM117 75H149V133H117Z" fill="#788e9a" stroke="#26374d" stroke-width="3"/>
      <path d="M27 74L47 45L67 74ZM113 74L133 45L153 74Z" fill="#5f4c88" stroke="#332c59" stroke-width="3"/>
      <path d="M59 100H121V137H59ZM70 50H110V117H70Z" fill="#a0acb4" stroke="#35485a" stroke-width="3"/>
      <path d="M65 52L90 17L115 52Z" fill="#66508e" stroke="#332c59" stroke-width="3"/>
      <path class="landmark-flag" d="M91 18V2L114 7L92 13" fill="#e7b965" stroke="#7f6138" stroke-width="2"/>
      <path d="M59 99V88H69V94H79V88H89V94H99V88H109V94H121V100" fill="#c0c5c3" stroke="#35485a" stroke-width="3"/>
      <path d="M78 137V117A12 12 0 0 1 102 117V137" fill="#202b42" stroke="#dac397" stroke-width="3"/>
      <path d="M91 117V136M84 126H99" stroke="#775f4a" stroke-width="2"/>
      <path class="landmark-light" d="M84 68A6 6 0 0 1 96 68V80H84ZM42 88H51V102H42ZM129 88H138V102H129Z" fill="#f7d58e"/>
      <path d="M37 116H48M126 116H141M77 91H103M63 111H72M108 129H116" stroke="#637b8b" stroke-width="3"/>
      <path d="M25 132L19 118L26 102L34 119L30 133M151 134L145 118L153 100L162 122L158 136" fill="#315852"/>
    </svg>
    <svg *ngIf="kind === 'games'" viewBox="0 0 150 130" aria-hidden="true">
      <ellipse cx="76" cy="118" rx="62" ry="8" fill="#071722" opacity=".55"/>
      <path d="M24 66H126V112L76 124L24 112Z" fill="#79624f" stroke="#2d3445" stroke-width="3"/>
      <path d="M18 68L76 24L132 68L118 77L76 45L32 78Z" fill="#654d89" stroke="#352d56" stroke-width="3"/>
      <path d="M27 70V112M122 71V112M48 67V119M102 65V118" stroke="#c29967" stroke-width="4"/>
      <path d="M60 117V87Q75 70 90 87V118" fill="#1d2e40" stroke="#c29967" stroke-width="3"/>
      <path class="landmark-light" d="M32 86H43V101H32ZM108 86H119V101H108Z" fill="#f7d58e"/>
      <path d="M54 51L76 41L98 51V66L76 77L54 66Z" fill="#1c3844" stroke="#e7b965" stroke-width="2"/>
      <path d="M66 57H74M70 53V61M81 54H84M87 60H90" stroke="#e7b965" stroke-width="3" stroke-linecap="round"/>
      <path class="landmark-flag" d="M77 25V6L99 11L78 19" fill="#e7b965" stroke="#7f6138" stroke-width="2"/>
      <path d="M15 111L21 92L28 114M128 114L137 93L141 113" fill="#3b6457"/>
    </svg>
    <svg *ngIf="kind === 'chest'" class="chest-art" [class.chest-open]="opened" viewBox="0 0 150 128" aria-hidden="true">
      <ellipse cx="75" cy="113" rx="62" ry="9" fill="#071722" opacity=".5"/>
      <g class="chest-rays" fill="#ffe5a1"><path d="M70 78L59 9L76 0L89 79Z"/><path d="M60 82L19 28L37 18L70 79Z"/><path d="M82 79L109 16L128 27L94 86Z"/></g>
      <path d="M23 66H127V107Q76 124 23 107Z" fill="#78503d" stroke="#362e39" stroke-width="4"/>
      <path d="M25 77L75 89L125 77M74 89V117M37 83V111M112 83V112" fill="none" stroke="#b07a49" stroke-width="3"/>
      <g class="chest-lid">
        <path d="M21 68V49Q24 22 75 21Q126 22 129 49V68L75 83Z" fill="#a27147" stroke="#362e39" stroke-width="4"/>
        <path d="M24 49L75 63L126 49M75 25V62" fill="none" stroke="#d6a65a" stroke-width="4"/>
        <path d="M40 31V72M109 32V73" stroke="#e7b965" stroke-width="9"/>
        <path d="M68 64H83V89H68Z" fill="#e7b965" stroke="#846439" stroke-width="2"/>
        <circle cx="76" cy="75" r="3" fill="#4b3e35"/>
      </g>
      <path d="M42 85V113M108 86V114" stroke="#d7a85e" stroke-width="8"/>
      <path d="M72 99L77 94L82 99L77 105Z" fill="#e7b965"/>
    </svg>
  `,
  styles: [`
    :host { display:block; width:100%; height:100%; }
    svg { display:block; width:100%; height:100%; overflow:visible; }
    .landmark-flag { transform-box:fill-box; transform-origin:left center; animation:flag-wave 4s ease-in-out infinite; }
    .landmark-light { filter:drop-shadow(0 0 5px #ffcc73); animation:window-glow 4.5s ease-in-out infinite; }
    .chest-rays { opacity:0; transform-origin:75px 90px; transform:scaleY(.1); transition:opacity .8s ease-out,transform .8s ease-out; }
    .chest-lid { transform-origin:75px 67px; transition:transform .7s ease-out; }
    .chest-open .chest-lid { transform:translateY(-22px) rotate(-17deg); }
    .chest-open .chest-rays { opacity:.7; transform:scaleY(1); }
    :host-context(.scene-paused) * { animation-play-state:paused!important; }
    @keyframes flag-wave { 50% { transform:skewY(-8deg) scaleX(.88); } }
    @keyframes window-glow { 0%, 100% { opacity:1; } 40% { opacity:.72; } 55% { opacity:.95; } 70% { opacity:.8; } }
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathLandmarkComponent {
  @Input() kind: 'castle' | 'games' | 'chest' = 'castle';
  @Input() opened = false;
}
