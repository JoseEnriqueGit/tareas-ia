// Actualizaciones de la PWA instalada. El service worker nuevo queda en espera y la app decide:
// si no hay nada escrito, se actualiza sola; si lo hay, avisa para no perderlo.
import { registerSW } from 'virtual:pwa-register';

const HOUR = 60 * 60 * 1000;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
// Hay una versión nueva esperando. El navegador lo avisa una sola vez, así que se recuerda
// para aplicarla más tarde (p. ej. si el usuario tocó "Más tarde" y luego borró el texto).
let pending = false;
const listeners = new Set<() => void>();

/** Hay texto escrito por el usuario que una recarga borraría (chat, formulario, login, búsqueda). */
function hasTypedText(): boolean {
  // Recargar borraría lo escrito; los campos ocultos, radio y checkbox no cuentan.
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input')].some(
    (field) => !['hidden', 'radio', 'checkbox'].includes(field.type) && field.value.trim() !== '',
  );
}

/** Aplica la versión pendiente si no se pierde nada; si no, (re)muestra el aviso. */
function applyOrNotify() {
  if (!pending) return;
  if (hasTypedText()) listeners.forEach((listener) => listener());
  else applyUpdate();
}

export function startUpdateChecks() {
  updateSW = registerSW({
    // Sin autoUpdate: la decisión de recargar la toma applyOrNotify, no el navegador.
    immediate: true,
    onNeedRefresh() {
      pending = true;
      applyOrNotify();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Al volver a la app y cada hora: aplica lo pendiente y busca una versión nueva.
      const check = () => {
        applyOrNotify();
        if (navigator.onLine) registration.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, HOUR);
    },
  });
}

/** Activa el service worker nuevo y recarga la página con la versión nueva. */
export function applyUpdate() {
  updateSW?.(true);
}

/** Avisa cada vez que hay una versión nueva que no se aplicó sola por haber texto escrito. */
export function onUpdateReady(listener: () => void) {
  listeners.add(listener);
  if (pending) listener();
  return () => {
    listeners.delete(listener);
  };
}
