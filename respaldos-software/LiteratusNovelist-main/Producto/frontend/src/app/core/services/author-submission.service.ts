import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthorSubmissionItem {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  status: 'pending_review' | 'published' | 'rejected' | 'draft';
  is_published: boolean;
  cover: string | null;
  difficulty_level: string;
  chapters_count: number;
  word_count: number;
  editorial_notes: string;
  created_at: string;
  updated_at: string;
}

export interface AuthorRequirementsResponse {
  minimum_requirements: Array<{
    code: string;
    label: string;
    description: string;
    mandatory: boolean;
  }>;
  guidelines: {
    formats: string[];
    max_file_size_mb: number;
    recommended_cover_aspect_ratio: string;
    review_sla_hours: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthorSubmissionService {
  private apiUrl = `${environment.apiUrl}catalog/author`;

  constructor(private http: HttpClient) {}

  getRequirements(): Observable<AuthorRequirementsResponse> {
    return this.http.get<AuthorRequirementsResponse>(`${this.apiUrl}/requirements/`);
  }

  getMySubmissions(): Observable<{ count: number; submissions: AuthorSubmissionItem[] }> {
    return this.http.get<{ count: number; submissions: AuthorSubmissionItem[] }>(`${this.apiUrl}/my-submissions/`);
  }

  submitBook(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/submit-book/`, formData);
  }
}
