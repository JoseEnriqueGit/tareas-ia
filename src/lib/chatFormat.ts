// Formato de las respuestas del asistente (S12). Convierte el texto del modelo (Markdown
// informal) en bloques que la interfaz pinta con elementos React, nunca como HTML.
// Archivo puro y sin dependencias de React o del DOM: se prueba con Deno.
import { dayLabel, isValidIsoDate } from '../../supabase/functions/_shared/dates.ts';

export type Inline = { type: 'text' | 'bold' | 'italic' | 'code'; text: string } | { type: 'break' };
export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^(\s*)[-*•·]\s+(.*)$/;
const NUMBERED = /^(\s*)\d{1,3}[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;
const ISO_DATE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d-])/g;

// Código, **negrita**, __negrita__, *cursiva* y _cursiva_. Las marcas simples y __ solo cuentan
// en bordes de palabra, para no romper snake_case ni "2*3". Lo que no cierra queda como texto.
const INLINE = new RegExp(
  [
    '`([^`\\n]+)`',
    '\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*',
    '(?<![\\p{L}\\p{N}_])__(?=\\S)(.+?)(?<=\\S)__(?![\\p{L}\\p{N}_])',
    '(?<![\\p{L}\\p{N}*])\\*(?=[^\\s*])([^*]+?)(?<=[^\\s*])\\*(?![\\p{L}\\p{N}*])',
    '(?<![\\p{L}\\p{N}_])_(?=[^\\s_])([^_]+?)(?<=[^\\s_])_(?![\\p{L}\\p{N}_])',
  ].join('|'),
  'gu',
);

/** "2026-11-20" -> "Mañana" (solo fechas reales); el resto del texto queda igual. */
function friendlyDates(text: string, today: string): string {
  return text.replace(ISO_DATE, (date, offset: number, whole: string) => {
    if (!isValidIsoDate(date)) return date;
    const label = dayLabel(date, today);
    // Mayúscula solo al empezar una oración: "Mañana tienes…" pero "vence mañana".
    const before = whole.slice(0, offset).trimEnd();
    return before === '' || /[.!?¡¿·]$/.test(before) ? label : label[0].toLowerCase() + label.slice(1);
  });
}

function parseInline(line: string, today: string): Inline[] {
  const spans: Inline[] = [];
  const pushText = (text: string) => {
    if (text) spans.push({ type: 'text', text: friendlyDates(text, today) });
  };
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    pushText(line.slice(last, match.index));
    const [, code, bold, bold2, italic, italic2] = match;
    if (code !== undefined) spans.push({ type: 'code', text: code });
    else if (bold !== undefined || bold2 !== undefined) spans.push({ type: 'bold', text: friendlyDates(bold ?? bold2, today) });
    else spans.push({ type: 'italic', text: friendlyDates(italic ?? italic2, today) });
    last = match.index + match[0].length;
  }
  pushText(line.slice(last));
  return spans;
}

/** Varias líneas en un solo bloque, separadas por saltos de línea. */
function joinLines(lines: string[], today: string): Inline[] {
  return lines.flatMap((line, i) => [...(i ? [{ type: 'break' } as Inline] : []), ...parseInline(line.trim(), today)]);
}

/** Fila de tabla Markdown sin barras: "| a | b |" -> "a · b". */
function tableRow(line: string): string {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).filter(Boolean).join(' · ');
}

export function formatAssistantText(text: string, today: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[][] } | null = null;
  // Una línea en blanco dentro de una lista solo la cierra si lo que sigue no es otro elemento.
  let blankInList = false;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inlines: joinLines(paragraph, today) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map((item) => joinLines(item, today)) });
    list = null;
    blankInList = false;
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      flushParagraph();
      if (list) blankInList = true;
      continue;
    }
    const bullet = line.match(BULLET);
    const item = bullet ?? line.match(NUMBERED);
    const ordered = !bullet;
    if (item && !RULE.test(line)) {
      const [, indent, content] = item;
      // Un elemento con sangría dentro de una lista abierta es un detalle del elemento anterior.
      if (list && indent.length > 0 && !blankInList) {
        list.items[list.items.length - 1].push(content);
        continue;
      }
      flushParagraph();
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push([content]);
      blankInList = false;
      continue;
    }
    if (list && /^\s+/.test(line) && !blankInList) {
      list.items[list.items.length - 1].push(line);
      continue;
    }
    flushList();
    if (RULE.test(line)) {
      flushParagraph();
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      if (heading[1]) blocks.push({ type: 'heading', inlines: parseInline(heading[1], today) });
      continue;
    }
    if (TABLE_ROW.test(line)) {
      if (!TABLE_SEPARATOR.test(line)) paragraph.push(tableRow(line));
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
