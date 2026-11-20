// Actualizaciones de la PWA instalada. El service worker nuevo queda en espera y la app decide:
// si no hay nada escrito, se actualiza sola; si lo hay, avisa para no perderlo.
import { registerSW } from 'virtual:pwa-register';

const HOUR = 60 * 60 * 1000;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let ready = false;
const listeners = new Set<(ready: boolean) => void>();

/** Hay texto escrito por el usuario que una recarga borraría (chat, formulario, login, búsqueda). */
function hasTypedText(): boolean {
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input')].some(
    (field) => !['hidden', 'radio', 'checkbox'].includes(field.type) && field.value.trim() !== '',
  );
}

export function startUpdateChecks() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (!hasTypedText()) {
        applyUpdate();
        return;
      }
      ready = true;
      listeners.forEach((listener) => listener(true));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Busca una versión nueva al volver a la app y cada hora mientras está abierta.
      const check = () => navigator.onLine && registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, HOUR);
    },
  });
}

/** Activa el service worker nuevo y recarga la página con la versión nueva. */
export function applyUpdate() {
  updateSW?.(true);
}

export function onUpdateReady(listener: (ready: boolean) => void) {
  listeners.add(listener);
  listener(ready);
  return () => {
    listeners.delete(listener);
  };
}
