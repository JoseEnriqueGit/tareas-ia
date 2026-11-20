// Herramientas del agente (RF-14). El modelo solo propone llamadas: aquí se validan
// los parámetros con Zod y se ejecutan contra Postgres con el JWT del usuario, así
// que RLS decide qué puede ver y tocar.
import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isValidIsoDate } from '../_shared/dates.ts';

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
          texto: { type: 'string', description: 'Busca en título y descripción, p. ej. "Juan".' },
          responsable_id: { type: 'string', description: 'Solo supervisores: filtra por responsable.' },
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

type Context = { db: SupabaseClient; userId: string; isSupervisor: boolean; actions: Actions };

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

const COLUMNS = 'id, title, description, due_date, priority, status, assignee:profiles!tasks_assignee_id_fkey(id, full_name)';

type Row = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: keyof typeof PRIORITY_ES;
  status: keyof typeof STATUS_ES;
  assignee: { id: string; full_name: string } | null;
};

function toModel(row: Row) {
  return {
    id: row.id,
    titulo: row.title,
    descripcion: row.description,
    fecha_limite: row.due_date,
    prioridad: PRIORITY_ES[row.priority],
    estado: STATUS_ES[row.status],
    responsable: row.assignee?.full_name ?? null,
  };
}

function ref(row: Row): TaskRef {
  return { id: row.id, title: row.title, due_date: row.due_date };
}

// deno-lint-ignore no-explicit-any
async function execute(name: ToolName, args: any, ctx: Context): Promise<unknown> {
  const { db, actions } = ctx;

  if ('responsable_id' in args && args.responsable_id && !ctx.isSupervisor && args.responsable_id !== ctx.userId) {
    return { error: 'Solo un supervisor puede asignar tareas a otra persona.' };
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
      return { creada: toModel(data as unknown as Row) };
    }

    case 'listar_tareas': {
      let query = db.from('tasks').select(COLUMNS).order('due_date', { nullsFirst: false }).order('created_at').limit(50);
      const estado = args.estado ?? 'abiertas';
      if (estado === 'abiertas') query = query.neq('status', 'done');
      else if (estado !== 'todas') query = query.eq('status', STATUS_DB[estado as keyof typeof STATUS_DB]);
      if (args.desde) query = query.gte('due_date', args.desde);
      if (args.hasta) query = query.lte('due_date', args.hasta);
      if (args.responsable_id) query = query.eq('assignee_id', args.responsable_id);
      if (args.texto) {
        // Se quitan los caracteres con significado en la sintaxis de filtros de PostgREST.
        const text = args.texto.replace(/[,()%*\\.:]/g, ' ').trim();
        if (text) query = query.or(`title.ilike.%${text}%,description.ilike.%${text}%`);
      }
      const { data, error } = await query;
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
      return { total: rows.length, tareas: rows.map(toModel) };
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
      const { data, error } = await db.from('tasks').update(changes).eq('id', args.id).select(COLUMNS).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      actions.updated.push(ref(data as unknown as Row));
      return { actualizada: toModel(data as unknown as Row) };
    }

    case 'completar_tarea': {
      const { data, error } = await db.from('tasks').update({ status: 'done' }).eq('id', args.id).select(COLUMNS).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      actions.completed.push(ref(data as unknown as Row));
      return { completada: toModel(data as unknown as Row) };
    }

    case 'eliminar_tarea': {
      // RF-17: nunca se borra desde el modelo. Se deja pendiente y el usuario confirma en la app.
      const { data, error } = await db.from('tasks').select(COLUMNS).eq('id', args.id).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'No existe una tarea con ese id (o no tienes acceso).' };
      actions.pendingDelete = ref(data as unknown as Row);
      return { pendiente_de_confirmacion: toModel(data as unknown as Row), nota: 'La app mostrará un botón para confirmar. No digas que ya se eliminó.' };
    }
  }
}
