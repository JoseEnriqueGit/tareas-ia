// Edge Function del agente (RF-12 a RF-20, RF-28).
// Recibe { message, clientId? }, ejecuta el bucle de herramientas y guarda la conversación.
// Usa SIEMPRE el JWT del usuario (nunca service_role), así que RLS aplica a todo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AiError, chatCompletion, type ChatMessage } from './ai.ts';
import { emptyActions, parseClientId, runTool, savedReply, toolDefinitions, type Actions } from './tools.ts';
import { historyForModel, stripInternalNotes, systemPrompt, type StoredMessage } from './history.ts';

const MAX_ITERATIONS = 5;
const HISTORY_LIMIT = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function plural(n: number, singular: string, pluralWord: string) {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

/** Resumen de lo que realmente se ejecutó, armado por el backend y no por el modelo (RF-17). */
function summary(actions: Actions) {
  const parts: string[] = [];
  if (actions.created.length) parts.push(`Creé ${plural(actions.created.length, 'tarea', 'tareas')}`);
  if (actions.completed.length) parts.push(`marqué como hecha${actions.completed.length > 1 ? 's' : ''} ${actions.completed.length}`);
  if (actions.updated.length) parts.push(`actualicé ${actions.updated.length}`);
  return parts.length ? parts.join(', ') + '.' : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // Paso 1: identificar al usuario. Sin JWT válido no se llama a la IA.
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sesión requerida' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await db.auth.getUser(authorization.replace(/^Bearer /, ''));
  if (userError || !userData.user) return json({ error: 'Sesión inválida o vencida. Vuelve a iniciar sesión.' }, 401);
  const userId = userData.user.id;

  // Paso 2: validar el mensaje recibido.
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'Escribe un mensaje.' }, 400);
  if (message.length > 2000) return json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' }, 400);
  const parsedClientId = parseClientId(body?.clientId);
  if (!parsedClientId.ok) return json({ error: 'Identificador de mensaje inválido.', retryable: false }, 400);
  const { clientId } = parsedClientId;

  // S14.5: si este mensaje ya se procesó (el navegador perdió la respuesta y reintenta), se devuelve
  // lo guardado sin volver a llamar al modelo ni a las herramientas, para no duplicar tareas.
  if (clientId) {
    const saved = await savedReply(db, clientId, userId);
    if (saved) return json({ messages: saved, replayed: true });
  }

  // Paso 3: armar la conversación que verá el modelo: instrucciones + historial + mensaje nuevo.
  const [{ data: profile }, { data: history }] = await Promise.all([
    db.from('profiles').select('full_name, role').eq('id', userId).single(),
    db.from('chat_messages').select('role, content, meta').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
  ]);
  const isSupervisor = profile?.role === 'supervisor';
  const team = isSupervisor ? ((await db.from('profiles').select('id, full_name').order('full_name')).data ?? []) : [];
  // Hora de la petición: la usan la tabla de fechas del prompt y los cálculos de las herramientas.
  const requestTime = new Date();

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(profile?.full_name ?? 'el usuario', isSupervisor, team, requestTime, userId) },
    // El historial (con el mensaje nuevo al final) lleva, solo para el modelo, las tareas que se vieron en cada tarjeta.
    ...historyForModel(((history ?? []) as StoredMessage[]).reverse(), message),
  ];

  const actions = emptyActions();
  const hasActions = () =>
    actions.created.length + actions.updated.length + actions.completed.length > 0 || actions.pendingDelete !== null;
  let reply = '';
  let warning = '';

  // Paso 4: bucle con el modelo. Si pide herramientas se ejecutan y se le devuelve el resultado;
  // si responde texto, termina.
  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const answer = await chatCompletion(messages, toolDefinitions);
      if (!answer.tool_calls?.length) {
        // Si el modelo copió la nota interna, se quita antes de guardar o responder.
        reply = stripInternalNotes(answer.content ?? '');
        if (!reply && !hasActions()) throw new AiError('La IA devolvió una respuesta vacía.', 502);
        break;
      }
      messages.push({ ...answer, role: 'assistant' });
      for (const call of answer.tool_calls) {
        const result = await runTool(call.function.name, call.function.arguments, { db, userId, isSupervisor, actions, now: requestTime });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      if (i === MAX_ITERATIONS - 1) warning = 'No pude terminar todo lo que pediste; revisa el resultado.';
    }
  } catch (error) {
    const aiError = error instanceof AiError ? error : new AiError('Error inesperado del asistente.', 500);
    if (!(error instanceof AiError)) console.error(error);
    // Si ya se ejecutaron acciones, no se devuelve error: reintentar duplicaría tareas.
    if (!hasActions()) return json({ error: aiError.message, retryable: aiError.status !== 500 }, aiError.status);
    warning = `La IA falló antes de terminar (${aiError.message}). Esto es lo que alcancé a hacer:`;
  }

  // Paso 5: guardar la conversación y responder al navegador.
  const done = summary(actions);
  const content = [warning, reply || done || 'Listo.'].filter(Boolean).join('\n');
  const meta = { ...actions, summary: done };

  // Se guarda la conversación solo cuando hubo respuesta, para que reintentar no duplique mensajes (RF-20).
  // Horas distintas para que el orden usuario -> asistente sea estable.
  const now = Date.now();
  const rows = [
    { user_id: userId, role: 'user', content: message, meta: clientId ? { clientId } : null, created_at: new Date(now).toISOString() },
    { user_id: userId, role: 'assistant', content, meta, created_at: new Date(now + 1).toISOString() },
  ];
  const { data: saved, error: saveError } = await db
    .from('chat_messages')
    .insert(rows)
    .select('id, role, content, meta, created_at')
    .order('created_at');
  if (saveError) console.error('chat save error', saveError.message);

  return json({ messages: saved ?? rows.map((row, i) => ({ ...row, id: `local-${now}-${i}` })) });
});
