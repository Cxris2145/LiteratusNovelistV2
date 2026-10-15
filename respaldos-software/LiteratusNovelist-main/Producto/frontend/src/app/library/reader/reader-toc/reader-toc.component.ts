import { Component, inject } from '@angular/core';

import { ReaderComponent } from '../reader.component';
import { PageBookmark, ReaderAnnotationsService } from '../reader-annotations.service';

/**
 * Índice del lector (panel a la derecha; en el celular, hoja inferior con asa): capítulos con su página, marcadores, el resumen hasta
 * donde voy, buscar y vocabulario. En el celular también lleva lo que no cabe en la barra del
 * libro (Personajes, Cuaderno, Post-it, Favorito). Abrirlo y cerrarlo lo decide el lector.
 */
@Component({
  selector: 'app-reader-toc',
  templateUrl: './reader-toc.component.html',
  styleUrl: './reader-toc.component.css',
})
export class ReaderTocComponent {
  readonly r = inject(ReaderComponent);
  readonly a = inject(ReaderAnnotationsService);

  tocTab: 'chapters' | 'bookmarks' = 'chapters';

  trackBookmark = (_: number, bookmark: PageBookmark) => bookmark.id;
}
