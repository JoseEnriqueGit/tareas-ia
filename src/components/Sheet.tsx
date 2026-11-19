import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Acción opcional junto al título (p. ej. "Limpiar"). */
  headerAction?: ReactNode;
  /** alertdialog para confirmaciones destructivas. */
  role?: 'dialog' | 'alertdialog';
};

/**
 * Hoja que sube desde abajo. Al abrir mueve el foco adentro; Escape o tocar el fondo la cierran,
 * y al cerrar el foco vuelve al control que la abrió. Se pinta en <body> para quedar siempre
 * encima, aunque la abra un elemento fijo o sticky.
 */
export default function Sheet({ title, onClose, children, headerAction, role = 'dialog' }: Props) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  // La última función de cierre, sin volver a montar la hoja (y mover el foco) en cada render.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, []);

  return createPortal(
    <>
      <div className="scrim" onClick={() => close.current()} aria-hidden="true" />
      <section ref={ref} className="sheet" role={role} aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          {headerAction}
        </div>
        {children}
      </section>
    </>,
    document.body,
  );
}
