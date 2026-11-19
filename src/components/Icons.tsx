// Íconos SVG en línea (sin dependencias). Son decorativos: el control que los usa lleva su propio nombre accesible.
import type { Status } from '../lib/supabase';

type Props = { size?: number };

function Svg({ size = 22, width = 2, children }: { size?: number; width?: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PlusIcon = ({ size }: Props) => <Svg size={size} width={2.5}><path d="M12 5v14M5 12h14" /></Svg>;
export const BackIcon = ({ size }: Props) => <Svg size={size} width={2.4}><path d="m15 5-7 7 7 7" /></Svg>;
export const SearchIcon = ({ size = 18 }: Props) => <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const FilterIcon = ({ size = 18 }: Props) => <Svg size={size}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>;
export const MicIcon = ({ size }: Props) => <Svg size={size}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>;
export const SendIcon = ({ size }: Props) => <Svg size={size} width={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const TasksIcon = ({ size = 24 }: Props) => <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></Svg>;
export const ChatIcon = ({ size = 24 }: Props) => <Svg size={size}><path d="M4 5h16v11H9l-5 4z" /><path d="M9 10h6" /></Svg>;
export const LogoutIcon = ({ size }: Props) => <Svg size={size}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Svg>;
export const OfflineIcon = ({ size = 18 }: Props) => <Svg size={size} width={2.2}><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M3 3l18 18" /></Svg>;
export const SunIcon = ({ size = 34 }: Props) => <Svg size={size}><circle cx="12" cy="12" r="5" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></Svg>;
export const CheckIcon = ({ size = 14 }: Props) => <Svg size={size} width={3}><path d="m5 12 5 5 9-10" /></Svg>;
export const ChevronIcon = ({ size = 18 }: Props) => <Svg size={size}><path d="m9 6 6 6-6 6" /></Svg>;

/** Círculo de estado: vacío = pendiente, a medias = en progreso, con tilde = hecha. */
export function StatusCircle({ status }: { status: Status }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      {status === 'done' ? (
        <>
          <circle cx="13" cy="13" r="12" fill="var(--done-text)" />
          <path d="m8 13.5 3.2 3.2L18.5 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="13" cy="13" r="11" fill="none" stroke={status === 'in_progress' ? 'var(--primary)' : 'var(--muted)'} strokeWidth="2" />
          {status === 'in_progress' && <path d="M13 2a11 11 0 0 1 0 22z" fill="var(--primary)" />}
        </>
      )}
    </svg>
  );
}
