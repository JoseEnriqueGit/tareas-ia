// RF-19 (S6): fechas en America/Santo_Domingo, también cerca de medianoche, y etiquetas en palabras (S11, S13).
// Si fallan, "mañana" o "el viernes" se guardan con la fecha equivocada.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { addDays, dateContext, dayLabel, endOfWeek, isValidIsoDate, startOfDayUtc, taskView, todayIn, UPCOMING_GROUPS, upcomingGroup, whenLabel } from './dates.ts';

Deno.test('todayIn usa America/Santo_Domingo y no UTC cerca de medianoche', () => {
  // 03:30 UTC del 20 = 23:30 del 19 en Santo Domingo (UTC-4).
  const now = new Date('2026-11-20T03:30:00Z');
  assertEquals(todayIn(now), '2026-11-19');
  assertEquals(now.toISOString().slice(0, 10), '2026-11-20');
  // 04:00 UTC ya es medianoche del 20 en Santo Domingo.
  assertEquals(todayIn(new Date('2026-11-20T04:00:00Z')), '2026-11-20');
});

// Es la tabla que lee el modelo: a las 23:30 en Santo Domingo ya es el día siguiente en UTC (03:30) y no debe confundirlo.
Deno.test('dateContext resuelve "mañana" y "el viernes" a las 23:30 locales', () => {
  // Jueves 19 de noviembre de 2026, 23:30 en Santo Domingo.
  const context = dateContext(new Date('2026-11-20T03:30:00Z'));
  assertStringIncludes(context, 'Hoy: 2026-11-19. Mañana: 2026-11-20.');
  assertStringIncludes(context, '- viernes: 2026-11-20');
  assertStringIncludes(context, '"Esta semana" va de 2026-11-19 a 2026-11-22');
});

Deno.test('si hoy es viernes, "el viernes" es el de la semana siguiente', () => {
  const context = dateContext(new Date('2026-11-20T15:00:00Z')); // viernes 20
  assertStringIncludes(context, 'Ahora: viernes 2026-11-20');
  assertStringIncludes(context, '- viernes: 2026-11-27');
});

Deno.test('addDays cruza meses y años', () => {
  assertEquals(addDays('2026-12-31', 1), '2027-01-01');
  assertEquals(addDays('2026-03-01', -1), '2026-02-28');
});

Deno.test('isValidIsoDate rechaza fechas imposibles', () => {
  assertEquals(isValidIsoDate('2026-02-29'), false);
  assertEquals(isValidIsoDate('2026-13-01'), false);
  assertEquals(isValidIsoDate('20/11/2026'), false);
  assertEquals(isValidIsoDate('2028-02-29'), true);
});

Deno.test('endOfWeek devuelve el domingo, y el mismo día si ya es domingo', () => {
  assertEquals(endOfWeek('2026-11-16'), '2026-11-22'); // lunes
  assertEquals(endOfWeek('2026-11-22'), '2026-11-22'); // domingo
});

// Cada tarea debe caer en la vista correcta (S3); sin fecha cuenta como Próxima.
Deno.test('taskView clasifica en Hoy, Próximas, Vencidas y Completadas', () => {
  const today = '2026-11-19';
  assertEquals(taskView({ status: 'pending', due_date: '2026-11-19' }, today), 'today');
  assertEquals(taskView({ status: 'in_progress', due_date: '2026-11-18' }, today), 'overdue');
  assertEquals(taskView({ status: 'pending', due_date: '2026-11-25' }, today), 'upcoming');
  assertEquals(taskView({ status: 'pending', due_date: null }, today), 'upcoming');
  assertEquals(taskView({ status: 'done', due_date: '2026-11-18' }, today), 'done');
});

Deno.test('dayLabel usa palabras: Hoy, Mañana, Ayer, día de la semana y "Hace N días"', () => {
  const today = '2026-11-19'; // jueves
  assertEquals(dayLabel('2026-11-19', today), 'Hoy');
  assertEquals(dayLabel('2026-11-20', today), 'Mañana');
  assertEquals(dayLabel('2026-11-18', today), 'Ayer');
  assertEquals(dayLabel('2026-11-23', today), 'Lunes 23');
  assertEquals(dayLabel('2026-11-16', today), 'Hace 3 días');
  assertEquals(dayLabel('2026-12-05', today), '5 dic');
  assertEquals(dayLabel('2026-11-01', today), '1 nov');
});

