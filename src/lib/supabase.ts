import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (ver .env.example).');
}

export const supabase = createClient(url, anonKey);

export type Priority = 'low' | 'medium' | 'high';
export type Status = 'pending' | 'in_progress' | 'done';

export type Profile = { id: string; full_name: string; role: 'user' | 'supervisor' };

export type Task = {
  id: string;
  owner_id: string;
  assignee_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  status: Status;
  completed_at: string | null;
  created_at: string;
  assignee: { full_name: string } | null;
};

export const TASK_SELECT = '*, assignee:profiles!tasks_assignee_id_fkey(full_name)';

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Baja', medium: 'Media', high: 'Alta' };
export const STATUS_LABEL: Record<Status, string> = { pending: 'Pendiente', in_progress: 'En progreso', done: 'Hecha' };

/** Mensaje legible para errores de Supabase o de red. */
export function errorMessage(error: unknown): string {
  if (!navigator.onLine) return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (error.message === 'Failed to fetch') return 'No se pudo conectar con el servidor.';
    return error.message;
  }
  return 'Ocurrió un error inesperado.';
}
