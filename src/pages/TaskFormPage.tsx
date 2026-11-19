import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  supabase,
  errorMessage,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_SELECT,
  type Priority,
  type Status,
  type Task,
} from '../lib/supabase';
import { isValidIsoDate } from '../../supabase/functions/_shared/dates.ts';
import { useTeam } from '../lib/useTeam';

type Form = { title: string; description: string; due_date: string; priority: Priority; status: Status };
type FieldErrors = Partial<Record<'title' | 'due_date', string>>;

const EMPTY: Form = { title: '', description: '', due_date: '', priority: 'medium', status: 'pending' };

export default function TaskFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isSupervisor = profile?.role === 'supervisor';
  const team = useTeam(isSupervisor);
  const dateRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const [assigneeId, setAssigneeId] = useState(profile?.id ?? '');
  const [assigneeName, setAssigneeName] = useState(profile?.full_name ?? '');
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    if (Object.keys(errors).length) return;

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
    navigate('/');
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    setBusy(false);
    if (error) return setSaveError(errorMessage(error));
    navigate('/');
  }

  if (loading) return <p className="center muted">Cargando tarea…</p>;
  if (loadError)
    return (
      <div className="error-box" role="alert">
        <p>{loadError}</p>
        <Link to="/" className="btn small">Volver a la lista</Link>
      </div>
    );

  return (
    <form onSubmit={save} className="form" noValidate>
      <h1>{isNew ? 'Nueva tarea' : 'Editar tarea'}</h1>

      <label>
        Título *
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={!!fieldErrors.title}
          maxLength={200}
        />
        {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
      </label>

      <label>
        Descripción
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
      </label>

      <label>
        Fecha límite
        <input
          ref={dateRef}
          type="date"
          value={form.due_date}
          onChange={(e) => set('due_date', e.target.value)}
          aria-invalid={!!fieldErrors.due_date}
        />
        {fieldErrors.due_date && <span className="field-error">{fieldErrors.due_date}</span>}
      </label>

      <div className="row">
        <label>
          Prioridad
          <select value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={form.status} onChange={(e) => set('status', e.target.value as Status)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Responsable
        {isSupervisor ? (
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            {team.length === 0 && <option value={assigneeId}>{assigneeName}</option>}
            {team.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        ) : (
          <input value={assigneeName} disabled />
        )}
      </label>

      {saveError && <p className="error" role="alert">{saveError}</p>}

      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <Link to="/" className="btn secondary">Cancelar</Link>
      </div>

      {!isNew && !confirmDelete && (
        <button type="button" className="btn danger-outline" onClick={() => setConfirmDelete(true)}>
          Eliminar tarea
        </button>
      )}
      {confirmDelete && (
        <div className="confirm" role="alertdialog" aria-label="Confirmar eliminación">
          <p>¿Eliminar «{form.title}»? No se puede deshacer.</p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>Sí, eliminar</button>
            <button type="button" className="btn secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </form>
  );
}
