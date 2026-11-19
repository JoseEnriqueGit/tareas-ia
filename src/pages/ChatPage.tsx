import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, errorMessage } from '../lib/supabase';

type TaskRef = { id: string; title: string; due_date: string | null };
type Meta = { created: TaskRef[]; updated: TaskRef[]; completed: TaskRef[]; pendingDelete: TaskRef | null; summary: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; meta: Meta | null; created_at: string };

// Web Speech API (RF-21): solo existe en algunos navegadores (Chrome/Edge/Safari); si no, no se muestra el botón.
const SpeechRecognition: any =
  (window as unknown as Record<string, unknown>).SpeechRecognition ??
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

const EXAMPLES = ['Cobrar a Juan el viernes y cotización a Ana mañana, urgente', '¿Qué tengo pendiente esta semana?'];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function dictate() {
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-DO';
    recognition.interimResults = false;
    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const spoken = event.results[0][0].transcript;
      setText((current) => (current ? `${current} ${spoken}` : spoken));
    };
    recognition.onerror = () => setError({ message: 'No se pudo usar el micrófono. Revisa el permiso del navegador.', retryable: false });
    recognition.onend = () => setListening(false);
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
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending, error]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke('agent', { body: { message } });
    setSending(false);
    if (error) {
      // RF-18: el texto escrito se conserva para reintentar.
      let detail = { message: errorMessage(error), retryable: true };
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        if (body?.error) detail = { message: body.error, retryable: body.retryable !== false };
      }
      setError(detail);
      return;
    }
    setText('');
    setMessages((current) => [...(current ?? []), ...(data.messages as Message[])]);
  }

  async function confirmDelete(task: TaskRef) {
    setDeleting(true);
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      setDeleting(false);
      return setError({ message: `No se pudo eliminar: ${errorMessage(error)}`, retryable: false });
    }
    const { data } = await supabase
      .from('chat_messages')
      .insert({ role: 'assistant', content: `Eliminé «${task.title}».` })
      .select('id, role, content, meta, created_at')
      .single();
    setDeleting(false);
    setMessages((current) => [
      ...(current ?? []),
      (data as Message) ?? { id: `local-${Date.now()}`, role: 'assistant', content: `Eliminé «${task.title}».`, meta: null, created_at: '' },
    ]);
  }

  async function cancelDelete(task: TaskRef) {
    const content = `De acuerdo, no eliminé «${task.title}».`;
    const { data } = await supabase.from('chat_messages').insert({ role: 'assistant', content }).select('id, role, content, meta, created_at').single();
    setMessages((current) => [...(current ?? []), (data as Message) ?? { id: `local-${Date.now()}`, role: 'assistant', content, meta: null, created_at: '' }]);
  }

  return (
    <section className="chat">
      <div className="chat-log" aria-live="polite">
        {messages === null && !historyError && <p className="center muted">Cargando conversación…</p>}
        {historyError && (
          <div className="error-box" role="alert">
            <p>No se pudo cargar la conversación: {historyError}</p>
            <button className="btn small" onClick={loadHistory}>Reintentar</button>
          </div>
        )}
        {messages?.length === 0 && (
          <div className="center muted">
            <p>Escribe lo que tienes pendiente. Por ejemplo:</p>
            {EXAMPLES.map((example) => (
              <button key={example} className="example" onClick={() => setText(example)}>«{example}»</button>
            ))}
          </div>
        )}
        {messages?.map((m, index) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <p className="bubble-text">{m.content}</p>
            {m.meta && <ActionLinks meta={m.meta} />}
            {m.meta?.pendingDelete && index === messages.length - 1 && (
              <div className="actions">
                <button className="btn danger small" disabled={deleting} onClick={() => confirmDelete(m.meta!.pendingDelete!)}>
                  Sí, eliminar
                </button>
                <button className="btn secondary small" disabled={deleting} onClick={() => cancelDelete(m.meta!.pendingDelete!)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ))}
        {sending && <div className="bubble assistant muted">Pensando…</div>}
        {error && (
          <div className="error-box" role="alert">
            <p>{error.message}</p>
            <div className="actions">
              {error.retryable && <button className="btn small" onClick={() => send()}>Reintentar</button>}
              <Link to="/tareas/nueva" className="btn secondary small">Crear tarea a mano</Link>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ej.: recuérdame cobrarle a Juan el viernes"
          rows={2}
          maxLength={2000}
          aria-label="Mensaje para el asistente"
        />
        {SpeechRecognition && (
          <button
            type="button"
            className={listening ? 'btn danger' : 'btn secondary'}
            onClick={dictate}
            disabled={listening || sending}
            aria-label={listening ? 'Escuchando…' : 'Dictar por voz'}
          >
            {listening ? '●' : '🎤'}
          </button>
        )}
        <button className="btn" disabled={sending || !text.trim()}>Enviar</button>
      </form>
    </section>
  );
}

function ActionLinks({ meta }: { meta: Meta }) {
  const groups: [string, TaskRef[]][] = [
    [meta.created.length === 1 ? 'Creé 1 tarea:' : `Creé ${meta.created.length} tareas:`, meta.created],
    ['Marqué como hecha:', meta.completed],
    ['Actualicé:', meta.updated],
  ];
  return (
    <>
      {groups
        .filter(([, tasks]) => tasks.length > 0)
        .map(([label, tasks]) => (
          <div key={label} className="action-links">
            <strong>{label}</strong>
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link to={`/tareas/${task.id}`}>{task.title}</Link>
                  {task.due_date && <span className="muted"> · {task.due_date}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </>
  );
}
