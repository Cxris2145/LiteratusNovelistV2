import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, timer } from 'rxjs';
import { expand, filter, switchMap, take, timeout } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface ReadingSummaryContent {
  title: string;
  overview: string;
  plot_recap: string[];
  key_events: string[];
  characters_status: { name: string; status: string }[];
  current_cliffhanger: string;
}

export interface ReadingSummaryResponse {
  status: 'ready' | 'generating' | 'missing' | 'unavailable';
  summary?: ReadingSummaryContent;
  message?: string;
}

const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;
const GENERATION_TIMEOUT_MS = 120000;

@Injectable({ providedIn: 'root' })
export class ReadingSummaryService {
  private api = inject(ApiService);

  /** Inicia una generación y consulta el mismo capítulo hasta obtener el resultado. */
  load(inventoryId: string, upToChapter: number): Observable<ReadingSummaryResponse> {
    const endpoint = `library/inventory/${inventoryId}/reading-summary/`;
    const params = new HttpParams().set('up_to_chapter', upToChapter);
    return this.api.post<ReadingSummaryResponse>(endpoint, { up_to_chapter: upToChapter }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      expand(response => response.status === 'generating'
        ? timer(POLL_INTERVAL_MS).pipe(
          switchMap(() => this.api.get<ReadingSummaryResponse>(endpoint, params).pipe(
            timeout(REQUEST_TIMEOUT_MS)
          ))
        )
        : EMPTY),
      filter(response => response.status !== 'generating'),
      take(1),
      // El plazo también termina una generación que responde siempre "generating".
      timeout(GENERATION_TIMEOUT_MS)
    );
  }
}
