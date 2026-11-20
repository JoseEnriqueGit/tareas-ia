// Crea los usuarios de prueba con la API pública de Auth (sin service_role).
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/seed-users.mjs
// El rol de supervisor se asigna después por SQL (ver README).
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Define SUPABASE_URL y SUPABASE_ANON_KEY');

export const USERS = [
  { email: 'ana@prueba.com', password: 'prueba123', full_name: 'Ana Pérez' },
  { email: 'beto@prueba.com', password: 'prueba123', full_name: 'Beto Gómez' },
  { email: 'jefa@prueba.com', password: 'prueba123', full_name: 'Carla Jefa' },
];

for (const user of USERS) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password, data: { full_name: user.full_name } }),
  });
  const body = await response.json();
  const status = response.ok ? 'creado' : body.msg ?? body.error_description ?? response.status;
  console.log(`${user.email}: ${status}`);
}
