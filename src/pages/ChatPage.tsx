import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, errorMessage, PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from '../lib/supabase';
import { timeOf } from '../lib/format';
import { formatAssistantText, type Inline } from '../lib/chatFormat';
import { useAuth } from '../auth';
import { dayLabel, todayIn } from '../../supabase/functions/_shared/dates.ts';
import AppHeader from '../components/AppHeader';
import Logo from '../components/Logo';
import { CheckIcon, ChevronIcon, MicIcon, SendIcon, TasksIcon } from '../components/Icons';
import './chat.css';

type TaskRef = { id: string; title: string; due_date: string | null };
type ListedTask = TaskRef & { priority: Priority; status: Status; assignee: string | null };
// `listed` no existe en los mensajes guardados antes de S12. Los mensajes del usuario guardan
// otro meta ({ clientId }, S14.5), por eso las tarjetas solo leen el meta de las respuestas.
type Meta = {
  created: TaskRef[];
  updated: TaskRef[];
  completed: TaskRef[];
  pendingDelete: TaskRef | null;
  listed?: ListedTask[];
  summary: string;
};
type Message = { id: string; role: 'user' | 'assistant'; content: string; meta: Meta | null; created_at: string };

// Web Speech API (RF-21): solo existe en algunos navegadores (Chrome/Edge/Safari); si no, no se muestra el botón.
const SpeechRecognition: any =
  (window as unknown as Record<string, unknown>).SpeechRecognition ??
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

const EXAMPLES = ['Cobrar a Juan el viernes y cotización a Ana mañana, urgente', '¿Qué tengo pendiente esta semana?'];
const SUGGESTIONS = ['¿Qué tengo esta semana?', '¿Qué tengo vencido?', 'Marca como hecha…'];

