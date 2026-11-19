# Decisiones técnicas

Cada decisión con su porqué y lo que se descartó. Sirve para explicar el proyecto en la revisión en vivo.

## 1. Stack mínimo
- **Qué:** Vite + React + TypeScript, `react-router-dom`, `@supabase/supabase-js` y `vite-plugin-pwa`. CSS propio. `zod` solo en la Edge Function.
- **Por qué:** ningún requisito pide estado global, formularios complejos ni una librería de componentes. Menos dependencias = menos cosas que explicar y que se rompan.
- **Descartado:** Next.js (no hace falta SSR y complica la PWA), Redux/Zustand, Tailwind o MUI, React Query (la lista se recarga al volver al listado, y alcanza).

## 2. Esquema pensado para el "cambio sorpresa" desde la primera migración
- **Qué:** `profiles.role` (`user` | `supervisor`); `tasks.assignee_id` es una FK a `profiles` (responsable), además de `owner_id` (quién la creó). Las políticas usan `is_supervisor()`, una función `security definer`.
- **Por qué:** pedir "un supervisor que vea todo y asigne" sobre un esquema con el responsable como texto libre obliga a migrar datos. Con FK y rol, el cambio sorpresa fue casi todo interfaz.
- **`security definer`:** una política de `profiles` que consulte `profiles` para saber el rol entra en recursión. La función lee el rol sin pasar por RLS, con `search_path = ''` para que no se le pueda inyectar un esquema.
- **Descartado:** `using (true)` para el supervisor, y el rol en el JWT (custom claims), que exige un hook de Auth y deja el rol viejo hasta que se renueva el token.

## 3. Permisos mínimos y explícitos
- **Qué:** la migración hace `revoke all` y luego concede a `authenticated` solo lo necesario. Nada a `anon`.
  - `UPDATE` sobre `tasks` se concede por columna: `owner_id` no se puede cambiar.
  - En `profiles` solo se puede actualizar `full_name`, así que un usuario no puede hacerse supervisor.
- **Reasignar:** las políticas no ven el valor anterior de una fila. Por eso un trigger (`tasks_before_write`) impide cambiar el responsable salvo a uno mismo o siendo supervisor.
- **Verificación:** `scripts/check-rls.mjs` llama a la API REST directamente con usuarios reales (18 comprobaciones).

## 4. La fecha límite es un `date` y "hoy" se calcula en `America/Santo_Domingo`
- **Por qué:** el brief habla de días ("mañana", "el viernes"), no de horas. Con `timestamptz`, una tarea "para hoy" creada a las 23:30 cae al día siguiente en UTC.
- **Dónde:** `supabase/functions/_shared/dates.ts` es un archivo sin dependencias que usan **la Edge Function y el frontend** (Vite lo importa directamente). Así hay una sola definición de "hoy" y de qué vista le toca a cada tarea.
- **Las tareas sin fecha** van a Próximas.

## 5. El agente: bucle de herramientas en la Edge Function
- **Flujo:** recibe el mensaje y llama al modelo con las herramientas en formato OpenAI. Ante `tool_calls`, valida cada argumento con Zod, lo ejecuta en Postgres y responde con `role: "tool"`. Repite hasta 5 iteraciones.
- **El modelo nunca toca la base (RF-14).** El cliente de Supabase de la función se crea con el **JWT del usuario** y la anon key, nunca con `service_role`, así que RLS aplica también al agente.
- **Fechas relativas:** el prompt de sistema no le pide al modelo que sume días. Le da la tabla ya resuelta: hoy, mañana y los 7 días siguientes con su nombre. Esos 7 días contienen cada día de la semana una sola vez, así que "el viernes" no es ambiguo, y si hoy es viernes es el de la semana que viene. Los modelos chicos se equivocaban sumando días; con la tabla, no.
- **Ambigüedad (RF-16):** el prompt obliga a buscar con `listar_tareas` antes de modificar y a preguntar si hay más de una coincidencia. Lo probé en vivo con dos tareas de Juan.
- **Eliminar (RF-17):** `eliminar_tarea` **no borra**: deja la tarea "pendiente de confirmación" y la app muestra un botón "Sí, eliminar", que borra desde el cliente con RLS. Así ninguna alucinación puede borrar datos.
- **El resumen "Creé N tareas" con enlaces** lo arma el backend a partir de lo que realmente ejecutó (`meta.created`), no el texto del modelo.
- **Historial (RF-20):** se guarda en `chat_messages` solo cuando hubo respuesta, para que reintentar no duplique mensajes. Al modelo se le pasan los últimos 10 mensajes, que le alcanzan para entender "la primera" después de preguntar.
- **Descartado:** SDKs de OpenAI o Google (alcanza con `fetch`), y frameworks de agentes como LangChain (sobreingeniería para 5 herramientas).

