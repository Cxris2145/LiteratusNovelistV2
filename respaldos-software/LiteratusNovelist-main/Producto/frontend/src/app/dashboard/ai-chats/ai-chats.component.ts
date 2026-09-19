import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-ai-chats',
  templateUrl: './ai-chats.component.html',
  styleUrls: ['./ai-chats.component.css']
})
export class AIChatsComponent implements OnInit {
  summary: any = null;
  topCharacters: any[] = [];
  characterSessions: any[] = [];
  assistantConversations: any[] = [];
  loading = true;
  activeView: 'characters' | 'assistant' = 'characters';

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadAIData();
  }

  loadAIData(): void {
    this.loading = true;
    this.dashboardService.getAIChats().subscribe({
      next: (res) => {
        this.summary = res.summary || null;
        this.topCharacters = res.top_characters || [];
        this.characterSessions = res.character_sessions || [];
        this.assistantConversations = res.assistant_conversations || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setView(view: 'characters' | 'assistant'): void {
    this.activeView = view;
  }
}
