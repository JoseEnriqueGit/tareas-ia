import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { historyForModel, stripInternalNotes, systemPrompt } from './history.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-20T15:00:00Z');

const meta = (extra: Record<string, unknown>) => ({
  created: [], updated: [], completed: [], pendingDelete: null, listed: [], summary: '', ...extra,
});

const note = (list: string) =>
  `[Contexto de la app (no lo repitas): en tu respuesta anterior la app mostró estas tareas, en orden: ${list}]`;

Deno.test('historyForModel pone las tareas listadas en el siguiente turno del usuario, nunca en la respuesta', () => {
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
    { role: 'user', content: 'Completa la segunda', meta: null },
    { role: 'assistant', content: 'Listo.', meta: null },
  ], 'gracias');
  assertEquals(result, [
    { role: 'user', content: '¿Qué tengo pendiente?' },
    { role: 'assistant', content: 'Tienes 2 tareas.' },
    { role: 'user', content: `${note(`1) Cobrar a Juan (id ${A}, 2026-11-20) 2) Cotización (id ${B}, sin fecha)`)}\nCompleta la segunda` },
    { role: 'assistant', content: 'Listo.' },
    { role: 'user', content: 'gracias' },
  ]);
});

Deno.test('historyForModel da la nota al mensaje actual si la última respuesta mostró tareas, en el orden de las tarjetas', () => {
  const result = historyForModel([
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
    { role: 'user', content: 'Borra el contrato', meta: null },
    { role: 'assistant', content: 'Confirma con el botón.', meta: meta({ pendingDelete: { id: C, title: 'Contrato', due_date: '2026-11-25' } }) },
  ], 'la segunda');
  assertEquals(result.map((m) => m.content), [
    'Creé 1 tarea.',
    `${note(`1) Cobrar a Juan (id ${A}, 2026-11-20) 2) Cotización (id ${B}, sin fecha)`)}\nBorra el contrato`,
    'Confirma con el botón.',
    `${note(`1) Contrato (id ${C}, 2026-11-25)`)}\nla segunda`,
  ]);
  assertEquals(result.at(-1)!.role, 'user');
  assert(result.every((m) => m.role === 'user' || !m.content.includes('[')), 'ninguna respuesta lleva la nota');
});

Deno.test('historyForModel deja igual los mensajes sin meta, sin tareas y los del usuario', () => {
  const rows = [
    { role: 'user' as const, content: 'hola', meta: meta({ listed: [{ id: A, title: 'x', due_date: null }] }) },
    { role: 'assistant' as const, content: 'Hola, ¿qué necesitas?', meta: null },
    { role: 'user' as const, content: 'nada', meta: null },
    { role: 'assistant' as const, content: 'No hay tareas.', meta: meta({}) },
    // Mensajes guardados antes de S12 no tienen `listed`.
    { role: 'assistant' as const, content: 'Listo.', meta: { created: [], updated: [], completed: [], pendingDelete: null } },
  ];
  assertEquals(historyForModel(rows, 'ok'), [...rows.map(({ role, content }) => ({ role, content })), { role: 'user', content: 'ok' }]);
});

Deno.test('historyForModel aplana los títulos para que no rompan la nota', () => {
  const [, message] = historyForModel([
    { role: 'assistant', content: 'Listo.', meta: meta({ created: [{ id: A, title: 'Línea 1\n\nLínea 2]', due_date: null }] }) },
  ], 'y ahora?');
  assertStringIncludes(message.content, `1) Línea 1 Línea 2] (id ${A}, sin fecha)]`);
  assertEquals(message.content.split('\n'), [message.content.split('\n')[0], 'y ahora?']);
});

Deno.test('stripInternalNotes quita las dos formas de la nota: al final, en medio y en varias líneas', () => {
  const listed = `[Tareas mostradas en la app, en orden: 1) Cobrar a Juan (id ${A}, 2026-11-20)]`;
  assertEquals(stripInternalNotes(`Tienes 1 tarea.\n${listed}`), 'Tienes 1 tarea.');
  assertEquals(stripInternalNotes(`Tienes 1 tarea. ${listed} ¿Algo más?`), 'Tienes 1 tarea. ¿Algo más?');
  assertEquals(stripInternalNotes(`Primero.\n\n${listed}\n\nSegundo.`), 'Primero.\n\nSegundo.');
  assertEquals(
    stripInternalNotes(`Listo.\n[Contexto de la app (no lo repitas): en tu respuesta anterior\nla app mostró: 1) X (id ${A}, sin fecha)]`),
    'Listo.',
  );
  assertEquals(stripInternalNotes(listed), '');
});

Deno.test('stripInternalNotes deja intactos los corchetes normales', () => {
  assertEquals(stripInternalNotes('Creé "Revisar [urgente]" para mañana.'), 'Creé "Revisar [urgente]" para mañana.');
  assertEquals(stripInternalNotes('[nota] Tareas mostradas: 2'), '[nota] Tareas mostradas: 2');
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

Deno.test('el prompt manda filtrar "qué completé" con completada_desde/hasta y explica la nota de contexto', () => {
  const prompt = systemPrompt('Ana', false, [], NOW, A);
  assertStringIncludes(prompt, 'completada_desde');
  assertStringIncludes(prompt, 'nunca decidas leyendo completada_el');
  assertStringIncludes(prompt, '[Contexto de la app');
  assert(!prompt.includes('[Tareas mostradas'), 'el prompt ya no enseña la forma vieja de la nota');
});

Deno.test('historyForModel quita notas filtradas de respuestas ya guardadas (no le enseña al modelo a copiarlas)', () => {
  const rows = [
    { role: 'user' as const, content: '¿Qué tareas tiene Ana?', meta: null },
    {
      role: 'assistant' as const,
      content: 'Ana tiene 1 tarea.\n[Tareas mostradas en la app, en orden: 1) Enviar cotización a Ana (id 40cb989d-ceab-42df-8695-c431f6dd4f85, 2026-11-20)]',
      meta: null,
    },
  ];
  const [, assistant] = historyForModel(rows, 'gracias');
  assertEquals(assistant, { role: 'assistant', content: 'Ana tiene 1 tarea.' });
});
