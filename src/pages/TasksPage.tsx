import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase, errorMessage, PRIORITY_LABEL, STATUS_LABEL, TASK_SELECT, type Status, type Task } from '../lib/supabase';
import { taskView, todayIn, type TaskView } from '../../supabase/functions/_shared/dates.ts';

const VIEWS: { id: TaskView; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'upcoming', label: 'Próximas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'done', label: 'Completadas' },
];

const EMPTY_TEXT: Record<TaskView, string> = {
  today: 'Nada para hoy.',
  upcoming: 'No tienes tareas próximas.',
  overdue: 'No tienes tareas vencidas.',
  done: 'Aún no completas ninguna tarea.',
};

// Un toque avanza al siguiente estado (RF-08).
const NEXT_STATUS: Record<Status, Status> = { pending: 'in_progress', in_progress: 'done', done: 'pending' };

export default function TasksPage() {
  const { session } = useAuth();
  const cacheKey = `tasks:${session!.user.id}`;
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<TaskView>('today');

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).order('due_date', { nullsFirst: false });
    if (error) {
      // Sin red se muestran las últimas tareas guardadas (RF-24).
      const cached = localStorage.getItem(cacheKey);
      if (cached) setTasks(JSON.parse(cached));
      setError(errorMessage(error));
      return;
    }
    setTasks(data as Task[]);
    localStorage.setItem(cacheKey, JSON.stringify(data));
  }, [cacheKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(task: Task) {
    const status = NEXT_STATUS[task.status];
    // Se refleja de inmediato y se revierte si falla.
    setTasks((current) => current!.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
    if (error) {
      setTasks((current) => current!.map((t) => (t.id === task.id ? task : t)));
      setError(`No se pudo cambiar el estado: ${errorMessage(error)}`);
    }
  }

  const today = todayIn(new Date());
  const visible = (tasks ?? []).filter((t) => taskView(t, today) === view);
  if (view === 'done') visible.reverse();

  return (
    <section>
      <div className="tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? 'tab active' : 'tab'}
            onClick={() => setView(v.id)}
          >
            {v.label}
            <span className="count">{(tasks ?? []).filter((t) => taskView(t, today) === v.id).length}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button className="btn small" onClick={load}>Reintentar</button>
        </div>
      )}

      {tasks === null && !error && <p className="center muted">Cargando tareas…</p>}

      {tasks !== null && visible.length === 0 && (
        <p className="center muted">{EMPTY_TEXT[view]}</p>
      )}

      <ul className="task-list">
        {visible.map((task) => (
          <li key={task.id} className={`task priority-${task.priority}`}>
            <button
              className={`status status-${task.status}`}
              onClick={() => changeStatus(task)}
              aria-label={`Estado: ${STATUS_LABEL[task.status]}. Tocar para cambiar a ${STATUS_LABEL[NEXT_STATUS[task.status]]}`}
            >
              {STATUS_LABEL[task.status]}
            </button>
            <Link to={`/tareas/${task.id}`} className="task-body">
              <span className={task.status === 'done' ? 'task-title done' : 'task-title'}>{task.title}</span>
              <span className="task-meta">
                {task.due_date ? formatDate(task.due_date) : 'Sin fecha'} · {PRIORITY_LABEL[task.priority]}
                {task.assignee && ` · ${task.assignee.full_name}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link to="/tareas/nueva" className="fab" aria-label="Nueva tarea">+</Link>
    </section>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' });
}
