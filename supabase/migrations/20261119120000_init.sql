-- Esquema inicial: perfiles con rol, tareas y mensajes del chat.
-- Este proyecto no expone tablas nuevas a la API por defecto: cada tabla
-- revoca todo y concede solo lo mínimo a `authenticated` (nada a `anon`).

-- Perfiles ------------------------------------------------------------------

create table public.profiles (
  -- Mismo id que auth.users: el perfil nace y muere con la cuenta.
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 80),
  -- Por defecto 'user'; el rol supervisor solo se asigna desde el panel/SQL, nunca desde la app (no hay grant de update sobre role).
  role text not null default 'user' check (role in ('user', 'supervisor')),
  created_at timestamptz not null default now()
);

-- Consulta el rol sin pasar por RLS (evita recursión en las políticas de profiles).
create function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'supervisor'
  );
$$;

-- Crea el perfil al registrarse, con el nombre enviado en el signUp.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tareas --------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  -- owner = quien la creó; assignee = quien la ejecuta. Ambos toman por defecto al usuario autenticado.
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  assignee_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 2000),
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  -- completed_at lo fija el trigger, no el cliente.
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_owner_idx on public.tasks (owner_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- Mantiene updated_at y completed_at, y solo deja reasignar a un supervisor
-- (o a uno mismo).
create function public.tasks_before_write()
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
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- BEFORE: el trigger puede corregir la fila (fechas, completed_at) o rechazarla antes de guardarla.
create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Mensajes del chat ---------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- El historial se lee por usuario y orden cronológico.
create index chat_messages_user_idx on public.chat_messages (user_id, created_at);

-- RLS -----------------------------------------------------------------------

-- Sin política no hay acceso: RLS es la barrera real; la app y el agente corren con el JWT del usuario.
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles: ver el propio o todos si es supervisor"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_supervisor()));

create policy "profiles: editar el propio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "tasks: ver propias, asignadas o todas si es supervisor"
  on public.tasks for select to authenticated
  using (
    owner_id = (select auth.uid())
    or assignee_id = (select auth.uid())
    or (select public.is_supervisor())
  );

-- Con (select auth.uid()) Postgres evalúa la función una vez por consulta y no por fila.
create policy "tasks: crear como dueño, asignada a sí mismo salvo supervisor"
  on public.tasks for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (assignee_id = (select auth.uid()) or (select public.is_supervisor()))
  );

create policy "tasks: editar propias, asignadas o todas si es supervisor"
  on public.tasks for update to authenticated
  using (
    owner_id = (select auth.uid())
    or assignee_id = (select auth.uid())
    or (select public.is_supervisor())
  )
  with check (
    owner_id = (select auth.uid())
    or assignee_id = (select auth.uid())
    or (select public.is_supervisor())
  );

create policy "tasks: eliminar propias o todas si es supervisor"
  on public.tasks for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_supervisor()));

-- El chat es privado, ni siquiera el supervisor lo ve.
create policy "chat_messages: ver los propios"
  on public.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));

create policy "chat_messages: crear los propios"
  on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Privilegios mínimos -------------------------------------------------------

revoke all on public.profiles, public.tasks, public.chat_messages from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, insert, delete on public.tasks to authenticated;
-- Update por columnas: owner_id, completed_at y fechas del sistema no se pueden tocar desde la API.
grant update (title, description, due_date, priority, status, assignee_id) on public.tasks to authenticated;

grant select, insert on public.chat_messages to authenticated;

-- Las funciones SECURITY DEFINER no se exponen a anon; handle_new_user solo la dispara el trigger.
revoke all on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.tasks_before_write() from public, anon;
