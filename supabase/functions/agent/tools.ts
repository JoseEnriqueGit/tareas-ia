// Herramientas del agente (RF-14). El modelo solo propone llamadas: aquí se validan
// los parámetros con Zod y se ejecutan contra Postgres con el JWT del usuario, así
// que RLS decide qué puede ver y tocar.
import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { addDays, dayLabel, isValidIsoDate, startOfDayUtc, todayIn, whenLabel } from '../_shared/dates.ts';

const isoDate = z.string().refine(isValidIsoDate, 'Fecha inválida: usa el formato YYYY-MM-DD');
const priority = z.enum(['baja', 'media', 'alta']);
const status = z.enum(['pendiente', 'en_progreso', 'hecha']);
const taskId = z.uuid('id debe ser el id (uuid) devuelto por listar_tareas');

export const schemas = {
  crear_tarea: z.object({
    titulo: z.string().trim().min(1, 'El título no puede estar vacío').max(200),
    descripcion: z.string().trim().max(2000).optional(),
    fecha_limite: isoDate.optional(),
    prioridad: priority.optional(),
    responsable_id: taskId.optional(),
  }),
  listar_tareas: z.object({
    estado: z.enum(['abiertas', 'pendiente', 'en_progreso', 'hecha', 'todas']).optional(),
    desde: isoDate.optional(),
    hasta: isoDate.optional(),
    completada_desde: isoDate.optional(),
    completada_hasta: isoDate.optional(),
    texto: z.string().trim().max(100).optional(),
    responsable_id: taskId.optional(),
  }),
  actualizar_tarea: z.object({
    id: taskId,
    titulo: z.string().trim().min(1, 'El título no puede estar vacío').max(200).optional(),
    descripcion: z.string().trim().max(2000).optional(),
    fecha_limite: isoDate.nullable().optional(),
    prioridad: priority.optional(),
    estado: status.optional(),
    responsable_id: taskId.optional(),
  }),
  completar_tarea: z.object({ id: taskId }),
  eliminar_tarea: z.object({ id: taskId }),
};

export type ToolName = keyof typeof schemas;

const PRIORITY_DB = { baja: 'low', media: 'medium', alta: 'high' } as const;
const STATUS_DB = { pendiente: 'pending', en_progreso: 'in_progress', hecha: 'done' } as const;
const PRIORITY_ES = { low: 'baja', medium: 'media', high: 'alta' } as const;
const STATUS_ES = { pending: 'pendiente', in_progress: 'en_progreso', done: 'hecha' } as const;

// Definiciones en formato OpenAI (`tools`).
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crea una tarea. Llámala una vez por cada tarea que pida el usuario.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título corto en infinitivo, p. ej. "Cobrarle a Juan".' },
          descripcion: { type: 'string' },
          fecha_limite: { type: 'string', description: 'YYYY-MM-DD, tomada de la tabla de fechas del sistema.' },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta'], description: '"urgente" = alta. Por defecto media.' },
          responsable_id: { type: 'string', description: 'Solo supervisores: id del usuario responsable.' },
        },
        required: ['titulo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_tareas',
      description: 'Lista tareas reales de la base de datos. Úsala antes de responder consultas y para obtener el id antes de modificar.',
      parameters: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ['abiertas', 'pendiente', 'en_progreso', 'hecha', 'todas'], description: 'Por defecto "abiertas" (no hechas).' },
          desde: { type: 'string', description: 'Fecha límite mínima, YYYY-MM-DD.' },
          hasta: { type: 'string', description: 'Fecha límite máxima, YYYY-MM-DD.' },
          completada_desde: {
            type: 'string',
            description: 'Completadas desde este día (incluido), YYYY-MM-DD. Si no das estado, se listan las hechas.',
          },
          completada_hasta: { type: 'string', description: 'Completadas hasta este día (incluido), YYYY-MM-DD.' },
          texto: { type: 'string', description: 'Busca en título y descripción, p. ej. "Juan".' },
          responsable_id: { type: 'string', description: 'Solo supervisores: filtra por responsable (su propio id para "mis tareas").' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_tarea',
      description: 'Modifica campos de una tarea existente (id obtenido con listar_tareas).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          fecha_limite: { type: ['string', 'null'], description: 'YYYY-MM-DD o null para quitarla.' },
          prioridad: { type: 'string', enum: ['baja', 'media', 'alta'] },
          estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'hecha'] },
          responsable_id: { type: 'string', description: 'Solo supervisores: reasigna la tarea.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completar_tarea',
      description: 'Marca una tarea como hecha (id obtenido con listar_tareas).',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'eliminar_tarea',
      description: 'Solicita eliminar una tarea. NO la borra: el usuario debe confirmarlo con un botón.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
];

