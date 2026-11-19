import { useEffect, useState } from 'react';
import { supabase, type Profile } from './supabase';

/** Perfiles visibles para el usuario. Por RLS, un supervisor ve a todo el equipo y un usuario solo a sí mismo. */
export function useTeam(enabled: boolean) {
  const [team, setTeam] = useState<Profile[]>([]);
  useEffect(() => {
    if (!enabled) return;
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name')
      .then(({ data }) => setTeam((data as Profile[]) ?? []));
  }, [enabled]);
  return team;
}
