import { useEffect, useState } from 'react';
import { applyUpdate, onUpdateReady } from '../lib/pwaUpdate';

/** Aviso de versión nueva; solo aparece cuando actualizar sola borraría algo que el usuario escribió. */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => onUpdateReady(setReady), []);

  if (!ready || dismissed) return null;
  return (
    <div className="update-banner" role="status">
      <span>Hay una versión nueva de la app.</span>
      <button className="btn" onClick={applyUpdate}>Actualizar</button>
      <button className="icon-btn" onClick={() => setDismissed(true)} aria-label="Más tarde">✕</button>
    </div>
  );
}