export type TaskRef = { id: string; title: string; due_date: string | null };

/** Tarea consultada con listar_tareas, con los valores de la base; la app la muestra como tarjeta. */
export type ListedTask = TaskRef & {
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'done';
  assignee: string | null;
};

const LISTED_LIMIT = 20;

/** Lo que el backend ejecutó durante el mensaje; con esto se arma el resumen (RF-17). */
export type Actions = {
  created: TaskRef[];
  updated: TaskRef[];
  completed: TaskRef[];
  pendingDelete: TaskRef | null;
  listed: ListedTask[];
};

export function emptyActions(): Actions {
  return { created: [], updated: [], completed: [], pendingDelete: null, listed: [] };
}

/** `now` es la hora de la petición: de ella salen "hoy", `vencida` y las fechas en palabras. */
type Context = { db: SupabaseClient; userId: string; isSupervisor: boolean; actions: Actions; now?: Date };

const SCOPE_USER = 'solo tus tareas (creadas por ti o asignadas a ti); no puedes ver las de otras personas';
const SCOPE_SUPERVISOR = 'todo el equipo';
const LIST_LIMIT = 50;

/** Valida los argumentos crudos del modelo. Devuelve los datos o un mensaje para el modelo. */
export function parseArgs<N extends ToolName>(
  name: N,
  rawArgs: string,
): { ok: true; data: z.infer<(typeof schemas)[N]> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, error: 'Los argumentos no son JSON válido.' };
  }
  const result = schemas[name].safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ') };
  }
  return { ok: true, data: result.data as z.infer<(typeof schemas)[N]> };
}

/** Ejecuta una herramienta y devuelve el texto (JSON) que verá el modelo como `role: "tool"`. */
export async function runTool(name: string, rawArgs: string, ctx: Context): Promise<string> {
  if (!(name in schemas)) return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
  const parsed = parseArgs(name as ToolName, rawArgs);
  if (!parsed.ok) return JSON.stringify({ error: `Parámetros inválidos: ${parsed.error}` });
  try {
    return JSON.stringify(await execute(name as ToolName, parsed.data, ctx));
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : 'Error al ejecutar la herramienta' });
  }
}

const COLUMNS =
  'id, title, description, due_date, priority, status, created_at, completed_at, assignee:profiles!tasks_assignee_id_fkey(id, full_name)';

type Row = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: keyof typeof PRIORITY_ES;
  status: keyof typeof STATUS_ES;
  created_at?: string | null;
  completed_at?: string | null;
  owner_id?: string;
  assignee: { id: string; full_name: string } | null;
};

const ONLY_STATUS = 'Solo puedes cambiar el estado de una tarea que te asignaron.';
const ONLY_OWNER_DELETES = 'Solo quien creó la tarea o un supervisor puede eliminarla.';

/** Tarea como la ve el modelo. `vencida`, `cuando` y las horas se calculan aquí: el modelo no hace cuentas de fechas. */
function toModel(row: Row, now: Date) {
  const today = todayIn(now);
  return {
    id: row.id,
    titulo: row.title,
    descripcion: row.description,
    fecha_limite: row.due_date,
    cuando: row.due_date ? dayLabel(row.due_date, today) : 'sin fecha',
    vencida: row.status !== 'done' && !!row.due_date && row.due_date < today,
    prioridad: PRIORITY_ES[row.priority],
    estado: STATUS_ES[row.status],
    responsable: row.assignee?.full_name ?? null,
    creada_el: whenLabel(row.created_at, now),
    completada_el: whenLabel(row.completed_at, now),
  };
}

