// Sesión sin conexión (RF-24, S14.4). Archivo puro, sin dependencias: lo usan auth.tsx y las pruebas de Deno.
//
// Con el token de acceso vencido y sin red, supabase-js intenta renovarlo, falla con AuthRetryableFetchError
// y getSession() devuelve session: null, pero deja la sesión guardada y no emite SIGNED_OUT. Aquí se decide
// abrir la app en modo de solo lectura con el usuario de esa sesión guardada en vez de mandar al login.

/** Margen con el que auth-js da por vencido un token (EXPIRY_MARGIN_MS en @supabase/auth-js). */
const EXPIRY_MARGIN_MS = 90_000;

/** Lo único que se toma de la sesión guardada: nunca los tokens. */
export type StoredUser = { id: string; email: string | undefined; expired: boolean };

/** Clave de localStorage donde supabase-js guarda la sesión: "sb-<ref del proyecto>-auth-token". */
export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/** Usuario de la sesión guardada, o null si no hay una sesión que se pueda renovar luego. */
export function readStoredUser(storage: { getItem(key: string): string | null }, key: string, now: number): StoredUser | null {
  try {
    const raw = storage.getItem(key);
    const session = raw ? JSON.parse(raw) : null;
    const id = session?.user?.id;
    if (typeof id !== 'string' || !id || !session.refresh_token || typeof session.expires_at !== 'number') return null;
    const email = typeof session.user.email === 'string' ? session.user.email : undefined;
    return { id, email, expired: session.expires_at * 1000 - now < EXPIRY_MARGIN_MS };
  } catch {
    return null;
  }
}

/** Fallo de red o del servidor (5xx): la sesión sigue en pie y se puede reintentar. Otro error es un rechazo. */
export function isNetworkError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'AuthRetryableFetchError';
}

/**
 * Al abrir la app sin red con el token vencido, getSession() tarda ~25 s en rendirse (reintentos de auth-js):
 * se abre ya en modo sin conexión. Con el token vigente getSession() responde al instante sin red.
 */
export function decideStart(online: boolean, stored: StoredUser | null): 'offline' | 'wait' {
  return !online && stored?.expired ? 'offline' : 'wait';
}

/** Qué hacer cuando getSession() no dio una sesión utilizable. */
export function decideWithoutSession(input: { online: boolean; stored: StoredUser | null; error: unknown }): 'offline' | 'login' {
  if (!input.stored) return 'login';
  return !input.online || isNetworkError(input.error) ? 'offline' : 'login';
}

/** Datos guardados para uso sin conexión que no deben quedar en el dispositivo al salir. */
export function offlineDataKeys(keys: string[]): string[] {
  return keys.filter((key) => key === 'profile' || key.startsWith('tasks:'));
}

/** Lo que se usa de localStorage para recorrer y borrar claves. */
export type KeyedStorage = { readonly length: number; key(index: number): string | null; removeItem(key: string): void };

/**
 * Olvida la sesión en este dispositivo sin pasar por auth-js: borra el token guardado y los datos sin conexión.
 * Sin red y con el token vencido, signOut({ scope: 'local' }) intenta renovarlo, falla y deja la sesión guardada.
 */
export function forgetStoredSession(storage: KeyedStorage, key: string): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (name !== null) keys.push(name);
  }
  [key, ...offlineDataKeys(keys)].forEach((name) => storage.removeItem(name));
}
