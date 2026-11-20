// RF-14/RF-30 (S5): el modelo no escribe en la base; el backend valida cada herramienta y aplica los permisos.
// Si fallan, un id inventado o un parámetro malo llegaría a la base, o un usuario vería/tocar tareas ajenas.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { emptyActions, parseArgs, parseClientId, runTool, toolDefinitions } from './tools.ts';

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

// Cada rechazo debe nombrar el campo para que el modelo corrija el parámetro y reintente.
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

// Si el modelo inventa un id ("la de Juan"), la herramienta no debe tocar la base.
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

// A partir de aquí, las pruebas usan bases falsas que devuelven filas guionadas y registran qué consultas se hicieron.
/**
 * Base falsa: cada consulta encadenable devuelve, al resolverse, el siguiente lote de filas.
 * `calls` registra cada método llamado con sus argumentos; `counts` es el `count` de cada lote.
 */
function fakeDb(batches: unknown[][], counts: (number | null)[] = []) {
  const calls: [string, ...unknown[]][] = [];
  return {
    calls,
    from(table: string) {
      calls.push(['from', table]);
      const rows = batches.shift() ?? [];
      const count = counts.shift() ?? null;
      let single = false;
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: single ? (rows[0] ?? null) : rows, error: null, count }),
      };
      for (const method of ['select', 'update', 'order', 'limit', 'neq', 'eq', 'gt', 'gte', 'lt', 'lte', 'or', 'maybeSingle', 'single']) {
        query[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          if (method === 'maybeSingle' || method === 'single') single = true;
          return query;
        };
      }
      return query;
    },
  };
}

/** Base que falla si se usa: prueba que la herramienta respondió sin consultar. */
const noDb = () => new Proxy({}, { get: () => { throw new Error('no debería usarse la base'); } });

// Fila de tarea como la devuelve la base (valores en inglés); `extra` pisa los campos que cada prueba necesita.
const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, description: null, due_date: '2026-11-20', priority: 'high', status: 'pending', owner_id: ID,
  assignee: { id: ID, full_name: 'Ana Pérez' }, ...extra,
});

// actions.listed alimenta las tarjetas: salen de la base, no de lo que diga el modelo, y sin duplicados.
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

// Tope de tarjetas: una lista larga no debe saturar el chat, pero el total real se informa.
Deno.test('actions.listed guarda como máximo 20 tareas', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `Tarea ${i}`));
  const ctx = { db: fakeDb([rows]) as never, userId: ID, isSupervisor: false, actions: emptyActions() };
  const result = JSON.parse(await runTool('listar_tareas', '{}', ctx));
  assertEquals(result.total, 25);
  assertEquals(ctx.actions.listed.length, 20);
  assertEquals(ctx.actions.listed[19].title, 'Tarea 19');
});

// Asignar a otros es solo del supervisor (S8); se rechaza antes de consultar.
Deno.test('un usuario normal no puede asignar tareas a otra persona', async () => {
  const db = new Proxy({}, { get: () => { throw new Error('no debería usarse la base'); } });
  const ctx = { db: db as never, userId: ID, isSupervisor: false, actions: emptyActions() };
  const result = JSON.parse(
    await runTool('crear_tarea', '{"titulo":"x","responsable_id":"11111111-1111-4111-8111-111111111111"}', ctx),
  );
  assertEquals(result.error, 'Solo un supervisor puede asignar tareas a otra persona.');
  assertEquals(ctx.actions.created, []);
});

const OTHER = '44444444-4444-4444-8444-444444444444';
// 03:30 UTC del 20 = jueves 19, 23:30 en Santo Domingo: en UTC ya sería el 20.
const NEAR_MIDNIGHT = new Date('2026-11-20T03:30:00Z');

