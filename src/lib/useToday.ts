import { useEffect, useState } from 'react';
import { addDays, startOfDayUtc, todayIn } from '../../supabase/functions/_shared/dates.ts';

/** Día de hoy en Santo Domingo ("YYYY-MM-DD"); cambia al pasar la medianoche con la app abierta (S14.6). */
export function useToday(): string {
  const [today, setToday] = useState(() => todayIn(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const now = new Date();
      const day = todayIn(now);
      setToday(day);
      // Un segundo de holgura para no despertar justo antes de la medianoche.
      clearTimeout(timer);
      timer = setTimeout(update, Date.parse(startOfDayUtc(addDays(day, 1))) - now.getTime() + 1000);
    };
    // Con el equipo suspendido el temporizador se atrasa: se recalcula al volver a la app.
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    update();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', update);
    };
  }, []);

  return today;
}
