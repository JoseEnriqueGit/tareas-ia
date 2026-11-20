import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  supabase,
  errorMessage,
  PRIORITY_LABEL,
  TASK_SELECT,
  type Priority,
  type Profile,
  type Status,
  type Task,
} from '../lib/supabase';
import { addDays, isValidIsoDate, todayIn, weekdayName } from '../../supabase/functions/_shared/dates.ts';
import { useTeam } from '../lib/useTeam';
import { initials } from '../lib/format';
import Sheet from '../components/Sheet';
import { BackIcon, ChevronIcon } from '../components/Icons';
import './form.css';

type Form = { title: string; description: string; due_date: string; priority: Priority; status: Status };
type FieldErrors = Partial<Record<'title' | 'due_date', string>>;

const EMPTY: Form = { title: '', description: '', due_date: '', priority: 'medium', status: 'pending' };
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
// Etiquetas cortas para que el control segmentado quepa en 360 px.
const STATUSES: [Status, string][] = [['pending', 'Pendiente'], ['in_progress', 'En progreso'], ['done', 'Hecha']];

/** Fechas rápidas. "Viernes" es el próximo viernes; si hoy es viernes, el de la semana que viene (igual que el agente). */
function quickDates(today: string): [string, string][] {
  let friday = addDays(today, 1);
  while (weekdayName(friday) !== 'viernes') friday = addDays(friday, 1);
  return [
    ['Hoy', today],
    ['Mañana', addDays(today, 1)],
    [`Viernes ${Number(friday.slice(8, 10))}`, friday],
    ['Sin fecha', ''],
  ];
}

