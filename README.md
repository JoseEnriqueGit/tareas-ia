# Tareas IA — asistente de tareas con IA (PWA)

Escribes en lenguaje natural lo que tienes pendiente ("cobrarle a Juan el viernes y mandarle la cotización a Ana mañana, urgente") y un agente de IA crea y gestiona las tareas en Supabase.

- **Stack:** Vite + React + TypeScript (PWA con `vite-plugin-pwa`) · Supabase (Postgres, Auth, RLS, Edge Function en Deno) · Gemini por su API compatible con OpenAI.
- **URL pública:** _pendiente de publicar en Vercel (RF-27)._
- **Plan inicial:** [PLAN.md](PLAN.md) · **Decisiones:** [DECISIONS.md](DECISIONS.md) · **Guion del video:** [docs/video-guion.md](docs/video-guion.md)

## Usuarios de prueba

| Usuario | Contraseña | Rol |
|---|---|---|
| `ana@tareas-ia.dev` | `Prueba-Ana-2026` | usuario |
| `beto@tareas-ia.dev` | `Prueba-Beto-2026` | usuario |
| `jefa@tareas-ia.dev` | `Prueba-Jefa-2026` | supervisora (cambio sorpresa) |

Ana y Beto sirven para comprobar el aislamiento: cada uno solo ve sus tareas.

## Cómo correrla

Requisitos: Node 22+, Deno 2 (pruebas) y el CLI de Supabase.

```bash
npm install
cp .env.example .env      # completa VITE_SUPABASE_ANON_KEY (Supabase → Project Settings → API Keys → anon public)
npm run dev               # http://localhost:5173
npm test                  # 13 pruebas (fechas y herramientas del agente)
```

### Backend desde cero (otro proyecto de Supabase)

```bash
supabase link --project-ref <ref>
supabase db push                              # crea tablas, RLS, triggers y permisos (RF-29)
supabase functions deploy agent
supabase secrets set AI_API_KEY=... AI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/" AI_MODEL="gemini-3.5-flash-lite"
```

En Auth, desactiva "Confirm email" para poder registrarte sin buzón.

Sembrar los usuarios y nombrar a la supervisora:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> node scripts/seed-users.mjs
```

```sql
update public.profiles set role = 'supervisor'
where id = (select id from auth.users where email = 'jefa@tareas-ia.dev');
```

Para cambiar de modelo o de proveedor (por ejemplo OpenAI con `https://api.openai.com/v1`) basta con cambiar los tres secretos `AI_*`. No hay que tocar código.

## Estado de los requisitos

En "Cómo se verificó":
- **E2E** es una prueba en el navegador (ego-lite) contra el build de producción, a 360 px.
- **API** es una prueba con llamadas reales a la API de Supabase o a la Edge Function.

