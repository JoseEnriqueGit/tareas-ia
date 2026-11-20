// Prueba de Deno (npm test). Temporizador del cambio de día con la app abierta (S14.6, S15.2).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { addDays, todayIn } from '../../supabase/functions/_shared/dates.ts';
import { msUntilNextDay } from './dayTimer.ts';

const SECOND = 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

Deno.test('msUntilNextDay: a las 23:59:30 en Santo Domingo faltan 30 s (+1 s de holgura)', () => {
  // 23:59:30 del 20 en Santo Domingo (UTC-4) = 03:59:30 UTC del 21.
  assertEquals(msUntilNextDay(new Date('2026-11-21T03:59:30Z')), 31 * SECOND);
});

Deno.test('msUntilNextDay: justo a medianoche local espera al día siguiente, no 0', () => {
  assertEquals(msUntilNextDay(new Date('2026-11-21T04:00:00Z')), DAY + SECOND);
});

Deno.test('msUntilNextDay: al mediodía local faltan 12 h', () => {
  assertEquals(msUntilNextDay(new Date('2026-11-20T16:00:00Z')), 12 * HOUR + SECOND);
});

Deno.test('msUntilNextDay: cambio de año (31 dic 23:59:59 local)', () => {
  const now = new Date('2027-01-01T03:59:59Z');
  assertEquals(todayIn(now), '2026-12-31');
  assertEquals(msUntilNextDay(now), 2 * SECOND);
  assertEquals(todayIn(new Date(now.getTime() + msUntilNextDay(now))), '2027-01-01');
});

Deno.test('msUntilNextDay: siempre positivo y despierta ya en el día siguiente (cada 7 min de un día)', () => {
  const start = Date.parse('2026-11-20T00:00:00Z');
  for (let at = start; at < start + DAY + HOUR; at += 7 * 60_000) {
    const now = new Date(at);
    const delay = msUntilNextDay(now);
    assert(delay >= SECOND && delay <= DAY + SECOND, `${now.toISOString()}: ${delay}`);
    assertEquals(todayIn(new Date(at + delay)), addDays(todayIn(now), 1), now.toISOString());
  }
});

Deno.test('msUntilNextDay: usa la medianoche de Santo Domingo, no la de UTC', () => {
  // 01:00 UTC del 21 = 21:00 del 20 en Santo Domingo: faltan 3 h. Con la medianoche UTC del 21 saldría -1 h.
  const now = new Date('2026-11-21T01:00:00Z');
  const utcMidnight = Date.parse(`${addDays(todayIn(now), 1)}T00:00:00Z`) - now.getTime() + SECOND;
  assert(utcMidnight < 0);
  assertEquals(msUntilNextDay(now), 3 * HOUR + SECOND);
});
