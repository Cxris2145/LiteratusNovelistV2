import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioCacheService {
  private dbName = 'literatus_audio_cache';
  private storeName = 'audio_buffers';
  private dbVersion = 1;
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event: any) => {
        console.error('Error abriendo IndexedDB:', event.target.errorCode);
        reject(event.target.error);
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Genera una clave única para la caché basada en la voz y el texto.
   */
  private generateKey(voiceId: string, text: string): string {
    // Un hash simple o solo concatenar si el texto no es gigante
    return `${voiceId}_${text.trim()}`;
  }

  /**
   * Guarda un ArrayBuffer crudo de audio en IndexedDB.
   */
  async saveAudio(voiceId: string, text: string, buffer: ArrayBuffer): Promise<void> {
    try {
      const db = await this.dbPromise;
      const key = this.generateKey(voiceId, text);
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        const request = store.put({
          id: key,
          data: buffer,
          timestamp: Date.now()
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('No se pudo guardar en caché de audio', e);
    }
  }

  /**
   * Recupera un ArrayBuffer de IndexedDB si existe.
   */
  async getAudio(voiceId: string, text: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.dbPromise;
      const key = this.generateKey(voiceId, text);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = (event: any) => {
          if (event.target.result) {
            resolve(event.target.result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Error leyendo caché de audio', e);
      return null;
    }
  }

  /**
   * Limpia toda la caché de audio.
   */
  async clearCache(): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error limpiando caché', e);
    }
  }
}