| RF | Requisito | Estado | Cómo se verificó / cómo verificarlo |
|---|---|---|---|
| RF-01 | Registro y login | Hecho | E2E: registro → nombre en el encabezado → cerrar sesión → volver a entrar. |
| RF-02 | Rutas protegidas | Hecho | E2E: sin sesión, `/asistente` redirige a `/login`. |
| RF-03 | Aislamiento con RLS | Hecho | API: `node scripts/check-rls.mjs` (18 comprobaciones con Ana, Beto, la supervisora y anónimo). |
| RF-04 | Nombre en el encabezado | Hecho | E2E. |
| RF-05 | Crear tarea manual | Hecho | E2E: aparece en la lista sin recargar. |
| RF-06 | Vistas Hoy / Próximas / Vencidas / Completadas | Hecho | E2E + pruebas de `taskView`. Sin fecha → Próximas. |
| RF-07 | Editar y eliminar | Hecho | E2E: los cambios persisten al recargar; eliminar pide confirmación. |
| RF-08 | Estado con un toque | Hecho | E2E: Pendiente → En progreso → Hecha, persiste al recargar. |
| RF-09 | Filtros combinados y búsqueda *(deseable)* | Hecho | E2E del filtro por persona. Los filtros de texto, estado y prioridad (filtrado en el cliente) **no se verificaron** en E2E. |
| RF-10 | Validación junto al campo | Hecho | E2E: título vacío. La fecha inválida se detecta con `validity.badInput`; no está en E2E. |
| RF-11 | Etiquetas *(deseable)* | Fuera | Ver "Qué quedó fuera". |
| RF-12 | Chat crea tarea | Hecho | API en vivo: "Recuérdame cobrarle a Juan el viernes" → "Cobrarle a Juan", 2026-11-20. |
| RF-13 | Varias tareas en un mensaje | Hecho | API en vivo: 2 tareas; alta solo en la cotización de Ana. |
| RF-14 | Herramientas validadas en el backend | Hecho | `npm test` (Zod, no se toca la base si los parámetros son inválidos) + en vivo. |
| RF-15 | Consultas con datos reales | Hecho | API en vivo: "¿Qué tengo pendiente esta semana?" lista exactamente las 3 tareas de la base. |
| RF-16 | Modificar por chat; pregunta si es ambiguo | Hecho | API en vivo: con dos tareas de Juan preguntó cuál; después completó la elegida. |
| RF-17 | Confirmar al eliminar y resumen con enlaces | Hecho | API en vivo: `eliminar_tarea` no borra y devuelve `pendingDelete`. E2E: "Creé 1 tarea" con un enlace que abre la tarea. El botón "Sí, eliminar" del chat no se probó en E2E. |
| RF-18 | Manejo de fallos de la IA | Hecho | API en vivo: 429 real con mensaje claro y sin cambios en la base. Los botones "Reintentar" y "Crear tarea a mano" existen, pero no se ejercitaron con un fallo real en el navegador. |
| RF-19 | Fechas en America/Santo_Domingo | Hecho | `npm test`: casos a las 23:30 locales (ya es otro día en UTC) y "el viernes" cuando hoy es viernes. |
| RF-20 | Historial guardado *(deseable)* | Hecho | E2E: la conversación sigue al recargar. |
| RF-21 | Dictado por voz *(deseable)* | Parcial | Botón con Web Speech API (`es-DO`), visible solo en navegadores compatibles. **No se probó con micrófono real.** |
| RF-22 | Mobile-first 360 px | Hecho | E2E: sin scroll horizontal y objetivos táctiles de al menos 44 px en todas las pantallas. |
| RF-23 | Instalable (manifest, íconos, tema) | Hecho | Manifest con 192/512, maskable, `standalone` y `theme_color`. **Falta instalarla en un celular real** (requiere la URL pública). |
| RF-24 | Sin conexión básico | Hecho | E2E: sin red, el shell abre desde el service worker y en 0,2 s se ven las últimas tareas con el aviso "Sin conexión". |
| RF-25 | Carga, vacío y error | Hecho | E2E con y sin red: ninguna pantalla en blanco ni congelada. |
| RF-26 | Notificaciones push *(deseable)* | Fuera | Ver "Qué quedó fuera". |
| RF-27 | URL pública | Pendiente | Listo para Vercel (`vercel.json`); falta la autorización para publicar. |
| RF-28 | Llaves de IA fuera del navegador | Hecho | La llave solo existe como secreto de la Edge Function; el bundle y el repo no contienen llaves (revisado con grep). |
| RF-29 | Esquema versionado | Hecho | `supabase/migrations/` se aplicó con `supabase db push` a un proyecto vacío. |
| RF-30 | Pruebas automáticas *(deseable)* | Hecho | `npm test`: 13 pruebas (7 de fechas y 6 de herramientas del agente). |

### Cambio sorpresa: rol de supervisor

> "El jefe quiere ver las tareas de todo el equipo. Necesitamos un rol de supervisor que vea todas las tareas, se las pueda asignar a otros usuarios y filtre por persona."

**Impacto:** bajo, porque el esquema ya lo preveía (rol en `profiles`, responsable como FK y RLS con `is_supervisor()`). Solo hubo cambios de interfaz y del agente:
- **Interfaz:** el formulario muestra el selector "Responsable" y la lista tiene el filtro "Todas las personas".
- **Agente:** si quien escribe es supervisor, recibe la lista del equipo y puede asignar con `responsable_id` (por ejemplo "asígnale a Beto revisar el inventario"). Probado en vivo: "Asígnale a Beto revisar el inventario el lunes" creó la tarea para Beto Gómez con fecha 2026-11-23.

