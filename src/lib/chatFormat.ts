// Formato de las respuestas del asistente (S12). Convierte el texto del modelo (Markdown
// informal) en bloques que la interfaz pinta con elementos React, nunca como HTML.
// Archivo puro y sin dependencias de React o del DOM: se prueba con Deno.
import { dayLabel, isValidIsoDate } from '../../supabase/functions/_shared/dates.ts';

export type Inline = { type: 'text' | 'bold' | 'italic' | 'code'; text: string } | { type: 'break' };
export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };

// El modelo escribe Markdown informal aunque se le pida no usarlo: se tolera y se aplana (títulos, reglas, tablas).
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^(\s*)[-*•·]\s+(.*)$/;
const NUMBERED = /^(\s*)\d{1,3}[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;

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

// Fecha ISO con la palabra que la precede: un artículo ("el 2026-11-20"), el nombre del día
// ("el lunes 2026-11-23") o un día relativo ("hoy 2026-11-19"), para no duplicar palabras.
const DATED =
  /(?<![\p{L}\p{N}-])(?:(el|del|al|lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana|ayer)\s+)?(\d{4}-\d{2}-\d{2})(?![\d-])/giu;
const WEEKDAYS = /^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i;
const RELATIVE_DAYS = /^(hoy|mañana|ayer)$/i;
const ARTICLE_WITHOUT_EL: Record<string, string> = { el: '', del: 'de ', al: 'a ' };

/**
 * "2026-11-20" -> "mañana" (solo fechas reales), respetando lo que el modelo ya escribió:
 * "el lunes 2026-11-23" -> "el lunes 23", "hoy 2026-11-19" -> "hoy", "vence el 2026-11-20" -> "vence mañana".
 */
function friendlyDates(text: string, today: string): string {
  // El modelo a veces escribe fechas ISO pese a la instrucción: se traducen aquí, solo si son fechas reales.
  return text.replace(DATED, (match: string, word: string | undefined, date: string, offset: number, whole: string) => {
    if (!isValidIsoDate(date)) return match;
    if (word && WEEKDAYS.test(word)) return `${word} ${Number(date.slice(8, 10))}`;
    if (word && RELATIVE_DAYS.test(word)) return word;
    const label = dayLabel(date, today);
    const relative = /^(Hoy|Mañana|Ayer|Hace )/.test(label);
    let prefix = word ? `${word} ` : '';
    if (word && relative) prefix = ARTICLE_WITHOUT_EL[word.toLowerCase()];
    // Mayúscula solo al empezar una oración: "Mañana tienes…" pero "vence mañana".
    const before = whole.slice(0, offset).trimEnd();
    const startsSentence = !prefix && (before === '' || /[.!?¡¿·]$/.test(before));
    return prefix + (startsSentence ? label : label[0].toLowerCase() + label.slice(1));
  });
}

// Devuelve datos (no HTML ni strings con marcas): React escapa el texto y nada del modelo se inyecta como markup.
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
// Las tablas no caben en una burbuja de chat: se convierten en texto plano por fila.
function tableRow(line: string): string {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).filter(Boolean).join(' · ');
}

const NOTE_START = /\[(?:Tareas mostradas|Contexto de la app)/i;

/**
 * Quita las notas internas del agente que el modelo copió en mensajes ya guardados (S13):
 * "[Tareas mostradas …]" o "[Contexto de la app …]" hasta su "]" de cierre, con el espacio que las rodea.
 * Misma regla que stripInternalNotes en supabase/functions/agent/history.ts (aquí local: el frontend no importa el agente).
 */
function stripInternalNotes(text: string): string {
  let out = text;
  for (let start = out.search(NOTE_START); start !== -1; start = out.search(NOTE_START)) {
    let end = out.length;
    for (let i = start, depth = 0; i < out.length; i++) {
      if (out[i] === '[') depth++;
      else if (out[i] === ']' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    const before = out.slice(0, start);
    const after = out.slice(end);
    const head = before.trimEnd();
    const tail = after.trimStart();
    const lineBreaks = (s: string) => s.split('\n').length - 1;
    const breaks = Math.min(2, Math.max(lineBreaks(before.slice(head.length)), lineBreaks(after.slice(0, after.length - tail.length))));
    const separator = !head || !tail ? '' : breaks ? '\n'.repeat(breaks) : ' ';
    out = head + separator + tail;
  }
  return out.trim();
}

export function formatAssistantText(text: string, today: string): Block[] {
  text = stripInternalNotes(text);
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
    // Línea con sangría que no es elemento: continúa el elemento anterior en vez de abrir un párrafo.
    if (list && /^\s+/.test(line) && !blankInList) {
      list.items[list.items.length - 1].push(line);
      continue;
    }
    flushList();
    // Las reglas horizontales (---) solo separan: no se pintan.
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
