import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type NotificationType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'ink'
  | 'xp'
  | 'level_up'
  | 'achievement';

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  amount?: number;
  icon?: string;
  duration?: number; // ms, 0 = persistent
  action?: NotificationAction;
  createdAt: number;
  isClosing?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSource = new BehaviorSubject<AppNotification[]>([]);
  public notifications$: Observable<AppNotification[]> = this.notificationsSource.asObservable();

  private counter = 0;
  private readonly defaultDuration = 4200;

  /**
   * Muestra una notificación con opciones completas.
   */
  show(notification: Omit<AppNotification, 'id' | 'createdAt'>): string {
    const id = `notif-${Date.now()}-${++this.counter}`;
    const duration = notification.duration !== undefined ? notification.duration : this.defaultDuration;

    const newNotification: AppNotification = {
      ...notification,
      id,
      duration,
      createdAt: Date.now(),
      icon: notification.icon || this.getDefaultIcon(notification.type)
    };

    // Máximo 4 notificaciones simultáneas en pantalla para no saturar la vista
    const current = this.notificationsSource.value;
    const nextList = [...current, newNotification].slice(-4);
    this.notificationsSource.next(nextList);

    return id;
  }

  success(message: string, title: string = 'Éxito', duration?: number): string {
    return this.show({
      type: 'success',
      title,
      message,
      duration
    });
  }

  error(message: string, title: string = 'Atención', duration?: number): string {
    return this.show({
      type: 'error',
      title,
      message,
      duration: duration ?? 5500
    });
  }

  warning(message: string, title: string = 'Aviso', duration?: number): string {
    return this.show({
      type: 'warning',
      title,
      message,
      duration: duration ?? 4800
    });
  }

  info(message: string, title: string = 'Información', duration?: number): string {
    return this.show({
      type: 'info',
      title,
      message,
      duration
    });
  }

  gamify(
    type: 'ink' | 'xp' | 'level_up' | 'achievement',
    amount: number | undefined,
    message: string,
    title?: string
  ): string {
    const titles: Record<string, string> = {
      ink: 'Tinta Obtenida',
      xp: 'Experiencia Ganada',
      level_up: '¡Subida de Nivel!',
      achievement: '¡Logro Desbloqueado!'
    };

    return this.show({
      type,
      title: title || titles[type] || 'Recompensa',
      message,
      amount,
      duration: 5000
    });
  }

  dismiss(id: string): void {
    const list = this.notificationsSource.value;
    const item = list.find(n => n.id === id);
    if (!item) return;

    // Marcamos como cerrando para animación de salida
    item.isClosing = true;
    this.notificationsSource.next([...list]);

    setTimeout(() => {
      this.notificationsSource.next(
        this.notificationsSource.value.filter(n => n.id !== id)
      );
    }, 280);
  }

  clear(): void {
    this.notificationsSource.next([]);
  }

  private getDefaultIcon(type: NotificationType): string {
    switch (type) {
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'auto_stories';
      case 'ink':
        return 'ink_pen';
      case 'xp':
        return 'military_tech';
      case 'level_up':
        return 'workspace_premium';
      case 'achievement':
        return 'emoji_events';
      default:
        return 'notifications';
    }
  }
}