function ref(row: Row): TaskRef {
  return { id: row.id, title: row.title, due_date: row.due_date };
}

// deno-lint-ignore no-explicit-any
async function execute(name: ToolName, args: any, ctx: Context): Promise<unknown> {
  const { db, actions } = ctx;
  const now = ctx.now ?? new Date();
  const model = (data: unknown) => toModel(data as Row, now);

  if ('responsable_id' in args && args.responsable_id && !ctx.isSupervisor && args.responsable_id !== ctx.userId) {
    return {
      error: name === 'listar_tareas'
        ? 'Solo un supervisor puede ver las tareas de otras personas.'
        : 'Solo un supervisor puede asignar tareas a otra persona.',
    };
  }

  switch (name) {
    case 'crear_tarea': {
      const { data, error } = await db
        .from('tasks')
        .insert({
          owner_id: ctx.userId,
          assignee_id: args.responsable_id ?? ctx.userId,
          title: args.titulo,
          description: args.descripcion ?? null,
          due_date: args.fecha_limite ?? null,
          priority: PRIORITY_DB[args.prioridad as keyof typeof PRIORITY_DB] ?? 'medium',
        })
        .select(COLUMNS)
        .single();
      if (error) return { error: error.message };
      actions.created.push(ref(data as unknown as Row));
      return { creada: model(data) };
    }

    case 'listar_tareas': {
      // count 'exact' da el total real con los mismos filtros, aunque solo se devuelvan LIST_LIMIT filas.
      let query = db
        .from('tasks')
        .select(COLUMNS, { count: 'exact' })
        .order('due_date', { nullsFirst: false })
        .order('created_at')
        .limit(LIST_LIMIT);
      const byCompletion = !!(args.completada_desde || args.completada_hasta);
      const estado = args.estado ?? (byCompletion ? 'hecha' : 'abiertas');
      if (estado === 'abiertas') query = query.neq('status', 'done');
      else if (estado !== 'todas') query = query.eq('status', STATUS_DB[estado as keyof typeof STATUS_DB]);
      if (args.desde) query = query.gte('due_date', args.desde);
      if (args.hasta) query = query.lte('due_date', args.hasta);
      // Días locales de Santo Domingo: desde el inicio de `completada_desde` hasta antes del día siguiente a `completada_hasta`.
      if (args.completada_desde) query = query.gte('completed_at', startOfDayUtc(args.completada_desde));
      if (args.completada_hasta) query = query.lt('completed_at', startOfDayUtc(addDays(args.completada_hasta, 1)));
      if (args.responsable_id) query = query.eq('assignee_id', args.responsable_id);
      if (args.texto) {
        // Se quitan los caracteres con significado en la sintaxis de filtros de PostgREST.
        const text = args.texto.replace(/[,()%*\\.:]/g, ' ').trim();
        if (text) query = query.or(`title.ilike.%${text}%,description.ilike.%${text}%`);
      }
      const { data, error, count } = await query;
      if (error) return { error: error.message };
      const rows = data as unknown as Row[];
      for (const row of rows) {
        if (actions.listed.length >= LISTED_LIMIT) break;
        if (actions.listed.some((task) => task.id === row.id)) continue;
        actions.listed.push({
          ...ref(row),
          priority: row.priority,
          status: row.status,
          assignee: row.assignee?.full_name ?? null,
        });
      }
      return {
        alcance: ctx.isSupervisor ? SCOPE_SUPERVISOR : SCOPE_USER,
        total: count ?? rows.length,
        mostradas: rows.length,
        tareas: rows.map(model),
      };
    }

    case 'actualizar_tarea': {
      const changes: Record<string, unknown> = {};
      if (args.titulo !== undefined) changes.title = args.titulo;
      if (args.descripcion !== undefined) changes.description = args.descripcion;
      if (args.fecha_limite !== undefined) changes.due_date = args.fecha_limite;
      if (args.prioridad) changes.priority = PRIORITY_DB[args.prioridad as keyof typeof PRIORITY_DB];
      if (args.estado) changes.status = STATUS_DB[args.estado as keyof typeof STATUS_DB];
      if (args.responsable_id) changes.assignee_id = args.responsable_id;
      if (!Object.keys(changes).length) return { error: 'No hay cambios que aplicar.' };
      // S14.2: quien solo es responsable cambia el estado; el resto se rechaza antes de escribir
      // (el trigger tasks_before_write lo impone igual en la base).
      if (!ctx.isSupervisor && Object.keys(changes).some((column) => column !== 'status')) {
        const { data, error: readError } = await db.from('tasks').select('owner_id, assignee_id').eq('id', args.id).maybeSingle();
        if (readError) return { error: readError.message };
        if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
        const task = data as { owner_id: string; assignee_id: string };
        // Repetir el responsable que ya tiene no cambia nada; solo eso se descarta. Si es otro
        // (p. ej. el creador reclama una tarea reasignada), es un cambio real y se aplica o se rechaza.
        if (changes.assignee_id === task.assignee_id) delete changes.assignee_id;
        if (task.owner_id !== ctx.userId && Object.keys(changes).some((column) => column !== 'status')) return { error: ONLY_STATUS };
        if (!Object.keys(changes).length) return { error: 'No hay cambios que aplicar.' };
      }
      const { data, error } = await db.from('tasks').update(changes).eq('id', args.id).select(COLUMNS).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      actions.updated.push(ref(data as unknown as Row));
      return { actualizada: model(data) };
    }

    case 'completar_tarea': {
      const { data, error } = await db.from('tasks').update({ status: 'done' }).eq('id', args.id).select(COLUMNS).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      actions.completed.push(ref(data as unknown as Row));
      return { completada: model(data) };
    }

    case 'eliminar_tarea': {
      // RF-17: nunca se borra desde el modelo. Se deja pendiente y el usuario confirma en la app.
      // La app confirma una sola eliminación por mensaje: otra tarea distinta se rechaza sin consultar.
      if (actions.pendingDelete && actions.pendingDelete.id !== args.id) {
        return { error: 'Solo se puede eliminar una tarea por mensaje. Pide confirmar la primera y luego la siguiente.' };
      }
      const { data, error } = await db.from('tasks').select(`${COLUMNS}, owner_id`).eq('id', args.id).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      // S14.1: solo se propone borrar lo que la base dejaría borrar (creador o supervisor).
      if ((data as unknown as Row).owner_id !== ctx.userId && !ctx.isSupervisor) return { error: ONLY_OWNER_DELETES };
      actions.pendingDelete = ref(data as unknown as Row);
      return { pendiente_de_confirmacion: model(data), nota: 'La app mostrará un botón para confirmar. No digas que ya se eliminó.' };
    }
  }
}

// Idempotencia del chat (S14.5) ----------------------------------------------

const clientIdSchema = z.uuid();

/** `clientId` del cuerpo de la petición: opcional (clientes viejos no lo mandan), pero si viene debe ser uuid. */
export function parseClientId(value: unknown): { ok: true; clientId: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, clientId: null };
  const result = clientIdSchema.safeParse(value);
  return result.success ? { ok: true, clientId: result.data } : { ok: false };
}

export type SavedMessage = { id: string; role: 'user' | 'assistant'; content: string; meta: unknown; created_at: string };

const MESSAGE_COLUMNS = 'id, role, content, meta, created_at';

/**
 * Si este mensaje ya se procesó (un reintento tras perder la respuesta), devuelve lo guardado:
 * el mensaje del usuario con ese clientId y la respuesta siguiente. RLS limita la búsqueda al propio chat.
 */
export async function savedReply(db: SupabaseClient, clientId: string): Promise<SavedMessage[] | null> {
  const { data: user, error } = await db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('role', 'user')
    .eq('meta->>clientId', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !user) return null;
  const { data: reply } = await db
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('role', 'assistant')
    .gt('created_at', (user as SavedMessage).created_at)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return reply ? [user as SavedMessage, reply as SavedMessage] : null;
}
