-- S14.2: quien solo es responsable de una tarea (no la creó ni es supervisor) puede cambiar
-- el estado y nada más. Reemplaza public.tasks_before_write() conservando todo lo anterior
-- (updated_at, completed_at y la regla de reasignación). Se puede volver a ejecutar.

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.assignee_id is distinct from old.assignee_id
       and new.assignee_id <> auth.uid()
       and not public.is_supervisor() then
      raise exception 'Solo un supervisor puede asignar tareas a otra persona'
        using errcode = '42501';
    end if;
    if old.owner_id is distinct from auth.uid()
       and not public.is_supervisor()
       and (new.title is distinct from old.title
         or new.description is distinct from old.description
         or new.due_date is distinct from old.due_date
         or new.priority is distinct from old.priority
         or new.assignee_id is distinct from old.assignee_id) then
      raise exception 'Solo puedes cambiar el estado de una tarea que te asignaron'
        using errcode = '42501';
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- `create or replace` conserva el trigger y los privilegios; se repite el revoke por si acaso.
revoke all on function public.tasks_before_write() from public, anon;
