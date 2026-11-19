import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase, errorMessage, PRIORITY_LABEL, STATUS_LABEL, TASK_SELECT, type Priority, type Status, type Task } from '../lib/supabase';
import {
  addDays,
  dayLabel,
  taskView,
  todayIn,
  upcomingGroup,
  weekdayName,
  UPCOMING_GROUPS,
  type TaskView,
} from '../../supabase/functions/_shared/dates.ts';
import { useTeam } from '../lib/useTeam';
import { useOnline } from '../lib/useOnline';
import { initials, longDate, tasksSavedAtKey, timeOf } from '../lib/format';
import AppHeader from '../components/AppHeader';
import Sheet from '../components/Sheet';
import { FilterIcon, PlusIcon, SearchIcon, StatusCircle, SunIcon } from '../components/Icons';
import './tasks.css';

const VIEWS: { id: TaskView; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'upcoming', label: 'Próximas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'done', label: 'Completadas' },
];

const EMPTY: Record<Exclude<TaskView, 'today'>, { title: string; text: string }> = {
  upcoming: { title: 'Nada próximo', text: 'No tienes tareas para los próximos días.' },
  overdue: { title: 'Nada vencido', text: 'Vas al día: ninguna tarea se pasó de su fecha.' },
  done: { title: 'Aún no hay tareas hechas', text: 'Toca el círculo de una tarea para marcarla como hecha.' },
};

