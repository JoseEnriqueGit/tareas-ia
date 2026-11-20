// Idempotencia del chat por clientId (S14.5, S15.1). El mensaje del usuario se guarda ANTES de
// ejecutar herramientas: es la reserva. Un índice único (user_id, meta->>'clientId') hace que un
// reintento con el mismo clientId choque (23505) aunque la primera petición siga en curso, así
// que nunca se ejecutan dos veces las herramientas del mismo mensaje.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type SavedMessage = { id: string; role: 'user' | 'assistant'; content: string; meta: unknown; created_at: string };

/** Respuesta HTTP decidida aquí; index.ts solo la serializa. */
export type Outcome = { status: number; body: unknown };

/** Resultado de ejecutar el agente: falló antes de cualquier acción, o hay respuesta que guardar. */
export type RunResult = { kind: 'failed'; status: number; body: unknown } | { kind: 'done'; content: string; meta: unknown };

/** Lo que tarda como máximo una ejecución normal; pasado esto, una reserva sin respuesta se da por muerta. */
export const PROCESSING_WINDOW_MS = 150_000;

export const PROCESSING = {
  error: 'Tu mensaje anterior todavía se está procesando. Espera unos segundos y vuelve a intentarlo.',
  retryable: true,
};
export const STALE = {
  error: 'No pude confirmar si tu mensaje anterior se procesó. Revisa tus tareas antes de enviarlo de nuevo.',
  retryable: false,
};
export const LOOKUP_FAILED = { error: 'No se pudo guardar tu mensaje. Inténtalo de nuevo.', retryable: true };

const MESSAGE_COLUMNS = 'id, role, content, meta, created_at';
const UNIQUE_VIOLATION = '23505';

/**
 * Reintento con un clientId ya reservado. Con respuesta guardada se repite; sin ella, la primera
 * ejecución sigue en curso (reserva reciente) o murió sin confirmar (no se reprocesa: podría duplicar).
 */
export function decideOnConflict(reservation: SavedMessage, reply: SavedMessage | null, now: Date): Outcome {
  if (reply) return { status: 200, body: { messages: [reservation, reply], replayed: true } };
  // Reserva reciente = otra petición sigue ejecutando; vieja = murió sin responder (no se reprocesa).
  const age = now.getTime() - Date.parse(reservation.created_at);
  return { status: 409, body: age < PROCESSING_WINDOW_MS ? PROCESSING : STALE };
}

/**
 * Busca la reserva de ese clientId y la primera respuesta guardada después. Cualquier error de
 * lectura es 503: nunca se reprocesa en silencio. RLS ya limita al propio chat; el filtro por
 * user_id es una defensa extra (revisión R1).
 */
async function lookUp(db: SupabaseClient, userId: string, clientId: string, now: Date): Promise<Outcome> {
  const { data: reservation, error } = await db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('user_id', userId)
    .eq('role', 'user')
    .eq('meta->>clientId', clientId)
    .maybeSingle();
  // Sin fila tras chocar con el índice: se liberó justo ahora. Se pide reintentar.
  if (error || !reservation) return { status: 503, body: LOOKUP_FAILED };
  const { data: reply, error: replyError } = await db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('user_id', userId)
    .eq('role', 'assistant')
    // La respuesta lleva el mismo clientId: se encuentra la de este mensaje y no la siguiente en el tiempo.
    .eq('meta->>clientId', clientId)
    .maybeSingle();
  if (replyError) return { status: 503, body: LOOKUP_FAILED };
  return decideOnConflict(reservation as SavedMessage, (reply as SavedMessage | null) ?? null, now);
}

/**
 * Reserva el mensaje, ejecuta el agente una sola vez y guarda solo la respuesta. Si la ejecución
 * falla antes de cualquier acción, borra la reserva para que el reintento pueda ejecutarse.
 * `clock` se inyecta en las pruebas.
 */
export async function handleWithReservation(
  db: SupabaseClient,
  input: { userId: string; clientId: string; message: string },
  run: () => Promise<RunResult>,
  clock: () => Date = () => new Date(),
): Promise<Outcome> {
  const { userId, clientId, message } = input;
  // Reservar primero: si dos peticiones llegan a la vez, solo una inserta y la otra choca con 23505.
  const { data: reserved, error } = await db
    .from('chat_messages')
    .insert({ user_id: userId, role: 'user', content: message, meta: { clientId } })
    .select(MESSAGE_COLUMNS)
    .single();
  // 23505 = ya existe esa reserva: se consulta su estado en vez de ejecutar de nuevo.
  if (error?.code === UNIQUE_VIOLATION) return lookUp(db, userId, clientId, clock());
  if (error || !reserved) {
    if (error) console.error('chat reservation error', error.message);
    return { status: 503, body: LOOKUP_FAILED };
  }
  const reservation = reserved as SavedMessage;

  const result = await run();
  // Solo se libera si no se ejecutó nada; con acciones hechas, liberar permitiría duplicarlas al reintentar.
  if (result.kind === 'failed') {
    const { error: releaseError } = await db.from('chat_messages').delete().eq('id', reservation.id).eq('user_id', userId);
    // Si no se pudo liberar, el reintento verá "se está procesando" y, pasada la ventana, "no pude confirmar".
    if (releaseError) console.error('chat reservation release error', releaseError.message);
    return { status: result.status, body: result.body };
  }

  // La respuesta queda después de la reserva aunque el reloj de la función vaya detrás del de la base.
  const createdAt = new Date(Math.max(clock().getTime(), Date.parse(reservation.created_at) + 1)).toISOString();
  // El clientId en la respuesta permite emparejarla con su reserva al reintentar.
  const meta = { ...((result.meta as object | null) ?? {}), clientId };
  const row = { user_id: userId, role: 'assistant' as const, content: result.content, meta, created_at: createdAt };
  const { data: saved, error: saveError } = await db.from('chat_messages').insert(row).select(MESSAGE_COLUMNS).single();
  if (saveError) console.error('chat save error', saveError.message);
  const assistant = (saved as SavedMessage | null) ??
    { id: `local-${Date.parse(createdAt)}`, role: 'assistant', content: row.content, meta: row.meta, created_at: createdAt };
  return { status: 200, body: { messages: [reservation, assistant] } };
}
