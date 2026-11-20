// Verifica RF-03 llamando a la API REST directamente con dos usuarios reales.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/check-rls.mjs
// Crea una tarea de Ana, intenta leerla/modificarla/borrarla como Beto y como anónimo,
// y la borra al final. Luego (S14.2) la supervisora crea una tarea asignada a Beto para
// comprobar que Beto solo puede cambiarle el estado, y la borra al final. Por último (S15.1)
// comprueba el borrado del propio chat y el índice único por clientId, y borra lo que creó.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Define SUPABASE_URL y SUPABASE_ANON_KEY');

async function login(email, password) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${body.msg ?? body.error_description}`);
  return { token: body.access_token, id: body.user.id };
}

async function rest(method, path, token, body) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const ana = await login('ana@prueba.com', 'prueba123');
const beto = await login('beto@prueba.com', 'prueba123');

const created = await rest('POST', 'tasks', ana.token, { title: 'Tarea privada de Ana (prueba RLS)' });
check('Ana crea su tarea (sin permission denied)', created.status === 201, created);
const taskId = created.body?.[0]?.id;

const anaRead = await rest('GET', `tasks?id=eq.${taskId}`, ana.token);
check('Ana ve su tarea', anaRead.status === 200 && anaRead.body.length === 1, anaRead);

const betoRead = await rest('GET', `tasks?id=eq.${taskId}`, beto.token);
check('Beto NO ve la tarea de Ana', betoRead.status === 200 && betoRead.body.length === 0, betoRead);

// Desde el rol de supervisor, Beto también ve las tareas que le asignaron (no las que no son suyas).
const betoAll = await rest('GET', 'tasks?select=owner_id,assignee_id', beto.token);
check(
  'Beto solo ve tareas creadas por él o asignadas a él',
  betoAll.status === 200 && betoAll.body.every((t) => t.owner_id === beto.id || t.assignee_id === beto.id),
  betoAll,
);

const betoUpdate = await rest('PATCH', `tasks?id=eq.${taskId}`, beto.token, { title: 'hackeada' });
check('Beto NO puede modificar la tarea de Ana', betoUpdate.status === 200 && betoUpdate.body.length === 0, betoUpdate);

const betoDelete = await rest('DELETE', `tasks?id=eq.${taskId}`, beto.token);
check('Beto NO puede borrar la tarea de Ana', betoDelete.status === 200 && betoDelete.body.length === 0, betoDelete);

const forged = await rest('POST', 'tasks', beto.token, { title: 'falsa', owner_id: ana.id, assignee_id: ana.id });
check('Beto NO puede crear tareas a nombre de Ana', forged.status === 403, forged);

const assign = await rest('PATCH', `tasks?id=eq.${taskId}`, ana.token, { assignee_id: beto.id });
check('Ana (no supervisora) NO puede asignar su tarea a Beto', assign.status === 403, assign);

const role = await rest('PATCH', `profiles?id=eq.${beto.id}`, beto.token, { role: 'supervisor' });
check('Beto NO puede hacerse supervisor', role.status === 401 || role.status === 403, role);

const profiles = await rest('GET', 'profiles?select=id', beto.token);
check('Beto solo ve su propio perfil', profiles.status === 200 && profiles.body.length === 1 && profiles.body[0].id === beto.id, profiles);

const betoChat = await rest('GET', 'chat_messages?select=user_id', beto.token);
check('Beto solo ve su propio chat', betoChat.status === 200 && betoChat.body.every((m) => m.user_id === beto.id), betoChat);

const anon = await rest('GET', 'tasks?select=id', null);
check('Anónimo NO puede leer tareas', anon.status === 401 || anon.status === 403, anon);

// Cambio sorpresa: la supervisora ve todo, asigna y filtra por persona.
const jefa = await login('jefa@prueba.com', 'prueba123');
const jefaRead = await rest('GET', `tasks?id=eq.${taskId}`, jefa.token);
check('Supervisora ve la tarea de Ana', jefaRead.status === 200 && jefaRead.body.length === 1, jefaRead);

const jefaAssign = await rest('PATCH', `tasks?id=eq.${taskId}`, jefa.token, { assignee_id: beto.id });
check('Supervisora asigna la tarea de Ana a Beto', jefaAssign.status === 200 && jefaAssign.body[0]?.assignee_id === beto.id, jefaAssign);

const byPerson = await rest('GET', `tasks?assignee_id=eq.${beto.id}&select=id`, jefa.token);
check('Supervisora filtra por persona', byPerson.status === 200 && byPerson.body.some((t) => t.id === taskId), byPerson);

const betoAssigned = await rest('PATCH', `tasks?id=eq.${taskId}`, beto.token, { status: 'in_progress' });
check('Beto ve y cambia el estado de la tarea que le asignaron', betoAssigned.status === 200 && betoAssigned.body.length === 1, betoAssigned);

const jefaProfiles = await rest('GET', 'profiles?select=id', jefa.token);
check('Supervisora ve todos los perfiles', jefaProfiles.status === 200 && jefaProfiles.body.length >= 3, jefaProfiles);

const cleanup = await rest('DELETE', `tasks?id=eq.${taskId}`, ana.token);
check('Ana borra su tarea de prueba', cleanup.status === 200 && cleanup.body.length === 1, cleanup);

// S14.2: quien solo es responsable cambia el estado y nada más; no puede borrar.
const TITLE = 'Asignada por la jefa (prueba RLS)';
const jefaTask = await rest('POST', 'tasks', jefa.token, { title: TITLE, assignee_id: beto.id });
check('Supervisora crea una tarea asignada a Beto', jefaTask.status === 201 && jefaTask.body?.[0]?.assignee_id === beto.id, jefaTask);
const jefaTaskId = jefaTask.body?.[0]?.id;

const betoStatus = await rest('PATCH', `tasks?id=eq.${jefaTaskId}`, beto.token, { status: 'in_progress' });
check('Beto cambia el estado de la tarea que le asignó la jefa', betoStatus.status === 200 && betoStatus.body[0]?.status === 'in_progress', betoStatus);

const betoTitle = await rest('PATCH', `tasks?id=eq.${jefaTaskId}`, beto.token, { title: 'cambiada por Beto' });
const afterTitle = await rest('GET', `tasks?id=eq.${jefaTaskId}&select=title`, jefa.token);
check(
  'Beto NO puede cambiar el título (error y la fila queda igual)',
  betoTitle.status >= 400 && afterTitle.body?.[0]?.title === TITLE,
  { betoTitle, afterTitle },
);

const betoDeleteAssigned = await rest('DELETE', `tasks?id=eq.${jefaTaskId}`, beto.token);
const afterDelete = await rest('GET', `tasks?id=eq.${jefaTaskId}&select=id`, jefa.token);
check(
  'Beto NO puede borrar la tarea que le asignaron (0 filas)',
  betoDeleteAssigned.status === 200 && betoDeleteAssigned.body.length === 0 && afterDelete.body?.length === 1,
  { betoDeleteAssigned, afterDelete },
);

const jefaTitle = await rest('PATCH', `tasks?id=eq.${jefaTaskId}`, jefa.token, { title: `${TITLE} editada` });
check('Supervisora sí cambia el título', jefaTitle.status === 200 && jefaTitle.body[0]?.title === `${TITLE} editada`, jefaTitle);

const jefaCleanup = await rest('DELETE', `tasks?id=eq.${jefaTaskId}`, jefa.token);
check('Supervisora borra su tarea de prueba', jefaCleanup.status === 200 && jefaCleanup.body.length === 1, jefaCleanup);

// S15.1: cada usuario borra solo sus mensajes del chat; un clientId se reserva una vez por usuario.
const clientId = crypto.randomUUID();
const chatRow = (content) => ({ role: 'user', content, meta: { clientId } });

const anaFirst = await rest('POST', 'chat_messages', ana.token, chatRow('Reserva de prueba RLS'));
check('Ana reserva un mensaje con clientId', anaFirst.status === 201, anaFirst);
const anaFirstId = anaFirst.body?.[0]?.id;

const anaDuplicate = await rest('POST', 'chat_messages', ana.token, chatRow('Reserva repetida'));
check('Ana NO puede reservar dos veces el mismo clientId (violación de único)', anaDuplicate.status === 409 && anaDuplicate.body?.code === '23505', anaDuplicate);

const betoSameId = await rest('POST', 'chat_messages', beto.token, chatRow('Mismo clientId de otro usuario'));
check('Beto sí puede usar el mismo clientId que Ana', betoSameId.status === 201, betoSameId);
const betoChatId = betoSameId.body?.[0]?.id;

const betoDeletesAna = await rest('DELETE', `chat_messages?id=eq.${anaFirstId}`, beto.token);
const anaStillThere = await rest('GET', `chat_messages?id=eq.${anaFirstId}&select=id`, ana.token);
check(
  'Beto NO puede borrar el mensaje de Ana (0 filas)',
  betoDeletesAna.status === 200 && betoDeletesAna.body.length === 0 && anaStillThere.body?.length === 1,
  { betoDeletesAna, anaStillThere },
);

const anaDeletes = await rest('DELETE', `chat_messages?id=eq.${anaFirstId}`, ana.token);
check('Ana borra su propio mensaje', anaDeletes.status === 200 && anaDeletes.body.length === 1, anaDeletes);

const betoDeletes = await rest('DELETE', `chat_messages?id=eq.${betoChatId}`, beto.token);
check('Beto borra su propio mensaje de prueba', betoDeletes.status === 200 && betoDeletes.body.length === 1, betoDeletes);

console.log(failures ? `\n${failures} verificaciones fallaron` : '\nRLS OK: todas las verificaciones pasaron');
process.exit(failures ? 1 : 0);
