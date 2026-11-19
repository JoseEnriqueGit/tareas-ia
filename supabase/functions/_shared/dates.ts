// Manejo de fechas en la zona horaria del usuario (RF-19).
// Archivo sin dependencias: lo usan la Edge Function (Deno) y el frontend (Vite).
// Las fechas límite son días de calendario en formato ISO "YYYY-MM-DD".

export const TIME_ZONE = 'America/Santo_Domingo';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Día de calendario de `now` en la zona horaria dada (no en UTC). */
export function todayIn(now: Date, timeZone = TIME_ZONE): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Hora local "HH:MM" de `now` en la zona horaria dada. */
export function timeIn(now: Date, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayName(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Contexto de fechas para el prompt del agente. Los modelos pequeños se equivocan
 * sumando días, así que se les da la tabla ya resuelta: los 7 días siguientes a hoy
 * contienen cada día de la semana exactamente una vez, y "el viernes" es siempre el
 * próximo viernes (si hoy es viernes, el de la semana que viene).
 */
export function dateContext(now: Date, timeZone = TIME_ZONE): string {
  const today = todayIn(now, timeZone);
  const lines = [
    `Ahora: ${weekdayName(today)} ${today}, ${timeIn(now, timeZone)} (${timeZone}).`,
    `Hoy: ${today}. Mañana: ${addDays(today, 1)}. Pasado mañana: ${addDays(today, 2)}.`,
    'Próximos días (usa esta tabla para "el lunes", "el viernes", etc.):',
  ];
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, i);
    lines.push(`- ${weekdayName(day)}: ${day}`);
  }
  lines.push(`"Esta semana" va de ${today} a ${endOfWeek(today)} (domingo).`);
  return lines.join('\n');
}

/** Domingo de la semana (lunes a domingo) que contiene `isoDate`. */
export function endOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(isoDate, (7 - weekday) % 7);
}

export type TaskView = 'today' | 'upcoming' | 'overdue' | 'done';

/** Vista a la que pertenece una tarea (RF-06). Sin fecha => Próximas. */
export function taskView(task: { status: string; due_date: string | null }, today: string): TaskView {
  if (task.status === 'done') return 'done';
  if (!task.due_date) return 'upcoming';
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  return 'upcoming';
}
