import { Injectable, NgZone } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';

export interface PlayerPosition {
  userId: string;
  x: number;
  y: number;
  dir: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class MultiplayerService {
  private supabase: SupabaseClient;
  private channel!: RealtimeChannel;
  
  // Observable for when other players move
  public playerMoved$ = new Subject<PlayerPosition>();
  
  private userId: string | null = null;

  constructor(private ngZone: NgZone) {
    // Initialize Supabase client
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  public connect(userId: string) {
    this.userId = userId;
    
    // Only connect if we have a valid URL (not the placeholder)
    if (environment.supabaseUrl.includes('REEMPLAZA')) {
      console.warn('Multijugador deshabilitado: Faltan credenciales de Supabase en environment.ts');
      return;
    }

    this.channel = this.supabase.channel('tavern_room', {
      config: {
        broadcast: { ack: false } // No need for acks for movement
      }
    });

    this.channel
      .on('broadcast', { event: 'pos' }, (payload: any) => {
        // Run inside Angular zone so UI updates properly if needed
        this.ngZone.run(() => {
          const data = payload['payload'] as PlayerPosition;
          if (data && data.userId !== this.userId) {
            this.playerMoved$.next(data);
          }
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('¡Conectado a la Taberna en tiempo real!');
        }
      });
  }

  public broadcastPosition(x: number, y: number, dir: string) {
    if (!this.channel || !this.userId) return;

    this.channel.send({
      type: 'broadcast',
      event: 'pos',
      payload: {
        userId: this.userId,
        x,
        y,
        dir,
        timestamp: Date.now()
      }
    }).catch(err => {
      // Ignore errors if rate limited
    });
  }

  public disconnect() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
    }
  }
}