export default function TaskFormPage() {
  const { id } = useParams();
  const isNew = !id;
  // Editar vuelve al detalle de la tarea; crear vuelve a la lista.
  const backTo = isNew ? '/' : `/tareas/${id}`;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isSupervisor = profile?.role === 'supervisor';
  const team = useTeam(isSupervisor);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const [form, setForm] = useState<Form>(EMPTY);
  const [assigneeId, setAssigneeId] = useState(profile?.id ?? '');
  const [assigneeName, setAssigneeName] = useState(profile?.full_name ?? '');
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickAssignee, setPickAssignee] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) return setLoadError(errorMessage(error));
        if (!data) return setLoadError('La tarea no existe o no tienes acceso a ella.');
        const task = data as Task;
        setForm({
          title: task.title,
          description: task.description ?? '',
          due_date: task.due_date ?? '',
          priority: task.priority,
          status: task.status,
        });
        setAssigneeId(task.assignee_id);
        setAssigneeName(task.assignee?.full_name ?? '');
      });
  }, [id, isNew]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.title.trim()) errors.title = 'El título es obligatorio.';
    else if (form.title.trim().length > 200) errors.title = 'El título no puede pasar de 200 caracteres.';
    // badInput: el navegador recibió algo que no es una fecha (p. ej. 31/02).
    if (dateRef.current?.validity.badInput || (form.due_date && !isValidIsoDate(form.due_date))) {
      errors.due_date = 'La fecha no es válida.';
    }
    return errors;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaveError('');
    const errors = validate();
    setFieldErrors(errors);
    // RF-10: el foco va al primer campo con error.
    if (errors.title) return titleRef.current?.focus();
    if (errors.due_date) return dateRef.current?.focus();

    setBusy(true);
    const values = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
      // Solo un supervisor reasigna; RLS y un trigger lo impiden a los demás.
      ...(isSupervisor && assigneeId ? { assignee_id: assigneeId } : {}),
    };
    const { error } = isNew
      ? await supabase.from('tasks').insert(values)
      : await supabase.from('tasks').update(values).eq('id', id);
    setBusy(false);
    if (error) return setSaveError(errorMessage(error));
    navigate(backTo, { replace: !isNew });
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    setBusy(false);
    if (error) {
      setConfirmDelete(false);
      return setSaveError(errorMessage(error));
    }
    navigate('/');
  }

  const heading = isNew ? 'Nueva tarea' : 'Editar tarea';
  const topbar = (
    <header className="topbar">
      <button type="button" className="icon-btn" aria-label="Volver" onClick={() => navigate(backTo)}>
        <BackIcon />
      </button>
      <h1>{heading}</h1>
    </header>
  );

  if (loading)
    return (
      <>
        {topbar}
        <main className="page no-tabbar">
          <div className="task-form" role="status">
            <span className="sr-only">Cargando tarea…</span>
            <div className="sk" style={{ height: 48 }} />
            <div className="sk" style={{ height: 72 }} />
            <div className="sk" style={{ height: 44 }} />
            <div className="sk" style={{ height: 44 }} />
          </div>
        </main>
      </>
    );
  if (loadError)
    return (
      <>
        {topbar}
        <main className="page no-tabbar">
          <div className="error-box" role="alert">
            <p>{loadError}</p>
            <Link to="/" className="btn">Volver a la lista</Link>
          </div>
        </main>
      </>
    );

  const today = todayIn(new Date());
  const assignee = team.find((p) => p.id === assigneeId);
  const shownName = assignee?.full_name ?? assigneeName;
  const isSelf = assigneeId === profile?.id;
  const titleErrorId = `${uid}-title-error`;
  const dateErrorId = `${uid}-date-error`;

  return (
    <>
      {topbar}
      <main className="page no-tabbar">
        <form onSubmit={save} className="task-form" noValidate>
          <div>
            <label className="label" htmlFor={`${uid}-title`}>Título</label>
            <input
              id={`${uid}-title`}
              ref={titleRef}
              className="input title-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? titleErrorId : undefined}
              maxLength={200}
            />
            {fieldErrors.title && <span id={titleErrorId} className="field-error">{fieldErrors.title}</span>}
          </div>

          <div>
            <label className="label" htmlFor={`${uid}-desc`}>
              Descripción <span className="opt">(opcional)</span>
            </label>
            <textarea
              id={`${uid}-desc`}
              className="input"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>

          <div role="group" aria-labelledby={`${uid}-due`}>
            <span className="label" id={`${uid}-due`}>
              Fecha límite <span className="opt">(opcional)</span>
            </span>
            <div className="chips quick-dates">
              {quickDates(today).map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  aria-pressed={form.due_date === value}
                  onClick={() => set('due_date', value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              ref={dateRef}
              type="date"
              className="input"
              aria-label="Otra fecha"
              value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              aria-invalid={!!fieldErrors.due_date}
              aria-describedby={fieldErrors.due_date ? dateErrorId : undefined}
            />
            {fieldErrors.due_date && <span id={dateErrorId} className="field-error">{fieldErrors.due_date}</span>}
          </div>

          <div>
            <span className="label" id={`${uid}-priority`}>Prioridad</span>
            <div className="segctl" role="radiogroup" aria-labelledby={`${uid}-priority`}>
              {PRIORITIES.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={form.priority === p} onClick={() => set('priority', p)}>
                  <span className={`dot ${p}`} aria-hidden="true" />
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label" id={`${uid}-status`}>Estado</span>
            <div className="segctl" role="radiogroup" aria-labelledby={`${uid}-status`}>
              {STATUSES.map(([s, label]) => (
                <button key={s} type="button" role="radio" aria-checked={form.status === s} onClick={() => set('status', s)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isSupervisor ? (
            <div>
              <span className="label" id={`${uid}-owner`}>Responsable</span>
              <button
                type="button"
                className="input owner-btn"
                aria-labelledby={`${uid}-owner ${uid}-owner-name`}
                onClick={() => setPickAssignee(true)}
              >
                <span className="who" aria-hidden="true">{initials(shownName)}</span>
                <span id={`${uid}-owner-name`} className="owner-name">{shownName}{isSelf && ' (tú)'}</span>
                <ChevronIcon />
              </button>
            </div>
          ) : (
            <p className="owner">
              <span className="who" aria-hidden="true">{initials(shownName)}</span>
              <span>Responsable: <b>{shownName}{isSelf && ' (tú)'}</b></span>
            </p>
          )}

          {saveError && <p className="form-alert" role="alert">{saveError}</p>}

          {!isNew && (
            <button type="button" className="btn danger-outline block delete-btn" onClick={() => setConfirmDelete(true)}>
              Eliminar tarea
            </button>
          )}

          <div className="form-bar">
            <Link to={backTo} className="btn secondary">Cancelar</Link>
            <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar tarea'}</button>
          </div>
        </form>
      </main>

      {pickAssignee && (
        <AssigneeSheet
          team={team.length ? team : [{ id: assigneeId, full_name: shownName, role: 'user' }]}
          selfId={profile?.id}
          current={assigneeId}
          onClose={() => setPickAssignee(false)}
          onPick={(person) => {
            setAssigneeId(person.id);
            setAssigneeName(person.full_name);
            setPickAssignee(false);
          }}
        />
      )}

      {confirmDelete && (
        <Sheet role="alertdialog" title={`¿Eliminar «${form.title}»?`} onClose={() => setConfirmDelete(false)}>
          <p className="sheet-text">No se puede deshacer.</p>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>Sí, eliminar</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

type AssigneeProps = {
  team: Profile[];
  selfId?: string;
  current: string;
  onClose: () => void;
  onPick: (person: Profile) => void;
};

/** Hoja para que el supervisor elija responsable, con cuántas tareas abiertas tiene cada persona. */
function AssigneeSheet({ team, selfId, current, onClose, onPick }: AssigneeProps) {
  const [selected, setSelected] = useState(current);
  const [open, setOpen] = useState<Record<string, number> | null>(null);
  const name = useId();

  useEffect(() => {
    supabase
      .from('tasks')
      .select('assignee_id')
      .neq('status', 'done')
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        for (const row of (data as { assignee_id: string }[]) ?? []) counts[row.assignee_id] = (counts[row.assignee_id] ?? 0) + 1;
        setOpen(counts);
      });
  }, []);

  const person = team.find((p) => p.id === selected);
  const firstName = person?.full_name.trim().split(/\s+/)[0] ?? '';

  return (
    <Sheet title="Responsable" onClose={onClose}>
      <ul className="people">
        {team.map((p) => {
          const n = open?.[p.id] ?? 0;
          return (
            <li key={p.id}>
              <label>
                <span className="who" aria-hidden="true">{initials(p.full_name)}</span>
                <span className="people-name">
                  {p.full_name}{p.id === selfId && ' (tú)'}
                  {open && <small>{n} {n === 1 ? 'tarea abierta' : 'tareas abiertas'}</small>}
                </span>
                <input type="radio" name={name} checked={selected === p.id} onChange={() => setSelected(p.id)} />
              </label>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn block lg" disabled={!person} onClick={() => person && onPick(person)}>
        Asignar a {firstName}
      </button>
    </Sheet>
  );
}
