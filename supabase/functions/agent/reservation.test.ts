import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  decideOnConflict,
  handleWithReservation,
  LOOKUP_FAILED,
  PROCESSING,
  PROCESSING_WINDOW_MS,
  type RunResult,
  type SavedMessage,
  STALE,
} from './reservation.ts';

const USER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CLIENT = '0b6f7a3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b';
const T0 = '2026-11-20T10:00:00.000Z';

const reservation: SavedMessage = { id: 'u1', role: 'user', content: 'Cobrar a Juan', meta: { clientId: CLIENT }, created_at: T0 };
const reply: SavedMessage = { id: 'a1', role: 'assistant', content: 'Creé 1 tarea.', meta: null, created_at: '2026-11-20T10:00:00.001Z' };
const at = (ms: number) => new Date(Date.parse(T0) + ms);

/**
 * Base falsa: cada `from()` toma la siguiente respuesta `{ data, error }` del guion y la devuelve al resolverse.
 * `calls` registra cada método con sus argumentos.
 */
function scriptedDb(script: { data?: unknown; error?: { code?: string; message: string } }[]) {
  const calls: [string, ...unknown[]][] = [];
  return {
    calls,
    from(table: string) {
      calls.push(['from', table]);
      const step = script.shift() ?? {};
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => resolve({ data: step.data ?? null, error: step.error ?? null }),
      };
      for (const method of ['select', 'insert', 'delete', 'eq', 'gt', 'order', 'limit', 'maybeSingle', 'single']) {
        query[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return query;
        };
      }
      return query;
    },
  };
}

const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint' };
const input = { userId: USER, clientId: CLIENT, message: 'Cobrar a Juan' };

/** Ejecución del agente que registra si se llamó (no debe llamarse en un reintento). */
function spyRun(result: RunResult) {
  const spy = { calls: 0, run: () => { spy.calls++; return Promise.resolve(result); } };
  return spy;
}
const done: RunResult = { kind: 'done', content: 'Creé 1 tarea.', meta: { summary: 'Creé 1 tarea.' } };

Deno.test('decideOnConflict: si ya hay respuesta guardada, se repite sin procesar', () => {
  assertEquals(decideOnConflict(reservation, reply, at(1_000)), {
    status: 200,
    body: { messages: [reservation, reply], replayed: true },
  });
});

Deno.test('decideOnConflict: sin respuesta y reserva reciente, sigue procesando (409 reintentable)', () => {
  assertEquals(decideOnConflict(reservation, null, at(0)), { status: 409, body: PROCESSING });
  assertEquals(decideOnConflict(reservation, null, at(PROCESSING_WINDOW_MS - 1)), { status: 409, body: PROCESSING });
  assertEquals(PROCESSING, {
    error: 'Tu mensaje anterior todavía se está procesando. Espera unos segundos y vuelve a intentarlo.',
    retryable: true,
  });
});

Deno.test('decideOnConflict: sin respuesta y reserva de 150 s o más, no se confirma (409 no reintentable)', () => {
  assertEquals(PROCESSING_WINDOW_MS, 150_000);
  assertEquals(decideOnConflict(reservation, null, at(PROCESSING_WINDOW_MS)), { status: 409, body: STALE });
  assertEquals(decideOnConflict(reservation, null, at(10 * 60_000)), { status: 409, body: STALE });
  assertEquals(STALE, {
    error: 'No pude confirmar si tu mensaje anterior se procesó. Revisa tus tareas antes de enviarlo de nuevo.',
    retryable: false,
  });
});

Deno.test('reserva al inicio: guarda el mensaje del usuario con su clientId, ejecuta y guarda solo la respuesta después', async () => {
  const assistant = { ...reply, meta: done.meta };
  const db = scriptedDb([{ data: reservation }, { data: assistant }]);
  const spy = spyRun(done);
  const outcome = await handleWithReservation(db as never, input, spy.run, () => at(5));
  assertEquals(outcome, { status: 200, body: { messages: [reservation, assistant] } });
  assertEquals(spy.calls, 1);
  const inserts = db.calls.filter(([method]) => method === 'insert');
  assertEquals(inserts[0][1], { user_id: USER, role: 'user', content: 'Cobrar a Juan', meta: { clientId: CLIENT } });
  assertEquals(inserts[1][1], { user_id: USER, role: 'assistant', content: done.content, meta: { ...(done.meta as object), clientId: CLIENT }, created_at: at(5).toISOString() });
  assert(!db.calls.some(([method]) => method === 'delete'));
});

Deno.test('la respuesta siempre queda después de la reserva aunque el reloj de la función vaya atrasado', async () => {
  const db = scriptedDb([{ data: reservation }, { data: reply }]);
  await handleWithReservation(db as never, input, spyRun(done).run, () => at(-2_000));
  const assistantInsert = db.calls.filter(([method]) => method === 'insert')[1][1] as { created_at: string };
  assertEquals(assistantInsert.created_at, at(1).toISOString());
});

