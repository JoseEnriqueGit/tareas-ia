import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { emptyActions, parseArgs, runTool, toolDefinitions } from './tools.ts';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

Deno.test('las herramientas del RF-14 están definidas con sus nombres exactos', () => {
  const names = toolDefinitions.map((t) => t.function.name);
  for (const name of ['crear_tarea', 'listar_tareas', 'actualizar_tarea', 'completar_tarea']) {
    assert(names.includes(name), `falta ${name}`);
  }
});

Deno.test('crear_tarea acepta título, fecha y prioridad válidos', () => {
  const result = parseArgs('crear_tarea', '{"titulo":" Cobrarle a Juan ","fecha_limite":"2026-11-20","prioridad":"alta"}');
  assert(result.ok);
  assertEquals(result.data, { titulo: 'Cobrarle a Juan', fecha_limite: '2026-11-20', prioridad: 'alta' });
});

Deno.test('crear_tarea rechaza título vacío, fecha imposible y prioridad desconocida', () => {
  const empty = parseArgs('crear_tarea', '{"titulo":"   "}');
  assert(!empty.ok);
  assertStringIncludes(empty.error, 'titulo');

  const badDate = parseArgs('crear_tarea', '{"titulo":"x","fecha_limite":"2026-02-30"}');
  assert(!badDate.ok);
  assertStringIncludes(badDate.error, 'fecha_limite');

  const badPriority = parseArgs('crear_tarea', '{"titulo":"x","prioridad":"urgente"}');
  assert(!badPriority.ok);
  assertStringIncludes(badPriority.error, 'prioridad');
});

Deno.test('completar_tarea exige un id uuid y argumentos JSON válidos', () => {
  assert(parseArgs('completar_tarea', `{"id":"${ID}"}`).ok);
  const notUuid = parseArgs('completar_tarea', '{"id":"la de Juan"}');
  assert(!notUuid.ok);
  assertStringIncludes(notUuid.error, 'id');
  const notJson = parseArgs('completar_tarea', '{id: 1');
  assert(!notJson.ok);
  assertEquals(notJson.error, 'Los argumentos no son JSON válido.');
});

Deno.test('runTool no toca la base si los parámetros son inválidos o la herramienta no existe', async () => {
  // Una base que falla si se usa: prueba que la validación ocurre antes de ejecutar.
  const db = new Proxy({}, { get: () => { throw new Error('no debería usarse la base'); } });
  const ctx = { db: db as never, userId: ID, isSupervisor: false, actions: emptyActions() };

  const invalid = JSON.parse(await runTool('crear_tarea', '{"titulo":""}', ctx));
  assertStringIncludes(invalid.error, 'Parámetros inválidos');

  const unknown = JSON.parse(await runTool('borrar_todo', '{}', ctx));
  assertStringIncludes(unknown.error, 'Herramienta desconocida');

  assertEquals(ctx.actions, emptyActions());
});

/** Base falsa: cada consulta encadenable devuelve, al resolverse, el siguiente lote de filas. */
function fakeDb(batches: unknown[][]) {
  return {
    from() {
      const rows = batches.shift() ?? [];
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
      };
      for (const method of ['select', 'order', 'limit', 'neq', 'eq', 'gte', 'lte', 'or']) query[method] = () => query;
      return query;
    },
  };
}

const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, description: null, due_date: '2026-11-20', priority: 'high', status: 'pending',
  assignee: { id: ID, full_name: 'Ana Pérez' }, ...extra,
});

Deno.test('listar_tareas llena actions.listed con valores de la base, sin repetir ids y en orden', async () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const db = fakeDb([
    [row(A, 'Cobrar a Juan'), row(B, 'Cotización', { due_date: null, priority: 'low', status: 'in_progress', assignee: null })],
    [row(B, 'Cotización', { due_date: null, priority: 'low', status: 'in_progress', assignee: null }), row(C, 'Contrato', { priority: 'medium', status: 'done' })],
  ]);
  const ctx = { db: db as never, userId: ID, isSupervisor: false, actions: emptyActions() };

  const first = JSON.parse(await runTool('listar_tareas', '{}', ctx));
  assertEquals(first.total, 2);
  assertEquals(first.tareas[0].prioridad, 'alta'); // el modelo sigue viendo los valores en español
  await runTool('listar_tareas', '{"texto":"Contrato","estado":"todas"}', ctx);

  assertEquals(ctx.actions.listed, [
    { id: A, title: 'Cobrar a Juan', due_date: '2026-11-20', priority: 'high', status: 'pending', assignee: 'Ana Pérez' },
    { id: B, title: 'Cotización', due_date: null, priority: 'low', status: 'in_progress', assignee: null },
    { id: C, title: 'Contrato', due_date: '2026-11-20', priority: 'medium', status: 'done', assignee: 'Ana Pérez' },
  ]);
  assertEquals([ctx.actions.created, ctx.actions.updated, ctx.actions.completed, ctx.actions.pendingDelete], [[], [], [], null]);
});

Deno.test('actions.listed guarda como máximo 20 tareas', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `Tarea ${i}`));
  const ctx = { db: fakeDb([rows]) as never, userId: ID, isSupervisor: false, actions: emptyActions() };
  const result = JSON.parse(await runTool('listar_tareas', '{}', ctx));
  assertEquals(result.total, 25);
  assertEquals(ctx.actions.listed.length, 20);
  assertEquals(ctx.actions.listed[19].title, 'Tarea 19');
});

Deno.test('un usuario normal no puede asignar tareas a otra persona', async () => {
  const db = new Proxy({}, { get: () => { throw new Error('no debería usarse la base'); } });
  const ctx = { db: db as never, userId: ID, isSupervisor: false, actions: emptyActions() };
  const result = JSON.parse(
    await runTool('crear_tarea', '{"titulo":"x","responsable_id":"11111111-1111-4111-8111-111111111111"}', ctx),
  );
  assertEquals(result.error, 'Solo un supervisor puede asignar tareas a otra persona.');
  assertEquals(ctx.actions.created, []);
});