**Verificado:**
- Por API: la supervisora ve y reasigna tareas ajenas y filtra por persona; Beto ve la tarea que le asignaron y le cambia el estado; un usuario normal no puede asignar a otros (lo impiden RLS y un trigger).
- E2E: la insignia, el filtro y el selector.

**Decidido sin respuesta del evaluador:**
- El rol se asigna por SQL, no desde la app.
- La supervisora también edita y elimina tareas de cualquiera.

## Qué quedó fuera (lista honesta)
- **RF-11 etiquetas y RF-26 push:** son deseables caros (push necesita VAPID, suscripciones y un cron). Prioricé que lo obligatorio funcione.
- **RF-27:** la app no está publicada todavía; espera autorización del dueño. Por lo tanto, **no se probó la instalación en un celular real** (RF-23) ni el video.
- **RF-21:** implementado, pero sin probar con micrófono real.
- **Sin conexión solo se lee:** crear o editar requiere red. No hay cola de sincronización (el brief no la pide).
- **Agente:** no se le dio una herramienta de "deshacer". En la capa gratuita de Gemini (~10 RPM), varios mensajes seguidos pueden devolver 429; la app lo informa y permite reintentar.
- **El video** de 3 a 5 minutos no se grabó; está el guion.

## Dudas para el evaluador (y lo que se decidió mientras tanto)
1. ¿La fecha límite es solo fecha o también hora? → **Solo fecha.**
2. ¿Dónde van las tareas sin fecha? → **En Próximas.**
3. Si hoy es viernes, ¿"el viernes" es hoy? → **No, es el de la semana que viene.**
4. ¿El responsable es un usuario de la app o un nombre libre? → **Un usuario de la app.** "Juan" (un cliente) va en el título.
5. RF-14 no incluye "eliminar", pero RF-17 pide eliminar por chat. → **`eliminar_tarea` solo propone;** borra un botón de confirmación.
6. ¿Se puede desactivar la confirmación por email? → **Sí,** para la prueba.
7. ¿Qué puede hacer el supervisor y quién lo nombra? → **Ve, asigna, edita y elimina; se nombra por SQL.**
8. ¿El usuario ve las tareas que le asigna el supervisor? → **Sí, y puede cambiarles el estado.**

## Cómo se usó IA
- **Qué se delegó:** el código lo escribió un agente de programación (Claude, en Gentle Shell) siguiendo este brief y un plan aprobado antes de empezar. La prueba en el navegador la hizo un agente verificador independiente con ego-lite.
- **Qué se revisó:**
  - Cada requisito se comprobó contra el sistema real, no solo leyendo código: un script de RLS con usuarios reales, llamadas en vivo al agente con los casos del brief y una prueba E2E a 360 px con y sin red.
  - Se revisó con grep que no haya llaves en el bundle ni en el repo.
- **Qué se corrigió gracias a esas pruebas:**
  - Gemini 3.5 rechazaba `reasoning_effort: "none"` con un 400 genérico; se cambió a `"minimal"` y se reenvía la `thought_signature`.
  - Sin red la lista tardaba 14 s; ahora se pinta desde caché al instante.
  - El perfil quedaba guardado después de cerrar sesión.
  - Había objetivos táctiles de menos de 44 px.
  - La configuración del CLI de Supabase era incompatible con la v3.
- **Lo que decidió una persona:** el stack, las respuestas por defecto a las dudas y que no se publique sin autorización.

## Estructura
```
src/                       app React (páginas, auth, estilos)
supabase/migrations/       esquema, RLS y permisos
supabase/functions/agent/  Edge Function del agente (ai.ts, tools.ts, index.ts) + pruebas
supabase/functions/_shared/dates.ts  fechas en Santo Domingo (compartido con el frontend)
scripts/                   siembra de usuarios y verificación de RLS
```
