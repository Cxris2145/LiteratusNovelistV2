import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';

/**
 * La hora del día en La Taberna. Sigue el sol de la zona horaria del lector: de día entra luz por
 * los ventanales, de tarde el cielo se pone dorado, al anochecer (y al amanecer) queda el rosado
 * del crepúsculo y de noche brillan las estrellas.
 */
export type TavernLight = 'day' | 'dusk' | 'twilight' | 'night';

export interface TavernLightInfo {
  light: TavernLight;
  /** Cómo se lee en la sala: "De día", "De tarde", "Atardece", "Amanece", "De noche". */
  label: string;
  /** Zona horaria usada, para el título del indicador. */
  zone: string;
}

/** Coordenadas aproximadas de las zonas horarias más probables (lat, lon; oeste negativo). */
const ZONE_COORDS: Record<string, [number, number]> = {
  'America/Santiago': [-33.45, -70.67],
  'America/Punta_Arenas': [-53.16, -70.91],
  'Pacific/Easter': [-27.11, -109.35],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Argentina/Cordoba': [-31.42, -64.18],
  'America/Argentina/Mendoza': [-32.89, -68.83],
  'America/Lima': [-12.05, -77.04],
  'America/La_Paz': [-16.5, -68.15],
  'America/Bogota': [4.71, -74.07],
  'America/Guayaquil': [-2.19, -79.89],
  'America/Caracas': [10.48, -66.9],
  'America/Montevideo': [-34.9, -56.16],
  'America/Asuncion': [-25.26, -57.58],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Mexico_City': [19.43, -99.13],
  'America/Monterrey': [25.69, -100.32],
  'America/Tijuana': [32.51, -117.04],
  'America/Guatemala': [14.63, -90.51],
  'America/El_Salvador': [13.69, -89.22],
  'America/Tegucigalpa': [14.07, -87.19],
  'America/Managua': [12.11, -86.24],
  'America/Costa_Rica': [9.93, -84.08],
  'America/Panama': [8.98, -79.52],
  'America/Havana': [23.11, -82.37],
  'America/Santo_Domingo': [18.49, -69.93],
  'America/Puerto_Rico': [18.47, -66.11],
  'America/New_York': [40.71, -74.0],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Toronto': [43.65, -79.38],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/London': [51.51, -0.13],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Rome': [41.9, 12.5],
};

const MINUTE = 60_000;
/** Cuánto dura cada tramo alrededor de la salida y la puesta del sol. */
const TWILIGHT_BEFORE_SUNRISE = 40 * MINUTE;
const TWILIGHT_AFTER_SUNRISE = 30 * MINUTE;
const AFTERNOON_BEFORE_SUNSET = 180 * MINUTE;
const TWILIGHT_AFTER_SUNSET = 40 * MINUTE;

const OVERRIDES: Record<string, TavernLight> = {
  dia: 'day', 'día': 'day', day: 'day',
  tarde: 'dusk', dusk: 'dusk',
  crepusculo: 'twilight', 'crepúsculo': 'twilight', twilight: 'twilight',
  noche: 'night', night: 'night',
};

const rad = (deg: number) => deg * Math.PI / 180;
const deg = (r: number) => r * 180 / Math.PI;

/**
 * Salida y puesta del sol (ms) para la fecha local de `date` en (lat, lon), con la ecuación de
 * salida del sol. Devuelve null en el sol de medianoche o la noche polar.
 */
export function sunTimes(date: Date, lat: number, lon: number): { rise: number; set: number } | null {
  const julianNoon = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) / 86_400_000 + 2440587.5;
  const n = Math.round(julianNoon - 2451545.0 + 0.0008);
  const meanNoon = n - lon / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const center = 1.9148 * Math.sin(rad(anomaly)) + 0.02 * Math.sin(rad(2 * anomaly)) + 0.0003 * Math.sin(rad(3 * anomaly));
  const longitude = (anomaly + center + 180 + 102.9372) % 360;
  const transit = 2451545.0 + meanNoon + 0.0053 * Math.sin(rad(anomaly)) - 0.0069 * Math.sin(rad(2 * longitude));
  const declination = Math.asin(Math.sin(rad(longitude)) * Math.sin(rad(23.4397)));
  const cosHour = (Math.sin(rad(-0.833)) - Math.sin(rad(lat)) * Math.sin(declination))
    / (Math.cos(rad(lat)) * Math.cos(declination));
  if (cosHour < -1 || cosHour > 1) return null;
  const hour = deg(Math.acos(cosHour));
  const toMs = (julian: number) => (julian - 2440587.5) * 86_400_000;
  return { rise: toMs(transit - hour / 360), set: toMs(transit + hour / 360) };
}

/** La luz de la sala en un instante. Sin coordenadas conocidas, el sol sale a las 7:00 y se pone a las 19:30. */
export function tavernLightAt(date: Date, zone: string): TavernLightInfo {
  const coords = ZONE_COORDS[zone];
  let sun = coords ? sunTimes(date, coords[0], coords[1]) : null;
  if (!sun) {
    const local = (h: number, m: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime();
    sun = { rise: local(7, 0), set: local(19, 30) };
  }
  const now = date.getTime();
  let light: TavernLight;
  let label: string;
  if (now < sun.rise - TWILIGHT_BEFORE_SUNRISE || now >= sun.set + TWILIGHT_AFTER_SUNSET) {
    light = 'night'; label = 'De noche';
  } else if (now < sun.rise + TWILIGHT_AFTER_SUNRISE) {
    light = 'twilight'; label = 'Amanece';
  } else if (now >= sun.set) {
    light = 'twilight'; label = 'Atardece';
  } else if (now >= sun.set - AFTERNOON_BEFORE_SUNSET) {
    light = 'dusk'; label = 'De tarde';
  } else {
    light = 'day'; label = 'De día';
  }
  return { light, label, zone };
}

const LABELS: Record<TavernLight, string> = { day: 'De día', dusk: 'De tarde', twilight: 'Atardece', night: 'De noche' };

/**
 * Mantiene la luz al día mientras alguien mira la sala (se revisa una vez por minuto).
 * `?luz=dia|tarde|crepusculo|noche` en la dirección fija una hora, para mirar cada versión.
 */
@Injectable({ providedIn: 'root' })
export class TavernDaylightService implements OnDestroy {
  private zone = inject(NgZone);
  private timer: ReturnType<typeof setInterval> | null = null;
  private watchers = 0;
  readonly info = signal<TavernLightInfo>(this.compute());

  /** Empieza a seguir la hora; devuelve la función para dejar de hacerlo. */
  watch(): () => void {
    this.watchers++;
    this.refresh();
    if (!this.timer) {
      this.zone.runOutsideAngular(() => {
        this.timer = setInterval(() => this.refresh(), MINUTE);
      });
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.watchers = Math.max(0, this.watchers - 1);
      if (!this.watchers) this.stop();
    };
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private refresh(): void {
    const next = this.compute();
    const current = this.info();
    if (next.light === current.light && next.label === current.label) return;
    this.zone.run(() => this.info.set(next));
  }

  private compute(): TavernLightInfo {
    let zone = 'UTC';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch { /* navegador sin Intl: queda el horario fijo */ }
    const forced = typeof location !== 'undefined'
      ? OVERRIDES[(new URLSearchParams(location.search).get('luz') || '').toLowerCase()]
      : undefined;
    if (forced) return { light: forced, label: LABELS[forced], zone };
    return tavernLightAt(new Date(), zone);
  }
}