Deno.test('reintento con el mismo clientId y respuesta guardada: se repite sin ejecutar herramientas', async () => {
  const db = scriptedDb([{ error: UNIQUE }, { data: reservation }, { data: reply }]);
  const spy = spyRun(done);
  const outcome = await handleWithReservation(db as never, input, spy.run, () => at(60_000));
  assertEquals(outcome, { status: 200, body: { messages: [reservation, reply], replayed: true } });
  assertEquals(spy.calls, 0);
  assert(db.calls.some(([method, column, value]) => method === 'eq' && column === 'meta->>clientId' && value === CLIENT));
  // La respuesta se busca por el mismo clientId (no por ser la siguiente en el tiempo).
  assertEquals(db.calls.filter(([method, column, value]) => method === 'eq' && column === 'meta->>clientId' && value === CLIENT).length, 2);
  assert(!db.calls.some(([method]) => method === 'gt'));
  // Defensa además de RLS: ambas búsquedas filtran por el usuario.
  assertEquals(db.calls.filter(([method, column, value]) => method === 'eq' && column === 'user_id' && value === USER).length, 2);
  assertEquals(db.calls.filter(([method]) => method === 'insert').length, 1);
});

Deno.test('reintento mientras la primera petición sigue en curso: 409 reintentable, sin ejecutar ni guardar', async () => {
  const db = scriptedDb([{ error: UNIQUE }, { data: reservation }, { data: null }]);
  const spy = spyRun(done);
  assertEquals(await handleWithReservation(db as never, input, spy.run, () => at(3_000)), { status: 409, body: PROCESSING });
  assertEquals(spy.calls, 0);
  assertEquals(db.calls.filter(([method]) => method === 'insert').length, 1);
  assert(!db.calls.some(([method]) => method === 'delete'));
});

Deno.test('reintento de una reserva vieja sin respuesta (la primera ejecución murió): 409 no reintentable, sin ejecutar', async () => {
  const db = scriptedDb([{ error: UNIQUE }, { data: reservation }, { data: null }]);
  const spy = spyRun(done);
  assertEquals(await handleWithReservation(db as never, input, spy.run, () => at(PROCESSING_WINDOW_MS)), { status: 409, body: STALE });
  assertEquals(spy.calls, 0);
});

Deno.test('cualquier error al reservar o al buscar: 503 reintentable y nunca se reprocesa en silencio', async () => {
  assertEquals(LOOKUP_FAILED, { error: 'No se pudo guardar tu mensaje. Inténtalo de nuevo.', retryable: true });
  const cases = [
    [{ error: { code: '42501', message: 'permission denied' } }],
    [{ error: UNIQUE }, { error: { message: 'timeout' } }],
    [{ error: UNIQUE }, { data: null }],
    [{ error: UNIQUE }, { data: reservation }, { error: { message: 'timeout' } }],
  ];
  for (const script of cases) {
    const spy = spyRun(done);
    const db = scriptedDb(script);
    assertEquals(await handleWithReservation(db as never, input, spy.run, () => at(1_000)), { status: 503, body: LOOKUP_FAILED });
    assertEquals(spy.calls, 0);
    assertEquals(db.calls.filter(([method]) => method === 'insert').length, 1);
  }
});

Deno.test('si la ejecución falla antes de cualquier acción, se borra la reserva propia y se devuelve el error', async () => {
  const failed: RunResult = { kind: 'failed', status: 502, body: { error: 'La IA no respondió.', retryable: true } };
  const db = scriptedDb([{ data: reservation }, { data: null }]);
  const outcome = await handleWithReservation(db as never, input, spyRun(failed).run, () => at(5));
  assertEquals(outcome, { status: 502, body: { error: 'La IA no respondió.', retryable: true } });
  assert(db.calls.some(([method]) => method === 'delete'));
  assert(db.calls.some(([method, column, value]) => method === 'eq' && column === 'id' && value === reservation.id));
  assert(db.calls.some(([method, column, value]) => method === 'eq' && column === 'user_id' && value === USER));
  // No se guarda respuesta del asistente.
  assertEquals(db.calls.filter(([method]) => method === 'insert').length, 1);
});

Deno.test('si no se pudo guardar la respuesta, se devuelve igual con un id local (la reserva queda)', async () => {
  const db = scriptedDb([{ data: reservation }, { error: { message: 'timeout' } }]);
  const outcome = await handleWithReservation(db as never, input, spyRun(done).run, () => at(5));
  const messages = (outcome.body as { messages: SavedMessage[] }).messages;
  assertEquals(outcome.status, 200);
  assertEquals(messages[0], reservation);
  assertEquals(messages[1].role, 'assistant');
  assertEquals(messages[1].content, done.content);
  assert(messages[1].id.startsWith('local-'));
  assert(!db.calls.some(([method]) => method === 'delete'));
});
