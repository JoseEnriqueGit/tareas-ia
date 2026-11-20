// Prueba de Deno (npm test). tsconfig.json excluye los *.test.ts; permissions.ts sí lo revisan tsc y Deno.
// S14.1/S14.2: solo el creador o un supervisor borra y edita campos; el responsable solo cambia el estado.
// Debe coincidir con las políticas de la base: si no, la interfaz ofrecería acciones que la base rechaza.
import { assertEquals } from 'jsr:@std/assert@1';
import { canDelete, canEditFields } from './permissions.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE = '22222222-2222-4222-8222-222222222222';
const BOSS = '33333333-3333-4333-8333-333333333333';
// Tarea creada por OWNER y asignada a ASSIGNEE.
const task = { owner_id: OWNER, assignee_id: ASSIGNEE };

Deno.test('quien creó la tarea puede eliminarla y editar todos sus campos', () => {
  assertEquals([canDelete(task, OWNER, false), canEditFields(task, OWNER, false)], [true, true]);
});

Deno.test('el responsable que no la creó ni es supervisor no puede eliminarla ni editar sus campos', () => {
  assertEquals([canDelete(task, ASSIGNEE, false), canEditFields(task, ASSIGNEE, false)], [false, false]);
});

Deno.test('un supervisor puede eliminar y editar tareas que no creó', () => {
  assertEquals([canDelete(task, BOSS, true), canEditFields(task, BOSS, true)], [true, true]);
});

Deno.test('sin sesión no se ofrece eliminar ni editar', () => {
  assertEquals([canDelete(task, undefined, false), canEditFields(task, undefined, false)], [false, false]);
});