// S13.1: el modelo recibe el alcance para no afirmar nada sobre tareas que el usuario no puede ver.
Deno.test('listar_tareas dice el alcance: solo las propias para un usuario, todo el equipo para un supervisor', async () => {
  const user = JSON.parse(await runTool('listar_tareas', '{}', {
    db: fakeDb([[]]) as never, userId: ID, isSupervisor: false, actions: emptyActions(), now: NEAR_MIDNIGHT,
  }));
  assertEquals(user.alcance, 'solo tus tareas (creadas por ti o asignadas a ti); no puedes ver las de otras personas');

  const supervisor = JSON.parse(await runTool('listar_tareas', '{}', {
    db: fakeDb([[]]) as never, userId: ID, isSupervisor: true, actions: emptyActions(), now: NEAR_MIDNIGHT,
  }));
  assertEquals(supervisor.alcance, 'todo el equipo');
});

// S13.4: con 57 en la base y 3 devueltas, el modelo no debe decir "tienes 3".
Deno.test('listar_tareas devuelve el total real (count exact) y cuántas se muestran', async () => {
  const rows = Array.from({ length: 3 }, (_, i) => row(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `Tarea ${i}`));
  const db = fakeDb([rows], [57]);
  const result = JSON.parse(await runTool('listar_tareas', '{}', {
    db: db as never, userId: ID, isSupervisor: true, actions: emptyActions(), now: NEAR_MIDNIGHT,
  }));
  assertEquals([result.total, result.mostradas, result.tareas.length], [57, 3, 3]);
  const select = db.calls.find(([method]) => method === 'select')!;
  assertEquals(select[2], { count: 'exact' });
  assertStringIncludes(select[1] as string, 'created_at');
  assertStringIncludes(select[1] as string, 'completed_at');
  assert(db.calls.some(([method, n]) => method === 'limit' && n === 50));
});

// S13.6/S13.7: vencida y cuando se calculan en el servidor con la fecha de Santo Domingo, no los adivina el modelo.
Deno.test('listar_tareas calcula vencida, cuando, creada_el y completada_el con la hora de Santo Domingo', async () => {
  const D = '55555555-5555-4555-8555-555555555555';
  const db = fakeDb([[
    // Vence "hoy" en Santo Domingo (en UTC ya sería ayer): no está vencida.
    row(ID, 'Hoy', { due_date: '2026-11-19', created_at: '2026-11-20T03:10:00Z', completed_at: null }),
    row(OTHER, 'Vencida', { due_date: '2026-11-18', created_at: '2026-11-19T03:45:00Z', completed_at: null }),
    row(D, 'Hecha', { due_date: '2026-11-18', status: 'done', created_at: '2026-11-16T13:00:00Z', completed_at: '2026-11-19T22:02:00Z' }),
    row('66666666-6666-4666-8666-666666666666', 'Sin fecha', { due_date: null, created_at: '2026-11-01T14:00:00Z', completed_at: null }),
    row('77777777-7777-4777-8777-777777777777', 'Mañana', { due_date: '2026-11-20' }),
  ]]);
  const result = JSON.parse(await runTool('listar_tareas', '{"estado":"todas"}', {
    db: db as never, userId: ID, isSupervisor: false, actions: emptyActions(), now: NEAR_MIDNIGHT,
  }));
  const pick = (t: Record<string, unknown>) => [t.titulo, t.vencida, t.cuando, t.creada_el, t.completada_el];
  assertEquals(result.tareas.map(pick), [
    ['Hoy', false, 'Hoy', 'hoy, 23:10', null],
    ['Vencida', true, 'Ayer', 'ayer, 23:45', null],
    ['Hecha', false, 'Ayer', 'lunes 16, 09:00', 'hoy, 18:02'],
    ['Sin fecha', false, 'sin fecha', '1 nov, 10:00', null],
    ['Mañana', false, 'Mañana', null, null],
  ]);
});

