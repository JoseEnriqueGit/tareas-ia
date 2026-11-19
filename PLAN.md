# PLAN — Asistente de tareas con IA (PWA)

**Stack:** Vite + React + TS + `vite-plugin-pwa` + `supabase-js` · Supabase (Postgres, Auth, Edge Function en Deno) · IA por API compatible con OpenAI (Gemini por defecto) · Vercel.
**Dependencias de runtime:** solo `@supabase/supabase-js`, `react-router-dom` y `vite-plugin-pwa` (CSS propio, sin librería de UI). `zod` solo en la Edge Function.

## Qué hago, por fases (un commit por unidad, con los RF en el mensaje)
1. **Base (RF-01, 02, 03, 04, 29).** Migración 1: `profiles` (`full_name`, `role` `user|supervisor`), `tasks`, `chat_messages`; trigger que crea el perfil al registrarse; función `security definer` `is_supervisor()`; RLS en todo, `GRANT` mínimo a `authenticated` (nada a `anon`); `role` no editable por el usuario (grant por columna). Login/registro, rutas protegidas, nombre en el encabezado. Prueba de RLS con dos usuarios reales llamando a la API REST directamente.
2. **Tareas manuales (RF-05..08, 10, 22, 25).** Lista con pestañas Hoy / Próximas / Vencidas / Completadas, formulario crear/editar con errores junto al campo, eliminar con confirmación, cambio de estado con un toque. `due_date` es `date`; "hoy" se calcula en `America/Santo_Domingo`. Mobile-first a 360 px, estados de carga, vacío y error.
3. **Agente (RF-12..19, 28).** Edge Function `agent`: bucle con las herramientas `crear_tarea`, `listar_tareas`, `actualizar_tarea`, `completar_tarea` (+ `eliminar_tarea`, ver dudas), validadas con Zod y ejecutadas con el JWT del usuario (RLS aplica; nunca `service_role`). Tope de 5 iteraciones, `reasoning_effort` bajo, `max_tokens` ≥ 2000, `content` nulo = error recuperable, 429 con mensaje claro. El prompt de sistema lleva fecha/hora de Santo Domingo y la tabla de los próximos 7 días con su nombre (los modelos chicos fallan sumando días). El resumen "Creé 2 tareas" con enlaces lo arma el backend a partir de lo ejecutado, no el modelo. Eliminar nunca borra desde el modelo: devuelve una propuesta y el usuario confirma con un botón. Si falla: error claro, el texto se conserva, botón Reintentar y enlace a "crear a mano".
4. **PWA (RF-23, 24).** Manifest, íconos 192/512, `theme_color`, standalone. El service worker solo precachea el shell de la app; **no** cachea respuestas de Supabase. Las últimas tareas se guardan en `localStorage` por usuario (se borran al cerrar sesión) y se muestran sin red con aviso "Sin conexión".
5. **Cambio sorpresa (supervisor).** Ya preparado en el esquema: el supervisor ve todas las tareas, asigna responsable a cualquier usuario y filtra por persona; el agente también puede asignar si quien escribe es supervisor.
6. **Deseables si sobra tiempo:** RF-20 (historial: sale casi gratis porque el agente ya necesita `chat_messages` para preguntar ante ambigüedad), RF-30 (mínimo 3 pruebas con `deno test` sobre fechas y validación de herramientas; lo hago sí o sí), RF-09 (filtros), RF-21 (voz).
7. **Cierre.** README (tabla RF-01..30, verificación, fuera de alcance, "Cómo se usó IA"), `DECISIONS.md` (se mantiene durante todo el trabajo), usuarios de prueba sembrados, `docs/video-guion.md`.

## Qué dejo fuera y por qué
- **RF-11 etiquetas y RF-26 push:** deseables de mayor costo (VAPID, suscripciones, cron) frente a su valor en 8 h.
- **RF-27 publicación:** dejo listo `vercel.json`, pero no despliego sin tu autorización explícita.
- **Video:** solo el guion; grabarlo es tuyo.
- Nada de estado global, ORM, librería de formularios ni de componentes: ningún RF lo necesita.

## Bloqueos y supuestos
- `SUPABASE_ACCESS_TOKEN` está en la sesión. **`GEMINI_API_KEY` no está definida**: al llegar a la fase 3 me detengo y te la pido (o cargás vos `AI_API_KEY`).
- Desactivo la confirmación por email de Supabase Auth para que RF-01 se pueda probar al instante (se documenta).
- Sembraré 2 usuarios normales + 1 supervisor (contraseñas en el README).

## Dudas para el evaluador (con mi decisión por defecto si no hay respuesta)
1. ¿La fecha límite es solo fecha o fecha y hora? → **solo fecha**.
2. ¿En qué vista caen las tareas sin fecha? → **Próximas**, al final.
3. Si hoy es viernes, ¿"el viernes" es hoy o el de la semana que viene? → **el de la semana que viene**.
4. "Responsable" ¿es un usuario de la app o un nombre libre? En "cobrarle a Juan", Juan parece un cliente. → **usuario de la app** (FK); "Juan" queda en el título. Un usuario normal solo puede asignarse a sí mismo.
5. Las herramientas del RF-14 no incluyen eliminar, pero RF-17 pide eliminar por chat. → agrego `eliminar_tarea`, que **solo propone**; borra un botón de confirmación.
6. ¿Puedo desactivar la confirmación por email para la prueba? → **sí**.
7. Supervisor: ¿también edita y elimina tareas ajenas, o solo ve y asigna? ¿Quién nombra supervisores? → **ve, asigna, edita y elimina; el rol se asigna por SQL**, no desde la app.
8. ¿Un usuario ve las tareas que el supervisor le asignó? → **sí**, las ve y puede cambiarles el estado.
