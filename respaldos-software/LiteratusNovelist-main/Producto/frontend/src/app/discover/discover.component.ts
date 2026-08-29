import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

/* ────────────────────────────────────────────────────────────────────
   Mood definitions: each maps to a filter function used to segment
   the book pool into thematic rows.
   ──────────────────────────────────────────────────────────────────── */
interface Mood {
  id: string;
  label: string;
  icon: string;
  filterFn: (b: any) => boolean;
}

interface MatchPair {
  from: any;
  to: any;
}

@Component({
  selector: 'app-discover',
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.css'
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  allBooks: any[] = [];
  isLoading = true;

  /* ── Hero ── */
  heroBook: any = null;
  private heroRefreshInterval: any;

  /* ── TTS ── */
  private ttsUtterance: SpeechSynthesisUtterance | null = null;
  isPlaying = false;
  currentAudioBook: any = null;

  /* ── Mood Picker ── */
  activeMood: string | null = null;
  moods: Mood[] = [
    { id: 'all', label: 'Todo', icon: 'apps', filterFn: () => true },
    { id: 'dark', label: 'Algo oscuro', icon: 'dark_mode', filterFn: (b) => this.hasTag(b, 'terror') || this.hasTag(b, 'policíaca') || this.hasTag(b, 'suspense') },
    { id: 'brave', label: 'Sentirme valiente', icon: 'swords', filterFn: (b) => this.hasTag(b, 'acción') || this.hasTag(b, 'aventura') || this.hasTag(b, 'mitos') || this.hasTag(b, 'leyendas') },
    { id: 'short', label: 'Lectura rápida', icon: 'timer', filterFn: (b) => {
      const time = String(b.estimated_reading_time || '');
      return time.includes('15') || time.includes('20') || time.includes('30') || this.hasTag(b, 'cuentos') || this.hasTag(b, 'novela corta') || this.hasTag(b, 'antologías');
    } },
    { id: 'reflect', label: 'Para reflexionar', icon: 'psychology', filterFn: (b) => this.hasTag(b, 'filosofía') || this.hasTag(b, 'ensayos') || this.hasTag(b, 'psicología') || this.hasTag(b, 'sociedad') },
    { id: 'love', label: 'Un poco de romance', icon: 'favorite', filterFn: (b) => this.hasTag(b, 'romántica') || this.hasTag(b, 'erótica') || this.hasTag(b, 'poesía') },
  ];

  /* ── Rows ── */
  trendingBooks: any[] = [];
  iaBooks: any[] = [];
  quickBooks: any[] = [];
  quoteBooks: any[] = [];
  matchPairs: MatchPair[] = [];

  /* ── Saved for later (in-memory + localStorage) ── */
  savedIds: Set<string> = new Set();

  /* ── Hover state for row cards ── */
  hoverBook: any = null;

  @ViewChild('trendingTrack') trendingTrack!: ElementRef;
  @ViewChild('iaTrack') iaTrack!: ElementRef;
  @ViewChild('quickTrack') quickTrack!: ElementRef;

  ngOnInit(): void {
    this.loadSaved();
    this.loadBooks();
  }

  ngOnDestroy(): void {
    this.stopAudio();
    if (this.heroRefreshInterval) clearInterval(this.heroRefreshInterval);
  }

  /* ═══════════════════════════════════════════════════════════════════
     DATA LOADING
     ═══════════════════════════════════════════════════════════════════ */
  private loadBooks(): void {
    this.isLoading = true;
    this.api.get<any>('catalog/books/?ordering=-view_count,-created_at&page_size=50').subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res.results ?? []);
        // Filter books with synopsis (needed for quotes & TTS)
        let validBooks = data.filter((b: any) => b.synopsis && b.synopsis.trim().length > 0);

        // Shuffle
        validBooks.sort(() => 0.5 - Math.random());
        this.allBooks = validBooks;

        // Pick hero (first book, refresh every 30s)
        this.setHeroBook();
        this.heroRefreshInterval = setInterval(() => this.setHeroBook(), 30000);

        // Build rows
        this.buildRows();

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error al cargar descubrir:', err);
        this.isLoading = false;
      }
    });
  }

  private setHeroBook(): void {
    if (this.allBooks.length === 0) return;
    const idx = Math.floor(Math.random() * Math.min(12, this.allBooks.length));
    this.heroBook = this.allBooks[idx];
  }

  private buildRows(pool: any[] = this.allBooks): void {

    // Trending: top viewed + featured first
    this.trendingBooks = [...pool]
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 15);

    // IA Books: hardcoded slugs that have IA characters
    const iaSlugs = new Set([
      'el-gato-negro-allan-poe-edgar',
      'el-principe-feliz-y-otros-cuentos-wilde-oscar',
      'la-metamorfosis-kafka-franz',
      'las-metamorfosis-ovidio',
      'el-corazon-delator-allan-poe-edgar',
      'alicia-en-el-pais-de-las-maravillas-carroll-lewis',
      'el-cuervo-allan-poe-edgar',
      'la-caida-de-la-casa-usher-allan-poe-edgar'
    ]);
    this.iaBooks = pool.filter(b => iaSlugs.has(b.slug));

    // Quick reads: estimated reading time < 30 min or short page count
    this.quickBooks = pool.filter(b => {
      const time = String(b.estimated_reading_time || '');
      return time.includes('15') || time.includes('20') || time.includes('30') || time.includes('min');
    }).slice(0, 15);
    if (this.quickBooks.length < 6) {
      this.quickBooks = [...this.quickBooks, ...pool.slice(0, 15 - this.quickBooks.length)];
    }

    // Teaser cards: 3 random books with a snippet from their synopsis
    this.quoteBooks = pool.slice(0, 3);

    // Matchmaker: "If you liked X, try Y" pairs
    this.matchPairs = this.buildMatchPairs(pool.slice(0, 20));
  }

  private buildMatchPairs(pool: any[]): MatchPair[] {
    const pairs: MatchPair[] = [];
    if (pool.length < 2) return pairs;
    // Create 4 pairs by genre similarity
    for (let i = 0; i < 4 && i < pool.length; i++) {
      const from = pool[i];
      // Find a "to" book with similar genre but different author
      const to = pool.find(b => b.id !== from.id && b.genres?.[0]?.id === from.genres?.[0]?.id) || pool[(i + 5) % pool.length];
      pairs.push({ from, to });
    }
    return pairs;
  }

  /* ═══════════════════════════════════════════════════════════════════
     MOOD FILTER
     ═══════════════════════════════════════════════════════════════════ */
  setMood(moodId: string): void {
    if (this.activeMood === moodId) {
      this.activeMood = null; // toggle off
    } else {
      this.activeMood = moodId;
    }

    const mood = this.moods.find(m => m.id === this.activeMood);
    const filter = mood ? mood.filterFn : () => true;

    const filtered = this.activeMood ? this.allBooks.filter(filter) : this.allBooks;

    // Rebuild all rows from filtered pool so nothing stays unfiltered
    this.buildRows(filtered);
  }

  /* ═══════════════════════════════════════════════════════════════════
     HERO TEASER — Extract a snippet from synopsis
     ═══════════════════════════════════════════════════════════════════ */
  getSynopsisSnippet(book: any): string {
    if (!book?.synopsis) return '';
    const text = book.synopsis.trim();
    // Try to extract an impactful sentence (first or second sentence)
    const sentences = text.split(/[.!?]/).map((s: string) => s.trim()).filter((s: string) => s.length > 20 && s.length < 200);
    if (sentences.length === 0) return text.slice(0, 180) + '...';
    // Pick the second sentence if it exists and is good, otherwise first
    const pick = sentences.length > 1 ? sentences[1] : sentences[0];
    return pick + '.';
  }

  /* ═══════════════════════════════════════════════════════════════════
     FOMO / SOCIAL PROOF — Simulated "now reading" count
     ═══════════════════════════════════════════════════════════════════ */
  getNowReadingCount(book: any): number {
    // Deterministic hash-based pseudo-random count so it stays stable
    const hash = this.hashString(book.id || book.slug || '0');
    return 12 + (hash % 487); // 12 to 499
  }

  private hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAVE FOR LATER
     ═══════════════════════════════════════════════════════════════════ */
  saveForLater(book: any): void {
    const id = book.id || book.slug;
    if (this.savedIds.has(id)) {
      this.savedIds.delete(id);
    } else {
      this.savedIds.add(id);
    }
    this.persistSaved();
  }

  isSaved(book: any): boolean {
    return this.savedIds.has(book.id || book.slug);
  }

  private loadSaved(): void {
    try {
      const raw = localStorage.getItem('discover_saved');
      if (raw) {
        const ids = JSON.parse(raw);
        this.savedIds = new Set(ids);
      }
    } catch {
      this.savedIds = new Set();
    }
  }

  private persistSaved(): void {
    localStorage.setItem('discover_saved', JSON.stringify([...this.savedIds]));
  }

  /* ═══════════════════════════════════════════════════════════════════
     TTS / AUDIO
     ═══════════════════════════════════════════════════════════════════ */
  toggleAudio(book: any): void {
    if (this.isPlaying && this.currentAudioBook === book) {
      this.stopAudio();
      return;
    }
    const text = book?.synopsis?.slice(0, 350);
    if (!text) return;
    this.stopAudio();
    if (typeof SpeechSynthesisUtterance !== 'undefined') {
      this.ttsUtterance = new SpeechSynthesisUtterance(text);
      this.ttsUtterance.lang = 'es-ES';
      this.ttsUtterance.rate = 0.92;

      this.ttsUtterance.onstart = () => {
        this.isPlaying = true;
        this.currentAudioBook = book;
      };

      this.ttsUtterance.onend = () => {
        this.isPlaying = false;
        this.currentAudioBook = null;
      };

      this.ttsUtterance.onerror = () => {
        this.isPlaying = false;
        this.currentAudioBook = null;
      };

      if (window.speechSynthesis) {
        window.speechSynthesis.speak(this.ttsUtterance);
      }
    } else {
      console.warn("SpeechSynthesisUtterance not available in this WebView");
    }
  }

  stopAudio(): void {
    window.speechSynthesis.cancel();
    this.isPlaying = false;
    this.currentAudioBook = null;
    this.ttsUtterance = null;
  }

  /* ═══════════════════════════════════════════════════════════════════
     NAVIGATION
     ═══════════════════════════════════════════════════════════════════ */
  goToBook(book: any): void {
    if (book?.slug) {
      this.router.navigate(['/book', book.slug]);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     UTILS
     ═══════════════════════════════════════════════════════════════════ */
  private hasTag(book: any, tagName: string): boolean {
    if (!book.tags) return false;
    return book.tags.some((t: any) => {
      const name = (t.name || '').toLowerCase();
      return name.includes(tagName.toLowerCase());
    });
  }
}