## 6. Proveedor de IA intercambiable
- **Qué:** solo hay tres secretos de la función: `AI_API_KEY`, `AI_BASE_URL` y `AI_MODEL`, contra cualquier API compatible con OpenAI (`POST {base}/chat/completions`).
- **Diferencias entre proveedores**, resueltas sin tocar código:
  - Se envía `reasoning_effort: "minimal"`. Gemini 3.5 rechaza `"none"` con un 400 genérico (lo descubrí en vivo). Si un modelo rechaza el parámetro, se reintenta una vez sin él.
  - Si el proveedor exige `max_completion_tokens` en lugar de `max_tokens`, se cambia automáticamente.
  - Gemini 3 devuelve una `thought_signature` en `extra_content` y exige recibirla de vuelta en el siguiente turno. Por eso el mensaje del asistente se reenvía completo, tal como llegó.
- **Errores (RF-18):**
  - Un 429 devuelve un mensaje claro y la app ofrece "Reintentar" y "Crear tarea a mano". El texto escrito se conserva. No se reintenta en el servidor para no gastar cuota (~10 RPM en la capa gratuita).
  - Un `content` vacío es un error recuperable.
  - **Si la IA falla después de haber creado tareas, no se devuelve error**, porque reintentar las duplicaría: se informa lo que se alcanzó a hacer.

## 7. PWA sin cachear datos autenticados en el service worker
- **Qué:** el service worker (Workbox) **solo precachea el shell de la app** (HTML, JS, CSS e íconos) y no tiene `runtimeCaching`, así que las respuestas de Supabase nunca pasan por su caché.
- **Sin conexión (RF-24):** la última lista de tareas se guarda en `localStorage` con la clave `tasks:<user_id>` y se pinta al instante. Al cerrar sesión se borra todo.
- **Por qué:** una caché de respuestas autenticadas en el service worker sobrevive al cierre de sesión y puede servir datos de un usuario a otro en un dispositivo compartido.
- **Descartado:** IndexedDB y edición sin conexión con cola de sincronización: el brief pide solo "muestra las últimas tareas".

## 8. Confirmación por email desactivada
Se desactivó para que el evaluador pueda probar RF-01 sin buzón. En producción real se activaría.

## 9. Interfaz
- **Rediseño «Al alcance del pulgar»** (propuesta en `design/ui-movil/`, sistema de diseño en `design/system.md`):
  - La navegación y las acciones van abajo (barra inferior y botón "+ Nueva"), donde llega el pulgar. Antes la franja azul de arriba ocupaba unos 100 px y "Cerrar sesión" era lo más visible.
  - Los filtros pasan a una hoja inferior y quedan a la vista como fichas que se quitan con un toque. Así las tareas empiezan más arriba.
  - El estado es un círculo de un toque, y la prioridad y el estado siempre llevan su palabra: nunca se comunican solo con color.
  - Las fechas se muestran en palabras ("Hoy", "Mañana", "Lunes 23", "Hace 3 días"), calculadas en Santo Domingo con `dayLabel` y `upcomingGroup` de `dates.ts`, con pruebas.
  - Las hojas (`Sheet`) se pintan en un portal sobre `<body>`. Si no, un encabezado sticky las dejaba debajo del composer del chat (lo detectó la prueba E2E).
  - **Descartado:** un menú lateral (hamburguesa), porque esconde la navegación, y una librería de componentes, porque no hacía falta.
- **Mobile-first a 360 px.** Todos los objetivos táctiles miden al menos 44 px.
- **Un toque en la pastilla de estado** avanza Pendiente → En progreso → Hecha → Pendiente, con actualización optimista que se revierte si falla.
- **Validación:** el formulario valida en el cliente y muestra el error junto al campo. La base también valida con `check`, así que los datos no dependen de la interfaz.