const localMessage = (content: string): Message => ({
  id: `local-${Date.now()}`, role: 'assistant', content, meta: null, created_at: new Date().toISOString(),
});

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [text, setText] = useState('');
  // Mensaje del usuario mostrado al instante mientras responde el asistente.
  const [pending, setPending] = useState<Message | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean; nothingCreated?: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listening, setListening] = useState(false);
  const [dockHeight, setDockHeight] = useState(160);
  const endRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  // Id del mensaje en curso (S14.5): reintentar el mismo texto lo reutiliza y el backend no lo procesa dos veces.
  const attemptRef = useRef<{ text: string; clientId: string } | null>(null);
  const { profile, offline } = useAuth();
  const sending = pending !== null;

  function dictate() {
    if (listening) return recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-DO';
    recognition.interimResults = false;
    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const spoken = event.results[0][0].transcript;
      setText((current) => (current ? `${current} ${spoken}` : spoken));
    };
    recognition.onerror = (event: { error?: string }) => {
      if (event.error !== 'aborted') setError({ message: 'No se pudo usar el micrófono. Revisa el permiso del navegador.', retryable: false });
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function loadHistory() {
    setHistoryError('');
    if (!navigator.onLine || offline) return setHistoryError('Sin conexión. El asistente necesita internet.');
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return setHistoryError(errorMessage(error));
    setMessages((data as Message[]).reverse());
  }

  useEffect(() => {
    loadHistory();
    return () => recognitionRef.current?.abort();
  }, []);

  // El espacio final del chat mide lo mismo que el composer fijo, para que el último mensaje nunca quede tapado.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight));
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  // El campo crece con el texto hasta unas 4 líneas; solo al pasar ese tope aparece el scroll.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const max = parseFloat(getComputedStyle(input).maxHeight);
    input.style.height = `${Math.min(input.scrollHeight, max)}px`;
    input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending, error, dockHeight]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setPending({ id: 'pending', role: 'user', content: message, meta: null, created_at: new Date().toISOString() });
    setError(null);
    if (attemptRef.current?.text !== message) attemptRef.current = { text: message, clientId: crypto.randomUUID() };
    const { clientId } = attemptRef.current;
    const { data, error } = await supabase.functions.invoke('agent', { body: { message, clientId } });
    if (error) {
      // RF-18: el texto escrito se conserva para reintentar.
      let detail: { message: string; retryable: boolean; nothingCreated?: boolean } = { message: errorMessage(error), retryable: true };
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        // "No se creó ninguna tarea" solo cuando el servidor lo confirma (falló antes de cualquier acción).
          if (body?.error) detail = { message: body.error, retryable: body.retryable !== false, nothingCreated: body.nothingCreated === true };
      }
      // S15.1: si el backend no pudo confirmar el mensaje anterior, el próximo envío es un mensaje nuevo.
      // En errores reintentables (incluido "todavía se está procesando") se conserva el clientId.
      if (!detail.retryable) attemptRef.current = null;
      setPending(null);
      setError(detail);
      return;
    }
    attemptRef.current = null;
    setText('');
    setPending(null);
    // Un reintento puede devolver mensajes ya guardados: no se repiten si ya están en pantalla.
    setMessages((current) => {
      const shownIds = new Set((current ?? []).map((m) => m.id));
      return [...(current ?? []), ...(data.messages as Message[]).filter((m) => !shownIds.has(m.id))];
    });
  }

  function fill(value: string) {
    setText(value);
    inputRef.current?.focus();
  }

  async function confirmDelete(task: TaskRef) {
    setDeleting(true);
    // "Eliminé" solo se guarda si la base borró la fila; RLS no da error, borra 0 filas (S14.1).
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', task.id);
    if (error || count === 0) {
      setDeleting(false);
      return setError({
        message: error ? `No se pudo eliminar: ${errorMessage(error)}` : 'No se pudo eliminar: no tienes permiso o la tarea ya no existe.',
        retryable: false,
      });
    }
    const content = `Eliminé «${task.title}».`;
    const { data } = await supabase
      .from('chat_messages')
      .insert({ role: 'assistant', content })
      .select('id, role, content, meta, created_at')
      .single();
    setDeleting(false);
    setMessages((current) => [...(current ?? []), (data as Message) ?? localMessage(content)]);
  }

  async function cancelDelete(task: TaskRef) {
    const content = `De acuerdo, no eliminé «${task.title}».`;
    const { data } = await supabase.from('chat_messages').insert({ role: 'assistant', content }).select('id, role, content, meta, created_at').single();
    setMessages((current) => [...(current ?? []), (data as Message) ?? localMessage(content)]);
  }

  const today = todayIn(new Date());
  const shown = [...(messages ?? []), ...(pending ? [pending] : [])];
  const isEmpty = messages?.length === 0 && !pending;

  return (
    <section className="chat" style={{ '--dock-h': `${dockHeight}px` } as CSSProperties}>
      <AppHeader title="Asistente" subtitle="Escribe o dicta lo que tienes pendiente" />

      <div className="chat-log" aria-live="polite">
        {messages === null && !historyError && <p className="center muted" role="status">Cargando conversación…</p>}
        {historyError && (
          <div className="error-box" role="alert">
            <p>No se pudo cargar la conversación: {historyError}</p>
            <button className="btn" onClick={loadHistory}>Reintentar</button>
          </div>
        )}
        {isEmpty && (
          <div className="empty">
            <Logo size={72} />
            <h2>¿Qué tienes pendiente?</h2>
            <p>Puedo crear, buscar y completar tareas. Prueba con:</p>
            <div className="chat-examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => fill(example)}>«{example}»</button>
              ))}
            </div>
          </div>
        )}
        {shown.map((m, index) => {
          const day = m.created_at ? todayIn(new Date(m.created_at)) : '';
          const previous = shown[index - 1];
          const newDay = day && (!previous?.created_at || todayIn(new Date(previous.created_at)) !== day);
          const meta = m.role === 'assistant' ? m.meta : null;
          const acted = !!meta && (meta.created.length + meta.completed.length + meta.updated.length > 0 || !!meta.pendingDelete);
          // Si el modelo solo buscó la tarea para actuar sobre ella, la lista consultada sobra.
          const listed = !acted && meta?.listed?.length ? meta.listed : [];
          return (
            <div key={m.id} className="chat-row">
              {newDay && <p className="chat-day">{dayLabel(day, today)}, {timeOf(m.created_at)}</p>}
              <div className={`bubble ${m.role}${acted || listed.length ? ' wide' : ''}`}>
                {m.role === 'assistant' ? (
                  <FormattedText text={m.content} today={today} />
                ) : (
                  <p className="bubble-text">{m.content}</p>
                )}
                {meta && <ResultCards meta={meta} today={today} />}
                {listed.length > 0 && (
                  <ListedCard
                    tasks={listed}
                    today={today}
                    myName={profile?.full_name ?? null}
                    isSupervisor={profile?.role === 'supervisor'}
                  />
                )}
                {meta?.pendingDelete && index === (messages?.length ?? 0) - 1 && (
                  <div className="confirm-card">
                    <p>
                      <strong>{meta.pendingDelete.title}</strong>
                      {meta.pendingDelete.due_date && ` · ${dayLabel(meta.pendingDelete.due_date, today)}`}
                    </p>
                    <div className="actions">
                      <button className="btn danger" disabled={deleting || sending} onClick={() => confirmDelete(meta.pendingDelete!)}>
                        Sí, eliminar
                      </button>
                      <button className="btn secondary" disabled={deleting || sending} onClick={() => cancelDelete(meta.pendingDelete!)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="bubble assistant typing" role="status" aria-label="El asistente está pensando">
            <i /><i /><i />
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            <p>
              <strong>{error.message}</strong>
              {error.nothingCreated && ' No se creó ninguna tarea. Inténtalo de nuevo.'}
            </p>
            <div className="actions">
              {error.retryable && <button className="btn" onClick={() => send()}>Reintentar</button>}
              <Link to="/tareas/nueva" className="btn secondary">Crear a mano</Link>
            </div>
          </div>
        )}
        <div ref={endRef} className="chat-end" aria-hidden="true" />
      </div>

      <div className="chat-dock" ref={dockRef}>
        <div className="chat-dock-inner">
          {listening && (
            <p className="chat-rec" role="status"><i />Escuchando… habla ahora</p>
          )}
          {!!messages?.length && !sending && (
            <div className="chat-chips" aria-label="Sugerencias">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className="chip" onClick={() => fill(suggestion)}>{suggestion}</button>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={send}>
            <div className={`composer-field${listening ? ' listening' : ''}${sending ? ' disabled' : ''}`}>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={sending ? 'Esperando respuesta…' : 'Recuérdame…'}
                rows={1}
                maxLength={2000}
                disabled={sending}
                aria-label="Mensaje para el asistente"
              />
              {SpeechRecognition && (
                <button
                  type="button"
                  className={`mic${listening ? ' on' : ''}`}
                  onClick={dictate}
                  disabled={sending}
                  aria-label={listening ? 'Detener dictado' : 'Dictar por voz'}
                >
                  <MicIcon />
                </button>
              )}
            </div>
            <button className="send" disabled={sending || !text.trim()} aria-label="Enviar">
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/** Tarjetas de resultado del agente: cada tarea es un enlace tocable a su detalle (RF-17). */
function ResultCards({ meta, today }: { meta: Meta; today: string }) {
  const groups: [string, TaskRef[]][] = [
    [meta.created.length === 1 ? 'Creé 1 tarea' : `Creé ${meta.created.length} tareas`, meta.created],
    [meta.completed.length === 1 ? 'Marqué como hecha' : 'Marqué como hechas', meta.completed],
    ['Actualicé', meta.updated],
  ];
  return (
    <>
      {groups
        .filter(([, tasks]) => tasks.length > 0)
        .map(([label, tasks]) => (
          <div key={label} className="result-card">
            <h3><CheckIcon />{label}</h3>
            {tasks.map((task) => (
              <Link key={task.id} to={`/tareas/${task.id}`}>
                <span className="result-main">
                  <strong>{task.title}</strong>
                  {task.due_date && <small>{dayLabel(task.due_date, today)}</small>}
                </span>
                <ChevronIcon />
              </Link>
            ))}
          </div>
        ))}
    </>
  );
}

const LISTED_SHOWN = 8;
// Mismo tope que LISTED_LIMIT en supabase/functions/agent/tools.ts.
const LISTED_MAX = 20;

/** Tareas que el asistente consultó (listar_tareas), como tarjetas que abren el detalle (S12). */
function ListedCard({ tasks, today, myName, isSupervisor }: { tasks: ListedTask[]; today: string; myName: string | null; isSupervisor: boolean }) {
  const rest = tasks.length - LISTED_SHOWN;
  // El backend guarda hasta 20: si llegó al tope, el total real puede ser mayor y no se inventa un número.
  const capped = tasks.length >= LISTED_MAX;
  return (
    <div className="result-card listed">
      <h3><TasksIcon size={14} />{tasks.length === 1 ? '1 tarea' : `${capped ? 'Al menos ' : ''}${tasks.length} tareas`}</h3>
      {tasks.slice(0, LISTED_SHOWN).map((task) => {
        const done = task.status === 'done';
        const late = !done && !!task.due_date && task.due_date < today;
        const showAssignee = task.assignee && (isSupervisor || task.assignee !== myName);
        return (
          <Link key={task.id} to={`/tareas/${task.id}`}>
            <span className="result-main">
              <strong className={done ? 'done' : undefined}>{task.title}</strong>
              <span className="result-meta">
                <span className={late ? 'late' : undefined}>{task.due_date ? dayLabel(task.due_date, today) : 'Sin fecha'}</span>
                <span className={`prio ${task.priority}`}>
                  <span className={`dot ${task.priority}`} aria-hidden="true" />
                  {PRIORITY_LABEL[task.priority]}
                </span>
                {task.status !== 'pending' && <span className={`state ${task.status}`}>{STATUS_LABEL[task.status]}</span>}
                {showAssignee && <span>{task.assignee}</span>}
              </span>
            </span>
            <ChevronIcon />
          </Link>
        );
      })}
      {rest > 0 && (
        <Link to="/" className="result-more">
          <span className="result-main">{capped ? 'Ver todas en Tareas' : `Ver ${rest} más en Tareas`}</span>
          <ChevronIcon />
        </Link>
      )}
    </div>
  );
}

/** Respuesta del asistente con formato (párrafos, listas, negritas, fechas en palabras), sin HTML crudo. */
function FormattedText({ text, today }: { text: string; today: string }) {
  return (
    <div className="bubble-text rich">
      {formatAssistantText(text, today).map((block, i) => {
        if (block.type === 'list') {
          const items = block.items.map((item, j) => <li key={j}>{inlines(item)}</li>);
          return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return <p key={i} className={block.type === 'heading' ? 'rich-heading' : undefined}>{inlines(block.inlines)}</p>;
      })}
    </div>
  );
}

function inlines(spans: Inline[]) {
  return spans.map((span, i) => {
    if (span.type === 'break') return <br key={i} />;
    if (span.type === 'bold') return <strong key={i}>{span.text}</strong>;
    if (span.type === 'italic') return <em key={i}>{span.text}</em>;
    if (span.type === 'code') return <code key={i}>{span.text}</code>;
    return span.text;
  });
}
