import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './lib/supabase';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, profile: null, loading: true });

const PROFILE_KEY = 'profile';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true });

  useEffect(() => {
    async function load(session: Session | null) {
      if (!session) {
        localStorage.removeItem(PROFILE_KEY);
        setState({ session: null, profile: null, loading: false });
        return;
      }
      // Sin red se usa el último perfil guardado para no dejar el encabezado vacío ni esperar (RF-24).
      const raw = localStorage.getItem(PROFILE_KEY);
      const cached = raw ? (JSON.parse(raw) as Profile) : null;
      const { data } = navigator.onLine
        ? await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).maybeSingle()
        : { data: null };
      const profile = (data as Profile | null) ?? (cached?.id === session.user.id ? cached : null);
      if (data) localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
      setState({ session, profile, loading: false });
    }

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Fuera del callback: supabase-js no admite llamadas a la API dentro de él.
        setTimeout(() => load(session), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function signOut() {
  // Borra los datos guardados para uso sin conexión: no deben quedar en el dispositivo.
  Object.keys(localStorage)
    .filter((key) => key === PROFILE_KEY || key.startsWith('tasks:'))
    .forEach((key) => localStorage.removeItem(key));
  await supabase.auth.signOut();
}
