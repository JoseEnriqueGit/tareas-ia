import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './lib/supabase';
import { authStorageKey, decideStart, decideWithoutSession, offlineDataKeys, readStoredUser } from './lib/offlineSession';

/** Lo que las pantallas usan de la sesión. Sin conexión y con el token vencido solo se conoce el usuario. */
type AuthSession = { user: { id: string; email?: string } };

type AuthState = {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
  /** Sin token utilizable: solo lectura con lo guardado hasta recuperar la sesión (RF-24). */
  offline: boolean;
};

const INITIAL: AuthState = { session: null, profile: null, loading: true, offline: false };

const AuthContext = createContext<AuthState>(INITIAL);

const PROFILE_KEY = 'profile';
const SESSION_KEY = authStorageKey(import.meta.env.VITE_SUPABASE_URL);
// Con red pero sin poder renovar el token (servidor caído, o auth-js aún en su pausa tras un fallo), se reintenta.
const RETRY_MS = 15_000;

function cachedProfile(userId: string): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  const cached = raw ? (JSON.parse(raw) as Profile) : null;
  return cached?.id === userId ? cached : null;
}

/** Borra los datos guardados para uso sin conexión: no deben quedar en el dispositivo. */
function clearOfflineData() {
  offlineDataKeys(Object.keys(localStorage)).forEach((key) => localStorage.removeItem(key));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);

  useEffect(() => {
    let disposed = false;
    let offline = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function load(session: Session | null, error: unknown = null) {
      clearTimeout(retry);
      if (session) {
        offline = false;
        // Sin red se usa el último perfil guardado para no dejar el encabezado vacío ni esperar (RF-24).
        const { data } = navigator.onLine
          ? await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).maybeSingle()
          : { data: null };
        const profile = (data as Profile | null) ?? cachedProfile(session.user.id);
        if (data) localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        setState({ session, profile, loading: false, offline: false });
        return;
      }
      // Token vencido sin red: supabase-js no da sesión pero la deja guardada; se abre en solo lectura (S14.4).
      const stored = readStoredUser(localStorage, SESSION_KEY, Date.now());
      if (stored && decideWithoutSession({ online: navigator.onLine, stored, error }) === 'offline') {
        offline = true;
        setState({
          session: { user: { id: stored.id, email: stored.email } },
          profile: cachedProfile(stored.id),
          loading: false,
          offline: true,
        });
        if (navigator.onLine) retry = setTimeout(recover, RETRY_MS);
        return;
      }
      // Sin sesión, también tras un SIGNED_OUT que no vino de signOut() (p. ej. el servidor rechazó el token).
      offline = false;
      clearOfflineData();
      setState({ session: null, profile: null, loading: false, offline: false });
    }

    async function recover() {
      const { data, error } = await supabase.auth.getSession();
      if (!disposed) await load(data.session, error);
    }

    // Al volver la red se intenta renovar la sesión; si el servidor la rechaza, load() lleva al login.
    function onOnline() {
      if (offline) recover();
    }

    // Sin red y con el token vencido, getSession() tarda en rendirse: se muestra ya lo guardado.
    if (decideStart(navigator.onLine, readStoredUser(localStorage, SESSION_KEY, Date.now())) === 'offline') load(null);
    recover();
    window.addEventListener('online', onOnline);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED cuenta solo para salir del modo sin conexión (renovación automática de supabase-js).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || (event === 'TOKEN_REFRESHED' && offline)) {
        // Fuera del callback: supabase-js no admite llamadas a la API dentro de él.
        setTimeout(() => load(session), 0);
      }
    });
    return () => {
      disposed = true;
      clearTimeout(retry);
      window.removeEventListener('online', onOnline);
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function signOut() {
  clearOfflineData();
  const { error } = await supabase.auth.signOut();
  // Sin red la salida global falla y deja la sesión guardada: se cierra al menos en este dispositivo.
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