Deno.test('upcomingGroup agrupa Próximas por cercanía y deja "Sin fecha" al final', () => {
  const today = '2026-11-19'; // jueves; la semana termina el domingo 22
  assertEquals(upcomingGroup('2026-11-20', today), 'Mañana');
  assertEquals(upcomingGroup('2026-11-22', today), 'Esta semana');
  assertEquals(upcomingGroup('2026-11-29', today), 'Próxima semana');
  assertEquals(upcomingGroup('2026-11-30', today), 'Más adelante');
  assertEquals(upcomingGroup(null, today), 'Sin fecha');
  assertEquals(UPCOMING_GROUPS.at(-1), 'Sin fecha');
});

// Con 14 días el modelo resuelve "el viernes de la otra semana" sin calcular fechas él mismo.
Deno.test('dateContext cubre 14 días y dice cuándo es la próxima semana', () => {
  // Jueves 19 de noviembre de 2026, 23:30 en Santo Domingo.
  const context = dateContext(new Date('2026-11-20T03:30:00Z'));
  const rows = context.split('\n').filter((line) => /^- [a-záé]+: \d{4}-\d{2}-\d{2}$/.test(line));
  assertEquals(rows.length, 14);
  assertEquals(rows[0], '- viernes: 2026-11-20');
  assertEquals(rows[13], '- jueves: 2026-12-03');
  // "el viernes" a secas sigue siendo el primero; el segundo viernes está en la segunda parte de la tabla.
  assertEquals(rows.indexOf('- viernes: 2026-11-27'), 7);
  assertStringIncludes(context, '"Esta semana" va de 2026-11-19 a 2026-11-22');
  assertStringIncludes(context, '"La próxima semana" va de 2026-11-23 a 2026-11-29');
});

// creada_el/completada_el (S13.6): la hora se muestra en Santo Domingo, no en UTC.
Deno.test('whenLabel da fecha y hora en Santo Domingo: hoy, ayer, día de la semana o fecha corta', () => {
  const now = new Date('2026-11-20T03:30:00Z'); // jueves 19, 23:30 locales
  assertEquals(whenLabel('2026-11-20T03:10:00Z', now), 'hoy, 23:10');
  assertEquals(whenLabel('2026-11-19T22:02:00Z', now), 'hoy, 18:02');
  assertEquals(whenLabel('2026-11-19T03:45:00Z', now), 'ayer, 23:45');
  assertEquals(whenLabel('2026-11-16T13:00:00Z', now), 'lunes 16, 09:00');
  assertEquals(whenLabel('2026-11-01T14:00:00Z', now), '1 nov, 10:00');
  assertEquals(whenLabel(null, now), null);
});

// Sirve para filtrar "completadas hoy" (completada_desde); un desfase de zona traería tareas de otro día.
Deno.test('startOfDayUtc da el inicio del día local como instante UTC, también al cambiar de mes y año', () => {
  // Santo Domingo es UTC-4: la medianoche local es a las 04:00 UTC del mismo día.
  assertEquals(startOfDayUtc('2026-11-20'), '2026-11-20T04:00:00.000Z');
  assertEquals(startOfDayUtc(addDays('2026-11-30', 1)), '2026-12-01T04:00:00.000Z');
  assertEquals(startOfDayUtc(addDays('2026-12-31', 1)), '2027-01-01T04:00:00.000Z');
  // Otras zonas: se calcula con Intl, sin desplazamiento fijo (Tokio retrocede al mes anterior; Nueva York cambia de horario).
  assertEquals(startOfDayUtc('2026-03-01', 'Asia/Tokyo'), '2026-02-28T15:00:00.000Z');
  assertEquals(startOfDayUtc('2026-01-15', 'America/New_York'), '2026-01-15T05:00:00.000Z');
  assertEquals(startOfDayUtc('2026-07-01', 'America/New_York'), '2026-07-01T04:00:00.000Z');
});
