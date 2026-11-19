import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, errorMessage } from '../lib/supabase';
import { timeOf } from '../lib/format';
import { dayLabel, todayIn } from '../../supabase/functions/_shared/dates.ts';
import AppHeader from '../components/AppHeader';
import { ChatIcon, CheckIcon, ChevronIcon, MicIcon, SendIcon } from '../components/Icons';
import './chat.css';

type TaskRef = { id: string; title: string; due_date: string | null };
type Meta = { created: TaskRef[]; updated: TaskRef[]; completed: TaskRef[]; pendingDelete: TaskRef | null; summary: string };
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
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listening, setListening] = useState(false);
  const [dockHeight, setDockHeight] = useState(160);
  const endRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
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
    if (!navigator.onLine) return setHistoryError('Sin conexión. El asistente necesita internet.');
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

  // El campo crece con el texto hasta unas 4 líneas (el máximo lo pone chat.css).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
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
    const { data, error } = await supabase.functions.invoke('agent', { body: { message } });
    if (error) {
      // RF-18: el texto escrito se conserva para reintentar.
      let detail = { message: errorMessage(error), retryable: true };
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        if (body?.error) detail = { message: body.error, retryable: body.retryable !== false };
      }
      setPending(null);
      setError(detail);
      return;
    }
    setText('');
    setPending(null);
    setMessages((current) => [...(current ?? []), ...(data.messages as Message[])]);
  }

  function fill(value: string) {
    setText(value);
    inputRef.current?.focus();
  }

  async function confirmDelete(task: TaskRef) {
    setDeleting(true);
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      setDeleting(false);
      return setError({ message: `No se pudo eliminar: ${errorMessage(error)}`, retryable: false });
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
            <div className="illu"><ChatIcon size={32} /></div>
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
          const hasCards = m.meta && (m.meta.created.length + m.meta.completed.length + m.meta.updated.length > 0 || m.meta.pendingDelete);
          return (
            <div key={m.id} className="chat-row">
              {newDay && <p className="chat-day">{dayLabel(day, today)}, {timeOf(m.created_at)}</p>}
              <div className={`bubble ${m.role}${hasCards ? ' wide' : ''}`}>
                <p className="bubble-text">{withBold(m.content)}</p>
                {m.meta && <ResultCards meta={m.meta} today={today} />}
                {m.meta?.pendingDelete && index === (messages?.length ?? 0) - 1 && (
                  <div className="confirm-card">
                    <p>
                      <strong>{m.meta.pendingDelete.title}</strong>
                      {m.meta.pendingDelete.due_date && ` · ${dayLabel(m.meta.pendingDelete.due_date, today)}`}
                    </p>
                    <div className="actions">
                      <button className="btn danger" disabled={deleting || sending} onClick={() => confirmDelete(m.meta!.pendingDelete!)}>
                        Sí, eliminar
                      </button>
                      <button className="btn secondary" disabled={deleting || sending} onClick={() => cancelDelete(m.meta!.pendingDelete!)}>
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
              {error.retryable && ' No se creó ninguna tarea. Inténtalo de nuevo.'}
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

/** El modelo a veces responde con **negritas** de Markdown: se muestran como negrita en vez de asteriscos. */
function withBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
