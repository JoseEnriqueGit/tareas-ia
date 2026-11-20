import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { historyForModel, systemPrompt } from './history.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-20T15:00:00Z');

const meta = (extra: Record<string, unknown>) => ({
  created: [], updated: [], completed: [], pendingDelete: null, listed: [], summary: '', ...extra,
});

Deno.test('historyForModel añade a la respuesta las tareas listadas, en orden, con id y fecha', () => {
  const result = historyForModel([
    { role: 'user', content: '¿Qué tengo pendiente?', meta: null },
    {
      role: 'assistant',
      content: 'Tienes 2 tareas.',
      meta: meta({
        listed: [
          { id: A, title: 'Cobrar a Juan', due_date: '2026-11-20', priority: 'high', status: 'pending', assignee: 'Ana' },
          { id: B, title: 'Cotización', due_date: null, priority: 'low', status: 'pending', assignee: null },
        ],
      }),
    },
  ]);
  assertEquals(result, [
    { role: 'user', content: '¿Qué tengo pendiente?' },
    {
      role: 'assistant',
      content: `Tienes 2 tareas.\n[Tareas mostradas en la app, en orden: 1) Cobrar a Juan (id ${A}, 2026-11-20) 2) Cotización (id ${B}, sin fecha)]`,
    },
  ]);
});

Deno.test('historyForModel usa las tareas creadas, completadas, actualizadas y por eliminar, en el orden de las tarjetas', () => {
  const [created, deleted] = historyForModel([
    {
      role: 'assistant',
      content: 'Creé 1 tarea.',
      meta: meta({
        created: [{ id: A, title: 'Cobrar a Juan', due_date: '2026-11-20' }],
        completed: [{ id: B, title: 'Cotización', due_date: null }],
        // Si hubo acciones, la app no muestra las listadas: tampoco van en la nota.
        listed: [{ id: C, title: 'Contrato', due_date: null, priority: 'low', status: 'pending', assignee: null }],
      }),
    },
    { role: 'assistant', content: 'Confirma con el botón.', meta: meta({ pendingDelete: { id: C, title: 'Contrato', due_date: '2026-11-25' } }) },
  ]);
  assertEquals(
    created.content,
    `Creé 1 tarea.\n[Tareas mostradas en la app, en orden: 1) Cobrar a Juan (id ${A}, 2026-11-20) 2) Cotización (id ${B}, sin fecha)]`,
  );
  assertEquals(deleted.content, `Confirma con el botón.\n[Tareas mostradas en la app, en orden: 1) Contrato (id ${C}, 2026-11-25)]`);
});

Deno.test('historyForModel deja igual los mensajes sin meta, sin tareas y los del usuario', () => {
  const rows = [
    { role: 'user' as const, content: 'hola', meta: meta({ listed: [{ id: A, title: 'x', due_date: null }] }) },
    { role: 'assistant' as const, content: 'Hola, ¿qué necesitas?', meta: null },
    { role: 'assistant' as const, content: 'No hay tareas.', meta: meta({}) },
    // Mensajes guardados antes de S12 no tienen `listed`.
    { role: 'assistant' as const, content: 'Listo.', meta: { created: [], updated: [], completed: [], pendingDelete: null } },
  ];
  assertEquals(historyForModel(rows), rows.map(({ role, content }) => ({ role, content })));
});

Deno.test('historyForModel aplana los títulos para que no rompan la nota', () => {
  const [message] = historyForModel([
    { role: 'assistant', content: 'Listo.', meta: meta({ created: [{ id: A, title: 'Línea 1\n\nLínea 2]', due_date: null }] }) },
  ]);
  assertStringIncludes(message.content, `1) Línea 1 Línea 2] (id ${A}, sin fecha)]`);
  assertEquals(message.content.split('\n').length, 2);
});

Deno.test('el prompt de un usuario normal limita el alcance a sus tareas y no trae ids del equipo', () => {
  const prompt = systemPrompt('Ana', false, [], NOW, A);
  assertStringIncludes(prompt, 'solo un supervisor puede verlas');
  assertStringIncludes(prompt, 'las que creó o le asignaron');
  assert(!prompt.includes(A), 'no debe incluir ids');
  assert(!prompt.includes('Tu id:'));
});

Deno.test('el prompt del supervisor incluye su id, el equipo y cómo distinguir "mis tareas" de "el equipo"', () => {
  const prompt = systemPrompt('Jefa', true, [{ id: A, full_name: 'Jefa' }, { id: B, full_name: 'Ana Pérez' }], NOW, A);
  assertStringIncludes(prompt, `Tu id: ${A}`);
  assertStringIncludes(prompt, `- ${B}: Ana Pérez`);
  assertStringIncludes(prompt, 'responsable_id = tu id');
  assert(!prompt.includes('solo un supervisor puede verlas'));
});

Deno.test('el prompt cubre errores, horas, "la segunda" y totales recortados', () => {
  const prompt = systemPrompt('Ana', false, [], NOW, A);
  assertStringIncludes(prompt, '"error"');
  assertStringIncludes(prompt, 'Hora: 15:00');
  assertStringIncludes(prompt, '"la segunda"');
  assertStringIncludes(prompt, 'mostradas');
  assertStringIncludes(prompt, '"La próxima semana"');
});
