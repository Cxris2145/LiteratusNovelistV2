import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashboardBooksService {
  private apiUrl = `${environment.apiUrl}dashboard`;

  constructor(private http: HttpClient) {}

  getBooks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/books/`);
  }

  getAuthors(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/authors/`);
  }

  getGenres(): Observable<any[]> {
    // Usamos el catálogo público o el dashboard si existiera, pero catálogo público sirve
    return this.http.get<any[]>(`${environment.apiUrl}catalog/genres/`);
  }

  getAuthorDetail(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/authors/${id}/`);
  }
    

  parseEpub(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('epub', file);
    return this.http.post<any>(`${this.apiUrl}/books/parse-epub/`, formData);
  }

  saveBook(bookData: any, epubFile?: File, coverFile?: File, id?: string, pdfFile?: File): Observable<any> {
    const formData = new FormData();
    if (epubFile) {
      formData.append('epub', epubFile);
    }
    if (coverFile) {
      formData.append('cover', coverFile);
    }
    if (pdfFile) {
      formData.append('pdf_file', pdfFile);
    }
    
    // Añadir metadatos
    formData.append('title', bookData.title);
    formData.append('author_name', bookData.author_name);
    if (bookData.author_id) {
      formData.append('author_id', bookData.author_id);
    }
    formData.append('synopsis', bookData.synopsis);
    formData.append('price', bookData.price || '990');
    formData.append('tags', bookData.tags || '');
    formData.append('status', bookData.status || 'draft');
    formData.append('difficulty_level', bookData.difficulty_level || 'intermediate');
    formData.append('copyright_notice', bookData.copyright_notice || '');
    formData.append('is_published', String(bookData.is_published));
    formData.append('is_featured', String(bookData.is_featured));
    
    // Añadir géneros si existen
    if (bookData.genres && bookData.genres.length > 0) {
      formData.append('genres', JSON.stringify(bookData.genres));
    }
    
    
    // Añadir capítulos como JSON string
    formData.append('chapters', JSON.stringify(bookData.chapters));

    if (id) {
      return this.http.put<any>(`${this.apiUrl}/books/${id}/`, formData);
    }
    return this.http.post<any>(`${this.apiUrl}/books/save/`, formData);
  }

  getBookDetail(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/books/${id}/`);
  }

  deleteBook(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/books/${id}/`);
  }

  getAvatarDetail(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/avatars/${id}/`);
  }

  saveAvatar(data: any, file?: File, editionId?: string, avatarId?: string, imgSpeaking1?: File, imgSpeaking2?: File, imgSpeaking3?: File, imgThinking?: File): Observable<any> {
    const formData = new FormData();
    if (file) {
      formData.append('avatar_image', file);
    }
    if (imgSpeaking1) {
      formData.append('image_speaking_1', imgSpeaking1);
    }
    if (imgSpeaking2) {
      formData.append('image_speaking_2', imgSpeaking2);
    }
    if (imgSpeaking3) {
      formData.append('image_speaking_3', imgSpeaking3);
    }
    if (imgThinking) {
      formData.append('image_thinking', imgThinking);
    }
    formData.append('name', data.name);
    formData.append('description', data.description || '');
    formData.append('system_prompt', data.system_prompt || '');
    formData.append('behavioral_context', data.behavioral_context || '');
    formData.append('sample_dialogues', data.sample_dialogues || '');
    formData.append('greeting_message', data.greeting_message || '');
    formData.append('is_author', String(data.is_author || false));
    formData.append('is_major_character', String(data.is_major_character !== false));
    formData.append('unlock_at_chapter', String(data.unlock_at_chapter || 0));
    formData.append('temperature', String(data.temperature ?? 0.70));
    formData.append('model_name', data.model_name || 'gemini-2.5-flash');
    if (editionId) {
      formData.append('edition_id', editionId);
    }
    
    if (avatarId) {
      return this.http.put<any>(`${this.apiUrl}/avatars/${avatarId}/`, formData);
    } else {
      return this.http.post<any>(`${this.apiUrl}/avatars/`, formData);
    }
  }

  deleteAvatar(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/avatars/${id}/`);
  }

  saveFullAuthor(authorData: any, photo?: File): Observable<any> {
    const formData = new FormData();
    if (photo) {
      formData.append('photo', photo);
    }
    Object.keys(authorData).forEach(key => {
      if (authorData[key] !== null && authorData[key] !== undefined) {
        formData.append(key, authorData[key]);
      }
    });

    if (authorData.id) {
      return this.http.put<any>(`${this.apiUrl}/authors/${authorData.id}/`, formData);
    }
    return this.http.post<any>(`${this.apiUrl}/authors/`, formData);
  }

  deleteAuthor(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/authors/${id}/`);
  }

  getAllAvatars(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/avatars/all/`);
  }

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/`);
  }
    
  uploadChapterImage(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ url: string }>(`${this.apiUrl}/books/upload-image/`, formData);
  }
}
