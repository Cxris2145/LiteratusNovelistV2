import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    // Usar un parámetro de query (timestamp) para evitar caché agresivo del navegador
    // Esto es mucho más seguro que inyectar cabeceras Cache-Control, lo cual rompe CORS
    let safeParams = params || new HttpParams();
    safeParams = safeParams.set('_t', new Date().getTime().toString());
    
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: safeParams });
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body);
  }

  patch<T>(endpoint: string, body: any): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
  }

  getBlob(endpoint: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${endpoint}`, { responseType: 'blob' });
  }
}
