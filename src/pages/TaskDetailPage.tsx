import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase, errorMessage, isTaskId, PRIORITY_LABEL, STATUS_LABEL, TASK_SELECT, type Status, type Task } from '../lib/supabase';
import { dayLabel, todayIn } from '../../supabase/functions/_shared/dates.ts';
import { initials, longDate, timeOf } from '../lib/format';
import { useOnline } from '../lib/useOnline';
import Sheet from '../components/Sheet';
import { BackIcon, StatusCircle } from '../components/Icons';
import './form.css';
import './detail.css';

type DetailTask = Task & { owner?: { full_name: string } | null };

// Mismo ciclo que el círculo de la lista (RF-08).
const NEXT_STATUS: Record<Status, Status> = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
const NEXT_ACTION: Record<Status, string> = { pending: 'Empezar', in_progress: 'Marcar como hecha', done: 'Reabrir' };

/** Vista completa de una tarea. Sin conexión se muestra la copia guardada en el dispositivo (RF-24). */
export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const online = useOnline();
  const cacheKey = `tasks:${session!.user.id}`;

  const [task, setTask] = useState<DetailTask | null>(() => readCache(cacheKey).find((t) => t.id === id) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!navigator.onLine || !isTaskId(id)) {
      setLoading(false);
      return;
    }
    supabase
      .from('tasks')
      .select(`${TASK_SELECT}, owner:profiles!tasks_owner_id_fkey(full_name)`)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) return setError(errorMessage(error));
        setTask(data as DetailTask | null);
      });
  }, [id]);

  async function changeStatus() {
    if (!task) return;
    const previous = task;
    const status = NEXT_STATUS[task.status];
    setBusy(true);
    setError('');
    setTask({ ...task, status, completed_at: status === 'done' ? new Date().toISOString() : null });
    const { data, error } = await supabase.from('tasks').update({ status }).eq('id', task.id).select(TASK_SELECT).single();
    setBusy(false);
    if (error) {
      setTask(previous);
      return setError(`No se pudo cambiar el estado: ${errorMessage(error)}`);
    }
    const updated = { ...previous, ...(data as Task) };
    setTask(updated);
    // La lista y el modo sin conexión deben ver el estado nuevo.
    writeCache(cacheKey, readCache(cacheKey).map((t) => (t.id === updated.id ? { ...t, ...(data as Task) } : t)));
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    setBusy(false);
    if (error) {
      setConfirmDelete(false);
      return setError(errorMessage(error));
    }
    writeCache(cacheKey, readCache(cacheKey).filter((t) => t.id !== task.id));
    navigate('/', { replace: true });
  }

  const topbar = (
    <header className="topbar">
      <button type="button" className="icon-btn" aria-label="Volver a la lista" onClick={() => navigate('/')}>
        <BackIcon />
      </button>
      <h1>Tarea</h1>
    </header>
  );

  if (!task) {
    return (
      <>
        {topbar}
        <main className="page no-tabbar">
          {loading ? (
            <p className="center muted" role="status">Cargando tarea…</p>
          ) : (
            <div className="error-box" role="alert">
              <p>{error || (online ? 'La tarea no existe o no tienes acceso a ella.' : 'Esta tarea no está guardada en el dispositivo y no hay conexión.')}</p>
              <Link to="/" className="btn">Volver a la lista</Link>
            </div>
          )}
        </main>
      </>
    );
  }

  const today = todayIn(new Date());
  const overdue = task.status !== 'done' && !!task.due_date && task.due_date < today;

  return (
    <>
      {topbar}
      <main className="page no-tabbar detail">
        <h2 className={task.status === 'done' ? 'detail-title done' : 'detail-title'}>{task.title}</h2>

        <div className="detail-tags">
          <span className={`detail-status status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
          <span className={`detail-prio prio-${task.priority}`}>
            <span className={`dot ${task.priority}`} aria-hidden="true" />
            Prioridad {PRIORITY_LABEL[task.priority].toLowerCase()}
          </span>
        </div>

        {error && <div className="error-box" role="alert"><p>{error}</p></div>}

        <section className="detail-card" aria-label="Descripción">
          {task.description ? <p className="detail-desc">{task.description}</p> : <p className="muted">Sin descripción.</p>}
        </section>

        <dl className="detail-card detail-list">
          <div>
            <dt>Fecha límite</dt>
            <dd className={overdue ? 'late' : undefined}>
              {task.due_date ? `${dayLabel(task.due_date, today)} · ${longDate(task.due_date)}` : 'Sin fecha'}
              {overdue && ' · vencida'}
            </dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd className="detail-person">
              <span className="who" aria-hidden="true">{initials(task.assignee?.full_name ?? '?')}</span>
              {task.assignee?.full_name ?? 'Sin responsable'}
            </dd>
          </div>
          {task.owner?.full_name && task.owner_id !== task.assignee_id && (
            <div>
              <dt>Creada por</dt>
              <dd>{task.owner.full_name}</dd>
            </div>
          )}
          <div>
            <dt>Creada</dt>
            <dd>{whenLabel(task.created_at, today)}</dd>
          </div>
          {task.status === 'done' && task.completed_at && (
            <div>
              <dt>Completada</dt>
              <dd>{whenLabel(task.completed_at, today)}</dd>
            </div>
          )}
        </dl>

        <button className="btn secondary block lg detail-status-btn" onClick={changeStatus} disabled={busy || !online}>
          <StatusCircle status={NEXT_STATUS[task.status]} />
          {NEXT_ACTION[task.status]}
        </button>
        {!online && <p className="muted detail-offline">Necesitas conexión para cambiar o eliminar la tarea.</p>}

        <div className="form-bar">
          <button className="btn danger-outline" onClick={() => setConfirmDelete(true)} disabled={busy || !online}>
            Eliminar
          </button>
          <Link to={`/tareas/${task.id}/editar`} className={online ? 'btn' : 'btn disabled-link'} aria-disabled={!online}
            onClick={(e) => !online && e.preventDefault()}>
            Editar
          </Link>
        </div>
      </main>

      {confirmDelete && (
        <Sheet role="alertdialog" title={`¿Eliminar «${task.title}»?`} onClose={() => setConfirmDelete(false)}>
          <p className="muted">No se puede deshacer.</p>
          <div className="actions detail-sheet-actions">
            <button className="btn secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="btn danger" onClick={remove} disabled={busy}>Sí, eliminar</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** "Hoy, 10:45", "Ayer, 18:02" o "Lunes 23, 09:00" en la zona horaria del usuario. */
function whenLabel(instant: string, today: string) {
  return `${dayLabel(todayIn(new Date(instant)), today)}, ${timeOf(instant)}`;
}

function readCache(key: string): Task[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as Task[];
  } catch {
    return [];
  }
}

function writeCache(key: string, tasks: Task[]) {
  localStorage.setItem(key, JSON.stringify(tasks));
}
