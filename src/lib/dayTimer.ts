// Temporizador del cambio de día con la app abierta (S14.6). Archivo puro: lo usan useToday.ts y las pruebas de Deno.
import { addDays, startOfDayUtc, TIME_ZONE, todayIn } from '../../supabase/functions/_shared/dates.ts';

/** Holgura para no despertar justo antes de la medianoche. */
const MARGIN_MS = 1000;

/** Milisegundos hasta poco después de la próxima medianoche en la zona dada (no en UTC). Siempre ≥ 1 s. */
export function msUntilNextDay(now: Date, timeZone = TIME_ZONE): number {
  const nextDay = Date.parse(startOfDayUtc(addDays(todayIn(now, timeZone), 1), timeZone));
  // Nunca 0 ni negativo: un retraso así volvería a llamar a update() en bucle.
  return Math.max(MARGIN_MS, nextDay - now.getTime() + MARGIN_MS);
}
