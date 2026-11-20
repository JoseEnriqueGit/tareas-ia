import { useState, type ReactNode } from 'react';
import { signOut, useAuth } from '../auth';
import { initials, timeOf } from '../lib/format';
import { todayIn } from '../../supabase/functions/_shared/dates.ts';
import Sheet from './Sheet';
import { LogoutIcon } from './Icons';

// Versión y fecha del build, para saber desde el celular qué versión está instalada.
const APP_VERSION = `${__APP_VERSION__} · build ${todayIn(new Date(__BUILD_TIME__))} ${timeOf(__BUILD_TIME__)}`;

type Props = {
  /** Título grande; por defecto, el saludo con el nombre del usuario (RF-04). */
  title?: ReactNode;
  subtitle?: ReactNode;
};

/** Encabezado de las pantallas principales: título y avatar que abre el menú de cuenta. */
export default function AppHeader({ title, subtitle }: Props) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const name = profile?.full_name ?? 'Usuario';
  const isSupervisor = profile?.role === 'supervisor';

  return (
    <header className="app-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="hello">
          {title ?? `Hola, ${name.split(' ')[0]}`}
          {!title && isSupervisor && <span className="role-badge">Supervisora</span>}
        </h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      <button className="avatar" onClick={() => setOpen(true)} aria-label={`Cuenta de ${name}`} aria-haspopup="dialog">
        {initials(name)}
      </button>
      {open && (
        <Sheet title="Cuenta" onClose={() => setOpen(false)}>
          <div className="account">
            <span className="avatar lg" aria-hidden="true">{initials(name)}</span>
            <div>
              <strong>{name}</strong>
              <p className="muted">{session?.user.email} · {isSupervisor ? 'Supervisora' : 'Usuario'}</p>
            </div>
          </div>
          <button className="btn danger-outline block lg" onClick={signOut}>
            <LogoutIcon /> Cerrar sesión
          </button>
          <p className="muted account-note">Al salir se borran las tareas guardadas para usar sin conexión.</p>
          <p className="muted account-note">Versión {APP_VERSION}</p>
        </Sheet>
      )}
    </header>
  );
}
