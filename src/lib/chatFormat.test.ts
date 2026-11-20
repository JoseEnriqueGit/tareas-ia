// Prueba de Deno (npm test). tsconfig.json excluye los *.test.ts; chatFormat.ts sí lo revisan tsc y Deno.
import { assertEquals } from 'jsr:@std/assert@1';
import { formatAssistantText, type Block } from './chatFormat.ts';

const TODAY = '2026-11-19'; // jueves

const text = (value: string) => ({ type: 'text' as const, text: value });
const bold = (value: string) => ({ type: 'bold' as const, text: value });
const italic = (value: string) => ({ type: 'italic' as const, text: value });
const code = (value: string) => ({ type: 'code' as const, text: value });
const br = { type: 'break' as const };

Deno.test('la respuesta de la captura: introducción + viñetas con fechas en palabras', () => {
  const reply = [
    'Tareas abiertas:',
    '- Cobrar a Juan (Ana Pérez, límite: 2026-11-20, media)',
    '- Enviar cotización a Ana (Ana Pérez, límite: 2026-11-20, alta)',
    '- Revisar contrato (Ana Pérez, límite: 2026-11-25, baja)',
  ].join('\n');
  const expected: Block[] = [
    { type: 'paragraph', inlines: [text('Tareas abiertas:')] },
    {
      type: 'list',
      ordered: false,
      items: [
        [text('Cobrar a Juan (Ana Pérez, límite: mañana, media)')],
        [text('Enviar cotización a Ana (Ana Pérez, límite: mañana, alta)')],
        [text('Revisar contrato (Ana Pérez, límite: miércoles 25, baja)')],
      ],
    },
  ];
  assertEquals(formatAssistantText(reply, TODAY), expected);
});

Deno.test('viñetas con *, • y · también son listas', () => {
  assertEquals(formatAssistantText('* uno\n• dos\n· tres', TODAY), [
    { type: 'list', ordered: false, items: [[text('uno')], [text('dos')], [text('tres')]] },
  ]);
});

Deno.test('lista numerada con "1." y "1)"; un texto después cierra la lista', () => {
  assertEquals(formatAssistantText('¿Cuál?\n1. La de mañana\n2) La del viernes\n¿Me dices?', TODAY), [
    { type: 'paragraph', inlines: [text('¿Cuál?')] },
    { type: 'list', ordered: true, items: [[text('La de mañana')], [text('La del viernes')]] },
    { type: 'paragraph', inlines: [text('¿Me dices?')] },
  ]);
});

Deno.test('negrita, cursiva y código en línea', () => {
  assertEquals(formatAssistantText('Tienes **2 tareas** y __una__ es *urgente*, _de verdad_: `listar_tareas`.', TODAY), [
    {
      type: 'paragraph',
      inlines: [
        text('Tienes '), bold('2 tareas'), text(' y '), bold('una'), text(' es '), italic('urgente'),
        text(', '), italic('de verdad'), text(': '), code('listar_tareas'), text('.'),
      ],
    },
  ]);
});

Deno.test('snake_case y 2*3 no se vuelven cursiva', () => {
  assertEquals(formatAssistantText('usa due_date_iso y 2*3*4 o a_b', TODAY), [
    { type: 'paragraph', inlines: [text('usa due_date_iso y 2*3*4 o a_b')] },
  ]);
});

Deno.test('marcas sin cerrar quedan como texto literal', () => {
  assertEquals(formatAssistantText('Ojo **importante y `sin cerrar', TODAY), [
    { type: 'paragraph', inlines: [text('Ojo **importante y `sin cerrar')] },
  ]);
  assertEquals(formatAssistantText('**sí** pero **no', TODAY), [
    { type: 'paragraph', inlines: [bold('sí'), text(' pero **no')] },
  ]);
});

Deno.test('línea en blanco separa párrafos; un salto simple es salto de línea', () => {
  assertEquals(formatAssistantText('Hola.\nListo.\n\n\nOtra cosa.', TODAY), [
    { type: 'paragraph', inlines: [text('Hola.'), br, text('Listo.')] },
    { type: 'paragraph', inlines: [text('Otra cosa.')] },
  ]);
});

Deno.test('títulos # se vuelven un encabezado (línea en negrita)', () => {
  assertEquals(formatAssistantText('## Para hoy ##\nNada pendiente.', TODAY), [
    { type: 'heading', inlines: [text('Para hoy')] },
    { type: 'paragraph', inlines: [text('Nada pendiente.')] },
  ]);
});

Deno.test('una tabla Markdown se degrada a una línea por fila, sin barras', () => {
  const table = '| Tarea | Fecha |\n|---|:---:|\n| Cobrar a Juan | 2026-11-20 |\n| Cotización | 2026-12-05 |';
  assertEquals(formatAssistantText(table, TODAY), [
    {
      type: 'paragraph',
      inlines: [text('Tarea · Fecha'), br, text('Cobrar a Juan · Mañana'), br, text('Cotización · 5 dic')],
    },
  ]);
});

Deno.test('fechas ISO inválidas quedan igual; las válidas en negrita también se traducen', () => {
  assertEquals(formatAssistantText('Vence 2026-02-30 o **2026-11-19**', TODAY), [
    { type: 'paragraph', inlines: [text('Vence 2026-02-30 o '), bold('Hoy')] },
  ]);
});

Deno.test('texto vacío no produce bloques; viñetas separadas por línea en blanco siguen siendo una lista', () => {
  assertEquals(formatAssistantText('  \n\n', TODAY), []);
  assertEquals(formatAssistantText('1. uno\n\n2. dos', TODAY), [
    { type: 'list', ordered: true, items: [[text('uno')], [text('dos')]] },
  ]);
});

Deno.test('la fecha en palabras va en minúscula a mitad de frase y con mayúscula al empezar', () => {
  const today = '2026-11-19';
  const mid = formatAssistantText('Vence 2026-11-20 y la otra el 2026-11-23.', today);
  assertEquals(JSON.stringify(mid).includes('Vence mañana y la otra el lunes 23.'), true, JSON.stringify(mid));
  const start = formatAssistantText('2026-11-20 tienes dos entregas.', today);
  assertEquals(JSON.stringify(start).includes('Mañana tienes dos entregas.'), true, JSON.stringify(start));
});
