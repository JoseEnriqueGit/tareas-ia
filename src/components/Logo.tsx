import { useId } from 'react';

/**
 * Logo de Tareas IA: un mensaje (burbuja) que se convierte en tarea hecha (tilde) gracias al asistente (chispa).
 * Mismo dibujo que public/logo.svg, del que salen los íconos de la PWA.
 */
export default function Logo({ size = 64, title }: { size?: number; title?: string }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--progress-text)" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${gradient})`} />
      <path fill="#fff" d="M178 136H330A66 66 0 0 1 396 202V286A66 66 0 0 1 330 352H234L160 410L174 352A66 66 0 0 1 112 286V202A66 66 0 0 1 178 136Z" />
      <path d="M184 247L232 295L324 203" fill="none" stroke="var(--primary)" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M398 62Q406 110 454 118Q406 126 398 174Q390 126 342 118Q390 110 398 62Z" fill="var(--medium)" stroke="var(--progress-text)" strokeWidth="14" paintOrder="stroke" strokeLinejoin="round" />
    </svg>
  );
}
