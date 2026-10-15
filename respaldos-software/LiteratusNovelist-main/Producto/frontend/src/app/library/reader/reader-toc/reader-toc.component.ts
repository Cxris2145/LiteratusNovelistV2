import { Component, inject } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

import { ReaderComponent } from '../reader.component';
import { PageBookmark, ReaderAnnotationsService } from '../reader-annotations.service';

/**
 * Índice del lector (panel a la derecha): capítulos con su página, marcadores, el resumen hasta
 * donde voy, buscar y vocabulario. En el celular también lleva lo que no cabe en la barra del
 * libro (Personajes, Cuaderno, Post-it, Favorito). Abrirlo y cerrarlo lo decide el lector.
 */
@Component({
  selector: 'app-reader-toc',
  templateUrl: './reader-toc.component.html',
  styleUrl: './reader-toc.component.css',
  animations: [
    trigger('slideFromRight', [
      state('in', style({ transform: 'translateX(0%)' })),
      state('out', style({ transform: 'translateX(100%)' })),
      transition('in <=> out', animate('350ms ease-in-out')),
    ]),
  ],
})
export class ReaderTocComponent {
  readonly r = inject(ReaderComponent);
  readonly a = inject(ReaderAnnotationsService);

  tocTab: 'chapters' | 'bookmarks' = 'chapters';

  trackBookmark = (_: number, bookmark: PageBookmark) => bookmark.id;
}