const STATUSES: Status[] = ['pending', 'in_progress', 'done'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// Un toque avanza al siguiente estado (RF-08).
const NEXT_STATUS: Record<Status, Status> = { pending: 'in_progress', in_progress: 'done', done: 'pending' };

const lower = (text: string) => text[0].toLowerCase() + text.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Hecha hoy, 10:45", "Hecha ayer", "Hecha hace 3 días", "Hecha 5 dic". */
function doneLabel(task: Task, today: string): string {
  if (!task.completed_at) return 'Hecha';
  const day = todayIn(new Date(task.completed_at));
  if (day === today) return `Hecha hoy, ${timeOf(task.completed_at)}`;
  return `Hecha ${lower(dayLabel(day, today))}`;
}

/** Orden dentro de cada vista: vencidas, la más antigua primero; hechas, la más reciente primero. */
function sortForView(tasks: Task[], view: TaskView): Task[] {
  if (view === 'overdue') return [...tasks].sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  if (view === 'done') return [...tasks].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return tasks;
}

export default function TasksPage() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const isSupervisor = profile?.role === 'supervisor';
  const team = useTeam(isSupervisor);
  const userId = session!.user.id;
  const cacheKey = `tasks:${userId}`;
  // Se pinta primero lo último guardado y luego se refresca: sin red la lista aparece al instante (RF-24).
  const [tasks, setTasks] = useState<Task[] | null>(() => {
    const cached = localStorage.getItem(cacheKey);
    return cached ? (JSON.parse(cached) as Task[]) : null;
  });
  const [error, setError] = useState('');
  const [view, setView] = useState<TaskView>('today');
  const [sheetOpen, setSheetOpen] = useState(false);
  // Filtros combinables (RF-09); "responsable" es el filtro por persona del supervisor.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).order('due_date', { nullsFirst: false });
    if (error) {
      setError(errorMessage(error));
      return;
    }
    setTasks(data as Task[]);
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(tasksSavedAtKey(userId), String(Date.now()));
  }, [cacheKey, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(task: Task) {
    const status = NEXT_STATUS[task.status];
    const completed_at = status === 'done' ? new Date().toISOString() : null;
    // Se refleja de inmediato y se revierte si falla; la base fija la hora real de completado.
    setTasks((current) => current!.map((t) => (t.id === task.id ? { ...t, status, completed_at } : t)));
    const { data, error } = await supabase.from('tasks').update({ status }).eq('id', task.id).select(TASK_SELECT).single();
    if (error) {
      setTasks((current) => current!.map((t) => (t.id === task.id ? task : t)));
      setError(`No se pudo cambiar el estado: ${errorMessage(error)}`);
      return;
    }
    setTasks((current) => current!.map((t) => (t.id === task.id ? (data as Task) : t)));
  }

  function clearSheetFilters() {
    setStatusFilter('');
    setPriorityFilter('');
    setAssigneeFilter('');
  }

  const today = todayIn(new Date());
  const needle = search.trim().toLocaleLowerCase();
  const filtered = (tasks ?? []).filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!priorityFilter || t.priority === priorityFilter) &&
      (!assigneeFilter || t.assignee_id === assigneeFilter) &&
      (!needle || `${t.title} ${t.description ?? ''}`.toLocaleLowerCase().includes(needle)),
  );
  const inView = (list: Task[], v: TaskView) => list.filter((t) => taskView(t, today) === v);
  const visible = sortForView(inView(filtered, view), view);
  const overdue = sortForView(inView(filtered, 'overdue'), 'overdue');
  const assigneeName = team.find((p) => p.id === assigneeFilter)?.full_name ?? 'Persona';

  // Fichas de filtros activos, cada una se quita con un toque.
  const activeFilters = [
    statusFilter && { key: 'status', label: STATUS_LABEL[statusFilter], aria: `estado ${STATUS_LABEL[statusFilter]}`, clear: () => setStatusFilter('') },
    priorityFilter && { key: 'priority', label: PRIORITY_LABEL[priorityFilter], aria: `prioridad ${PRIORITY_LABEL[priorityFilter]}`, clear: () => setPriorityFilter('') },
    assigneeFilter && { key: 'assignee', label: assigneeName, aria: `persona ${assigneeName}`, clear: () => setAssigneeFilter('') },
  ].filter((f): f is ActiveFilter => !!f);
  const narrowed = activeFilters.length > 0 || !!needle;
  const noMatches = narrowed && visible.length === 0 && inView(tasks ?? [], view).length > 0;

  // "No hay tareas con «factura» y prioridad Alta."
  const queryParts = [needle && `«${search.trim()}»`, ...activeFilters.map((f) => (f.key === 'assignee' ? `de ${assigneeName}` : f.aria))].filter(Boolean);
  const queryText = queryParts.length > 1 ? `${queryParts.slice(0, -1).join(', ')} y ${queryParts[queryParts.length - 1]}` : queryParts[0];

  // Grupos de la vista: Próximas por cuándo vencen; el resto, una sola lista.
  const groups: { title?: string; tasks: Task[] }[] =
    view === 'upcoming'
      ? UPCOMING_GROUPS.map((g) => ({
          title: g === 'Mañana' ? `Mañana · ${weekdayName(addDays(today, 1))} ${Number(addDays(today, 1).slice(8, 10))}` : g,
          tasks: visible.filter((t) => upcomingGroup(t.due_date, today) === g),
        })).filter((g) => g.tasks.length > 0)
      : [{ title: view === 'today' ? 'Hoy' : undefined, tasks: visible }];

  return (
    <>
      <AppHeader subtitle={`${longDate(today)}${isSupervisor ? ' · equipo' : ''}`} />
      <main className="page tasks">
        <div className="seg" role="tablist" aria-label="Vistas">
          {VIEWS.map((v) => {
            const count = inView(filtered, v.id).length;
            return (
              <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
                <span className={v.id === 'overdue' && count > 0 ? 'n alert' : 'n'}>{tasks === null ? '–' : count}</span>
              </button>
            );
          })}
        </div>

        <div className="searchrow">
          <label className="search">
            <SearchIcon />
            <span className="sr-only">Buscar tareas</span>
            <input type="search" placeholder="Buscar tareas" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button
            className="filterbtn"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-label={activeFilters.length ? `Filtros (${plural(activeFilters.length, 'activo', 'activos')})` : 'Filtros (ninguno activo)'}
          >
            <FilterIcon />
            Filtros
            {activeFilters.length > 0 && <span className="dot-count">{activeFilters.length}</span>}
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className="chips active-filters">
            {activeFilters.map((f) => (
              <button key={f.key} className="chip" aria-pressed="true" onClick={f.clear} aria-label={`Quitar filtro ${f.aria}`}>
                {f.label} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button className="btn secondary" onClick={load}>Reintentar</button>
          </div>
        )}

        {view === 'today' && overdue.length > 0 && (
          <button className="overdue-note" onClick={() => setView('overdue')}>
            <span>
              {plural(overdue.length, 'tarea vencida', 'tareas vencidas')} · {overdue[0].title} ({lower(dayLabel(overdue[0].due_date!, today))})
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}

        {tasks === null && !error && (
          <>
            <p className="sr-only" role="status">Cargando tareas…</p>
            <div className="list" aria-hidden="true">
              {[70, 55, 80].map((width) => (
                <div key={width} className="skrow">
                  <span className="sk circle" />
                  <span className="sk-lines">
                    <span className="sk" style={{ height: 14, width: `${width}%` }} />
                    <span className="sk" style={{ height: 10, width: `${width / 2}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {tasks !== null && visible.length === 0 &&
          (noMatches ? (
            <div className="empty">
              <h2>Ninguna tarea coincide</h2>
              <p>No hay tareas con {queryText}.</p>
              <button className="btn secondary" onClick={() => { clearSheetFilters(); setSearch(''); }}>Quitar filtros</button>
            </div>
          ) : view === 'today' ? (
            <div className="empty">
              <div className="illu"><SunIcon /></div>
              <h2>Nada para hoy</h2>
              <p>
                {(() => {
                  const upcoming = inView(filtered, 'upcoming').length;
                  return upcoming ? `Tienes ${plural(upcoming, 'tarea', 'tareas')} en Próximas.` : 'No tienes tareas en Próximas.';
                })()}{' '}
                ¿Algo nuevo pendiente?
              </p>
              <button className="btn lg" onClick={() => navigate('/asistente')}>Decírselo al asistente</button>
              {online ? (
                <Link to="/tareas/nueva" className="btn secondary lg">Crear tarea a mano</Link>
              ) : (
                <button className="btn secondary lg" disabled>Crear tarea a mano</button>
              )}
            </div>
          ) : (
            <div className="empty">
              <h2>{EMPTY[view].title}</h2>
              <p>{EMPTY[view].text}</p>
            </div>
          ))}

        {groups.map((group) =>
          group.tasks.length === 0 ? null : (
            <section key={group.title ?? view} className="group">
              {group.title && <h2 className="group-title">{group.title}</h2>}
              <ul className="list">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    online={online}
                    showAssignee={isSupervisor}
                    onToggle={() => changeStatus(task)}
                  />
                ))}
              </ul>
            </section>
          ),
        )}

        {online ? (
          <Link to="/tareas/nueva" className="fab">
            <PlusIcon />
            Nueva
          </Link>
        ) : (
          <>
            <p className="fab-hint" id="fab-hint">Necesitas conexión para crear o cambiar tareas.</p>
            <button className="fab" disabled aria-describedby="fab-hint">
              <PlusIcon />
              Nueva
            </button>
          </>
        )}
      </main>

      {sheetOpen && (
        <Sheet
          title="Filtros"
          onClose={() => setSheetOpen(false)}
          headerAction={<button className="link-btn" onClick={clearSheetFilters}>Limpiar</button>}
        >
          {isSupervisor && (
            <>
              <h3 className="sheet-section">Persona</h3>
              <div className="chips">
                <button className="chip" aria-pressed={!assigneeFilter} onClick={() => setAssigneeFilter('')}>Todas</button>
                {team.map((p) => (
                  <button
                    key={p.id}
                    className="chip"
                    aria-pressed={assigneeFilter === p.id}
                    onClick={() => setAssigneeFilter(assigneeFilter === p.id ? '' : p.id)}
                  >
                    <span className="who small" aria-hidden="true">{initials(p.full_name)}</span>
                    {p.full_name}
                  </button>
                ))}
              </div>
            </>
          )}
          <h3 className="sheet-section">Estado</h3>
          <div className="chips">
            {STATUSES.map((s) => (
              <button key={s} className="chip" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <h3 className="sheet-section">Prioridad</h3>
          <div className="chips">
            {PRIORITIES.map((p) => (
              <button key={p} className="chip" aria-pressed={priorityFilter === p} onClick={() => setPriorityFilter(priorityFilter === p ? '' : p)}>
                <span className={`dot ${p}`} aria-hidden="true" />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          <button className="btn block lg sheet-apply" onClick={() => setSheetOpen(false)}>
            Ver {plural(visible.length, 'tarea', 'tareas')}
          </button>
        </Sheet>
      )}
    </>
  );
}

type ActiveFilter = { key: string; label: string; aria: string; clear: () => void };

type RowProps = { task: Task; today: string; online: boolean; showAssignee: boolean; onToggle: () => void };

function TaskRow({ task, today, online, showAssignee, onToggle }: RowProps) {
  const isDone = task.status === 'done';
  const late = !isDone && !!task.due_date && task.due_date < today;
  const name = task.assignee?.full_name;
  return (
    <li>
      <button
        className="check"
        onClick={onToggle}
        disabled={!online}
        aria-label={`${task.title}. Estado: ${STATUS_LABEL[task.status]}. Tocar para cambiar a ${STATUS_LABEL[NEXT_STATUS[task.status]]}`}
      >
        <StatusCircle status={task.status} />
      </button>
      <Link to={`/tareas/${task.id}`} className="tbody">
        <span className={isDone ? 'tt done' : 'tt'}>{task.title}</span>
        <span className="meta">
          {isDone ? (
            <span>{doneLabel(task, today)}</span>
          ) : (
            <>
              {task.due_date && <span className={late ? 'late' : undefined}>{dayLabel(task.due_date, today)}</span>}
              <span className={`prio ${task.priority}`}>
                <span className={`dot ${task.priority}`} aria-hidden="true" />
                {PRIORITY_LABEL[task.priority]}
              </span>
              {task.status === 'in_progress' && <span className="state progress">{STATUS_LABEL.in_progress}</span>}
            </>
          )}
        </span>
      </Link>
      {showAssignee && name && (
        <span className="who" title={name} aria-label={`Responsable: ${name}`} role="img">{initials(name)}</span>
      )}
    </li>
  );
}
