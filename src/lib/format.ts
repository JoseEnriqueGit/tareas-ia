import { TIME_ZONE, weekdayName } from '../../supabase/functions/_shared/dates.ts';

/** Iniciales para el avatar: "Ana Pérez" -> "AP". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Jueves 19 de noviembre" para el encabezado. */
export function longDate(isoDate: string): string {
  const name = weekdayName(isoDate);
  return `${name[0].toUpperCase()}${name.slice(1)} ${Number(isoDate.slice(8, 10))} de ${MONTHS[Number(isoDate.slice(5, 7)) - 1]}`;
}

/** Hora local "10:42" de un instante, en la zona horaria del usuario. */
export function timeOf(instant: string | number): string {
  return new Intl.DateTimeFormat('es-DO', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant));
}

/** Clave de localStorage con la hora de la última carga de tareas (para el aviso sin conexión). */
export const tasksSavedAtKey = (userId: string) => `tasks:${userId}:at`;