// S13.9: una sola eliminación pendiente por mensaje; la segunda no debe pisar a la primera.
Deno.test('una segunda eliminar_tarea en el mismo mensaje devuelve error y no consulta la base', async () => {
  const actions = emptyActions();
  const first = JSON.parse(await runTool('eliminar_tarea', `{"id":"${ID}"}`, {
    db: fakeDb([[row(ID, 'Cobrar a Juan')]]) as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assertEquals(first.pendiente_de_confirmacion.titulo, 'Cobrar a Juan');
  assertEquals(actions.pendingDelete, { id: ID, title: 'Cobrar a Juan', due_date: '2026-11-20' });

  const second = JSON.parse(await runTool('eliminar_tarea', `{"id":"${OTHER}"}`, {
    db: noDb() as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assertEquals(second, { error: 'Solo se puede eliminar una tarea por mensaje. Pide confirmar la primera y luego la siguiente.' });
  assertEquals(actions.pendingDelete, { id: ID, title: 'Cobrar a Juan', due_date: '2026-11-20' });
});

// S13.11: el mensaje de error debe decir lo que el usuario intentó (ver vs asignar), si no confunde al modelo.
Deno.test('responsable_id ajeno: listar_tareas habla de ver y crear_tarea de asignar, sin tocar la base', async () => {
  const ctx = { db: noDb() as never, userId: ID, isSupervisor: false, actions: emptyActions(), now: NEAR_MIDNIGHT };
  const list = JSON.parse(await runTool('listar_tareas', `{"responsable_id":"${OTHER}"}`, ctx));
  assertEquals(list, { error: 'Solo un supervisor puede ver las tareas de otras personas.' });
  const create = JSON.parse(await runTool('crear_tarea', `{"titulo":"x","responsable_id":"${OTHER}"}`, ctx));
  assertEquals(create, { error: 'Solo un supervisor puede asignar tareas a otra persona.' });
  assertEquals(ctx.actions, emptyActions());
});

// Solo los filtros de fecha/estado que se enviaron a la base.
const filters = (db: { calls: [string, ...unknown[]][] }) =>
  db.calls.filter(([method]) => ['eq', 'neq', 'gte', 'lt', 'lte'].includes(method));

// "Qué completé hoy" se filtra en el servidor con los límites del día local; el modelo no decide leyendo fechas.
Deno.test('completada_desde/hasta filtran completed_at por días de Santo Domingo y por defecto piden las hechas', async () => {
  const db = fakeDb([[row(ID, 'Cobrar a Juan', { status: 'done', completed_at: '2026-11-20T15:00:00Z' })]]);
  const ctx = { db: db as never, userId: ID, isSupervisor: false, actions: emptyActions(), now: new Date('2026-11-20T15:00:00Z') };
  const result = JSON.parse(await runTool('listar_tareas', '{"completada_desde":"2026-11-20","completada_hasta":"2026-11-20"}', ctx));
  assertEquals(result.total, 1);
  assertEquals(filters(db), [
    ['eq', 'status', 'done'],
    ['gte', 'completed_at', '2026-11-20T04:00:00.000Z'],
    ['lt', 'completed_at', '2026-11-21T04:00:00.000Z'],
  ]);

  // Solo uno de los dos extremos, y un estado explícito que se respeta.
  const week = fakeDb([[]]);
  await runTool('listar_tareas', '{"completada_desde":"2026-11-16","estado":"todas"}', { ...ctx, db: week as never });
  assertEquals(filters(week), [['gte', 'completed_at', '2026-11-16T04:00:00.000Z']]);
  const until = fakeDb([[]]);
  await runTool('listar_tareas', '{"completada_hasta":"2026-11-30"}', { ...ctx, db: until as never });
  assertEquals(filters(until), [['eq', 'status', 'done'], ['lt', 'completed_at', '2026-12-01T04:00:00.000Z']]);

  // Sin estos filtros, el estado por defecto sigue siendo "abiertas".
  const open = fakeDb([[]]);
  await runTool('listar_tareas', '{}', { ...ctx, db: open as never });
  assertEquals(filters(open), [['neq', 'status', 'done']]);
});

// Una fecha mala se rechaza antes de consultar (y las dos opciones existen en la definición de la herramienta).
Deno.test('completada_desde/hasta con fecha inválida se rechazan sin tocar la base', async () => {
  const ctx = { db: noDb() as never, userId: ID, isSupervisor: false, actions: emptyActions(), now: NEAR_MIDNIGHT };
  const bad = JSON.parse(await runTool('listar_tareas', '{"completada_desde":"2026-02-30"}', ctx));
  assertStringIncludes(bad.error, 'completada_desde');
  const badEnd = JSON.parse(await runTool('listar_tareas', '{"completada_hasta":"hoy"}', ctx));
  assertStringIncludes(badEnd.error, 'completada_hasta');
  assertEquals(ctx.actions, emptyActions());
  const props = toolDefinitions.find((t) => t.function.name === 'listar_tareas')!.function.parameters.properties;
  assert('completada_desde' in props && 'completada_hasta' in props, 'faltan en la definición de la herramienta');
});

// S14.1: eliminar_tarea solo propone borrar lo que el usuario puede borrar (creador o supervisor).
Deno.test('eliminar_tarea rechaza al responsable que no creó la tarea y no deja eliminación pendiente', async () => {
  const actions = emptyActions();
  const result = JSON.parse(await runTool('eliminar_tarea', `{"id":"${OTHER}"}`, {
    db: fakeDb([[row(OTHER, 'Asignada por la jefa', { owner_id: OTHER })]]) as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assertEquals(result, { error: 'Solo quien creó la tarea o un supervisor puede eliminarla.' });
  assertEquals(actions, emptyActions());
});

// La base devuelve owner_id: se comprueba el permiso con ese dato, no con lo que diga el modelo.
Deno.test('eliminar_tarea deja pendiente la tarea para quien la creó y para un supervisor', async () => {
  const owner = emptyActions();
  const db = fakeDb([[row(OTHER, 'Mía', { owner_id: ID })]]);
  await runTool('eliminar_tarea', `{"id":"${OTHER}"}`, { db: db as never, userId: ID, isSupervisor: false, actions: owner, now: NEAR_MIDNIGHT });
  assertEquals(owner.pendingDelete, { id: OTHER, title: 'Mía', due_date: '2026-11-20' });
  assertStringIncludes(db.calls.find(([method]) => method === 'select')![1] as string, 'owner_id');

  const boss = emptyActions();
  await runTool('eliminar_tarea', `{"id":"${OTHER}"}`, {
    db: fakeDb([[row(OTHER, 'De otro', { owner_id: OTHER })]]) as never, userId: ID, isSupervisor: true, actions: boss, now: NEAR_MIDNIGHT,
  });
  assertEquals(boss.pendingDelete, { id: OTHER, title: 'De otro', due_date: '2026-11-20' });
});

// S14.2: el responsable que no es creador ni supervisor solo cambia el estado.
Deno.test('actualizar_tarea rechaza cambiar campos de una tarea solo asignada, sin actualizar la base', async () => {
  for (const args of [`{"id":"${OTHER}","titulo":"Otro"}`, `{"id":"${OTHER}","prioridad":"alta","estado":"hecha"}`, `{"id":"${OTHER}","fecha_limite":null}`]) {
    const actions = emptyActions();
    const db = fakeDb([[{ owner_id: OTHER }]]);
    const result = JSON.parse(await runTool('actualizar_tarea', args, { db: db as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT }));
    assertEquals(result, { error: 'Solo puedes cambiar el estado de una tarea que te asignaron.' });
    assert(!db.calls.some(([method]) => method === 'update'), `no debería actualizar con ${args}`);
    assertEquals(actions, emptyActions());
  }
});

// Guion: primero la fila con owner_id (permiso) y luego la fila actualizada; update debe llevar solo lo permitido.
Deno.test('actualizar_tarea deja cambiar el estado al responsable y los campos al creador o al supervisor', async () => {
  const assignee = emptyActions();
  const statusDb = fakeDb([[row(OTHER, 'Asignada', { owner_id: OTHER, status: 'in_progress' })]]);
  const status = JSON.parse(await runTool('actualizar_tarea', `{"id":"${OTHER}","estado":"en_progreso"}`, {
    db: statusDb as never, userId: ID, isSupervisor: false, actions: assignee, now: NEAR_MIDNIGHT,
  }));
  assertEquals(status.actualizada.estado, 'en_progreso');
  assert(statusDb.calls.some(([method, values]) => method === 'update' && JSON.stringify(values) === '{"status":"in_progress"}'));
  assertEquals(assignee.updated, [{ id: OTHER, title: 'Asignada', due_date: '2026-11-20' }]);

  const owner = emptyActions();
  const ownerDb = fakeDb([[{ owner_id: ID }], [row(OTHER, 'Nuevo título')]]);
  await runTool('actualizar_tarea', `{"id":"${OTHER}","titulo":"Nuevo título"}`, { db: ownerDb as never, userId: ID, isSupervisor: false, actions: owner, now: NEAR_MIDNIGHT });
  assertEquals(owner.updated, [{ id: OTHER, title: 'Nuevo título', due_date: '2026-11-20' }]);

  const boss = emptyActions();
  const bossDb = fakeDb([[row(OTHER, 'Otro título', { owner_id: OTHER })]]);
  await runTool('actualizar_tarea', `{"id":"${OTHER}","titulo":"Otro título"}`, { db: bossDb as never, userId: ID, isSupervisor: true, actions: boss, now: NEAR_MIDNIGHT });
  assertEquals(boss.updated, [{ id: OTHER, title: 'Otro título', due_date: '2026-11-20' }]);
});

// Completar es estado: el endurecimiento de S14.2 no debe bloquearlo.
Deno.test('completar_tarea sigue funcionando para el responsable que no creó la tarea', async () => {
  const actions = emptyActions();
  const result = JSON.parse(await runTool('completar_tarea', `{"id":"${OTHER}"}`, {
    db: fakeDb([[row(OTHER, 'Asignada', { owner_id: OTHER, status: 'done' })]]) as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assertEquals(result.completada.estado, 'hecha');
  assertEquals(actions.completed, [{ id: OTHER, title: 'Asignada', due_date: '2026-11-20' }]);
});

// S14.5: idempotencia del chat por clientId.
// El clientId viene del cliente: debe ser uuid, porque se guarda y se usa para la reserva.
Deno.test('parseClientId acepta un uuid o nada y rechaza otros valores', () => {
  assertEquals(parseClientId(undefined), { ok: true, clientId: null });
  assertEquals(parseClientId(null), { ok: true, clientId: null });
  assertEquals(parseClientId(ID), { ok: true, clientId: ID });
  assertEquals(parseClientId('abc'), { ok: false });
  assertEquals(parseClientId(42), { ok: false });
});

// La repetición de lo guardado por clientId (antes savedReply) se prueba en reservation.test.ts.

Deno.test('actualizar_tarea: el responsable que se pone a sí mismo como responsable solo cambia el estado (sin error falso)', async () => {
  const actions = emptyActions();
  // Ya es el responsable: poner su propio id no cambia nada y no debe bloquear el cambio de estado.
  const db = fakeDb([[{ owner_id: OTHER, assignee_id: ID }], [row(OTHER, 'Asignada', { owner_id: OTHER, status: 'done' })]]);
  const result = JSON.parse(await runTool('actualizar_tarea', `{"id":"${OTHER}","responsable_id":"${ID}","estado":"hecha"}`, {
    db: db as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assertEquals(result.actualizada.estado, 'hecha');
  assert(db.calls.some(([method, values]) => method === 'update' && JSON.stringify(values) === '{"status":"done"}'));
});

Deno.test('actualizar_tarea: el creador (no supervisor) puede reclamar una tarea que el supervisor reasignó a otra persona', async () => {
  const actions = emptyActions();
  // El creador es ID y hoy la tiene OTHER: ponerse como responsable sí es un cambio real y se aplica.
  const db = fakeDb([[{ owner_id: ID, assignee_id: OTHER }], [row(OTHER, 'Reclamada', { owner_id: ID })]]);
  const result = JSON.parse(await runTool('actualizar_tarea', `{"id":"${OTHER}","responsable_id":"${ID}"}`, {
    db: db as never, userId: ID, isSupervisor: false, actions, now: NEAR_MIDNIGHT,
  }));
  assert(result.actualizada, JSON.stringify(result));
  assert(db.calls.some(([method, values]) => method === 'update' && JSON.stringify(values) === `{"assignee_id":"${ID}"}`));
});
