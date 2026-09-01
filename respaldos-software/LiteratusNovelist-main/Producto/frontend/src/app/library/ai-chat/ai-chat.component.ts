import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ChatService, ChatMessage } from '../../core/services/chat.service';
import { ActivatedRoute, Router } from '@angular/router';
import { KokoroTtsService } from '../../core/services/kokoro-tts.service';

@Component({
  selector: 'app-ai-chat',
  templateUrl: './ai-chat.component.html',
  styleUrl: './ai-chat.component.css'
})
export class AiChatComponent implements OnInit, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public chatService = inject(ChatService);
  public kokoroVoice = inject(KokoroTtsService);
  
  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;

  // Datos del Personaje Actual
  avatarId?: number;
  session?: any;
  avatar: any = null;
  messages: ChatMessage[] = [];
  recentCharacters: any[] = [];
  
  newMessage: string = '';
  isWriting: boolean = false;
  realTimeVoiceActive: boolean = false;

  kokoroProcessing$ = this.kokoroVoice.isProcessing$;
  kokoroSpeaking$ = this.kokoroVoice.isSpeaking$;
  engineMode$ = this.kokoroVoice.engineMode$;
  kokoroDownloading$ = this.kokoroVoice.isDownloadingModel$;
  kokoroProgress$ = this.kokoroVoice.downloadProgress$;

  toggleKokoroEngine() {
    if (this.kokoroVoice.engineMode$.value === 'local') {
      this.kokoroVoice.setRemoteEngine();
    } else {
      const confirmed = window.confirm('⚠️ Nota: La voz neuronal local descarga un modelo de IA en tu navegador.\n\nSe recomienda tener un equipo con tarjeta gráfica dedicada (GPU) para evitar lentitud. ¿Estás seguro de que deseas continuar y activar el motor local?');
      if (confirmed) {
        this.kokoroVoice.downloadLocalEngine();
      }
    }
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('session_id');
      if (id) {
        this.avatarId = +id;
        console.log("Cargando chat para Avatar ID:", this.avatarId);
        this.loadChatSession();
      }
    });
    this.loadRecentCharacters();
    
    // Suscribirse a mensajes globales del servicio
    this.chatService.messages$.subscribe(msgs => {
      this.messages = msgs;
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  loadChatSession() {
    if (!this.avatarId) return;

    // Limpiar estados previos e iniciar timers de seguridad
    this.avatar = null;
    this.session = null;

    // Timer de seguridad: si en 6 segundos no hay respuesta, mostrar error
    const safetyTimer = setTimeout(() => {
      if (!this.avatar) {
        this.avatar = { name: 'Error de Conexión', description: 'El servidor está tardando demasiado en responder. Por favor, refresca la página.' };
      }
      if (!this.session) {
        this.session = { id: 'timeout' };
      }
    }, 6000);

    // 1. Obtener detalles del avatar
    this.chatService.getAvatar(this.avatarId).subscribe({
      next: (data) => {
        clearTimeout(safetyTimer);
        this.avatar = data;
      },
      error: (err) => {
        clearTimeout(safetyTimer);
        console.error("Error cargando avatar", err);
        this.avatar = { name: 'No disponible', description: 'No se pudo conectar con el servidor.' };
      }
    });

    // 2. Obtener o crear sesión
    this.chatService.getSession(this.avatarId).subscribe({
      next: (session) => {
        this.session = session;
        this.chatService.loadSessionMessages(session.id).subscribe();
      },
      error: (err) => {
        console.error("Error cargando sesión", err);
        this.session = { id: 'error' };
      }
    });
  }

  loadRecentCharacters() {
    this.chatService.getRecentAvatars().subscribe(data => {
      this.recentCharacters = data;
    });
  }

  scrollToBottom(): void {
    try {
      this.myScrollContainer.nativeElement.scrollTop = this.myScrollContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }

  async toggleVoice() {
    this.realTimeVoiceActive = !this.realTimeVoiceActive;
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.session) return;

    const textToSend = this.newMessage;
    this.newMessage = '';
    this.isWriting = true;

    this.chatService.sendMessage(this.session.id, textToSend).subscribe({
      next: (res) => {
        this.isWriting = false;
        if (this.realTimeVoiceActive) {
          this.kokoroVoice.speak(res.reply, this.avatarId || 1);
        }
      },
      error: () => {
        this.isWriting = false;
      }
    });
  }

  selectCharacter(id: number) {
    this.router.navigate(['/chat', id]);
  }

  goBack() {
    this.router.navigate(['/characters']);
  }

  formatMessage(text: string): string {
    if (!text) return '';
    // Reemplaza **texto** por <strong>texto</strong>
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }
}
