// Prueba de Deno (npm test). tsconfig.json excluye los *.test.ts; offlineSession.ts sí lo revisan tsc y Deno.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  authStorageKey,
  decideStart,
  decideWithoutSession,
  isNetworkError,
  offlineDataKeys,
  readStoredUser,
  type StoredUser,
} from './offlineSession.ts';

const KEY = 'sb-abcd-auth-token';
const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);

/** Sesión con la forma que guarda supabase-js en localStorage. */
function storedSession(expiresAt: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: 'u-1', email: 'ana@example.com', role: 'authenticated' },
    ...extra,
  });
}

const storageWith = (value: string | null) => ({ getItem: (key: string) => (key === KEY ? value : null) });

const expiredUser: StoredUser = { id: 'u-1', email: 'ana@example.com', expired: true };
const validUser: StoredUser = { id: 'u-1', email: 'ana@example.com', expired: false };
const networkError = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 };
const rejectedError = { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 };

Deno.test('la clave del token es la misma que usa supabase-js: sb-<ref>-auth-token', () => {
  assertEquals(authStorageKey('https://abcd.supabase.co'), KEY);
  assertEquals(authStorageKey('https://xyzproj.supabase.co/'), 'sb-xyzproj-auth-token');
});

Deno.test('readStoredUser devuelve solo id, email y si el token venció (nunca los tokens)', () => {
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW) + 3600)), KEY, NOW), validUser);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW) - 60)), KEY, NOW), expiredUser);
  const user = readStoredUser(storageWith(storedSession(seconds(NOW) - 60)), KEY, NOW)!;
  assertEquals(Object.keys(user).sort(), ['email', 'expired', 'id']);
  assertEquals(JSON.stringify(user).includes('secret'), false);
});

Deno.test('readStoredUser cuenta como vencido el token dentro del margen de 90 s de auth-js', () => {
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW) + 60)), KEY, NOW)?.expired, true);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW) + 91)), KEY, NOW)?.expired, false);
});

Deno.test('readStoredUser sin email lo deja undefined', () => {
  const raw = storedSession(seconds(NOW) - 60, { user: { id: 'u-2' } });
  assertEquals(readStoredUser(storageWith(raw), KEY, NOW), { id: 'u-2', email: undefined, expired: true });
});

Deno.test('readStoredUser devuelve null si no hay una sesión utilizable guardada', () => {
  assertEquals(readStoredUser(storageWith(null), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith('{no es json'), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith('null'), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW), { user: null })), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW), { user: { email: 'x@y.z' } })), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW), { refresh_token: '' })), KEY, NOW), null);
  assertEquals(readStoredUser(storageWith(storedSession(seconds(NOW), { expires_at: 'mañana' })), KEY, NOW), null);
  const throwing = { getItem: (): string | null => { throw new Error('bloqueado'); } };
  assertEquals(readStoredUser(throwing, KEY, NOW), null);
});

Deno.test('isNetworkError: solo el error reintentable de auth-js (sin red o 5xx)', () => {
  assertEquals(isNetworkError(networkError), true);
  assertEquals(isNetworkError(rejectedError), false);
  assertEquals(isNetworkError(null), false);
  assertEquals(isNetworkError(new Error('Failed to fetch')), false);
});

Deno.test('decideStart: sin red y con el token vencido se abre sin conexión sin esperar a getSession', () => {
  assertEquals(decideStart(false, expiredUser), 'offline');
  assertEquals(decideStart(false, validUser), 'wait');
  assertEquals(decideStart(true, expiredUser), 'wait');
  assertEquals(decideStart(false, null), 'wait');
});

Deno.test('decideWithoutSession: sin red y con sesión guardada, modo sin conexión (RF-24)', () => {
  assertEquals(decideWithoutSession({ online: false, stored: expiredUser, error: networkError }), 'offline');
  assertEquals(decideWithoutSession({ online: false, stored: expiredUser, error: null }), 'offline');
});

Deno.test('decideWithoutSession: con red, un fallo de red mantiene el modo sin conexión; un rechazo lleva al login', () => {
  assertEquals(decideWithoutSession({ online: true, stored: expiredUser, error: networkError }), 'offline');
  assertEquals(decideWithoutSession({ online: true, stored: expiredUser, error: rejectedError }), 'login');
  assertEquals(decideWithoutSession({ online: true, stored: expiredUser, error: null }), 'login');
});

Deno.test('decideWithoutSession: sin sesión guardada siempre es el login', () => {
  assertEquals(decideWithoutSession({ online: false, stored: null, error: networkError }), 'login');
  assertEquals(decideWithoutSession({ online: true, stored: null, error: null }), 'login');
});

Deno.test('offlineDataKeys: el perfil y las tareas guardadas, nada más', () => {
  const keys = ['profile', 'tasks:u-1', 'tasks:u-1:at', 'sb-abcd-auth-token', 'chat:u-1', 'profiles', 'mytasks:x'];
  assertEquals(offlineDataKeys(keys), ['profile', 'tasks:u-1', 'tasks:u-1:at']);
});
