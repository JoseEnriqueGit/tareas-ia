import { useEffect, useState } from 'react';
import { applyUpdate, onUpdateReady } from '../lib/pwaUpdate';

/** Aviso de versión nueva; solo aparece cuando actualizar sola borraría algo que el usuario escribió. */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  // Si el usuario tocó "Más tarde", vuelve a aparecer en la siguiente comprobación.
  useEffect(() => onUpdateReady(() => setVisible(true)), []);

  if (!visible) return null;
  return (
    <div className="update-banner" role="status">
      <span>Hay una versión nueva de la app.</span>
      <button className="btn" onClick={applyUpdate}>Actualizar</button>
      <button className="icon-btn" onClick={() => setVisible(false)} aria-label="Más tarde">✕</button>
    </div>
  );
}
