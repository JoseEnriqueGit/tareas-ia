# Prompt de la sesión — Prueba 1: Asistente de tareas con IA

Vas a construir una prueba técnica real. Leé primero, completo, `docs/brief.txt`
(el original está en `docs/brief.pdf`). Es tu única especificación: los IDs RF-xx y
sus criterios de aceptación mandan sobre cualquier suposición tuya.

## OBJETIVO
Cumplir todos los requisitos "Obligatorio" bien hechos. Los "Deseable" solo después,
y solo si sobra tiempo. Menos funciones que funcionen > muchas a medias.

## REGLAS DE ALCANCE (importantes)
- NO sobreingenierices. Nada de capas, patrones, abstracciones, librerías ni
  configuración que ningún RF necesite. Si dudás entre simple y elaborado, simple.
- No agregues funciones que el brief no pida.
- Lo que no hagas va en el README, en una lista honesta.

## STACK (decidido, no lo cambies)
- Vite + React + TypeScript, PWA con `vite-plugin-pwa`, `supabase-js`.
- Supabase: Postgres + Auth + Edge Functions (Deno) para el agente.
- Despliegue en Vercel (no despliegues sin que te lo pida).
- Interfaz y README en español. Identificadores de código en inglés, salvo las
  herramientas del agente, que se llaman exactamente `crear_tarea`, `listar_tareas`,
  `actualizar_tarea`, `completar_tarea` (RF-14).
- La llave de IA solo como secreto de la Edge Function. Jamás en variables `VITE_*`,
  ni en el código, ni en peticiones del cliente (RF-28).
- Proveedor de IA: API **compatible con OpenAI** (`POST {AI_BASE_URL}/chat/completions`),
  llamada con `fetch` desde la Edge Function, sin SDKs extra. Se configura solo con
  secretos de la función (`supabase secrets set`): `AI_API_KEY`, `AI_BASE_URL` y
  `AI_MODEL`. Valores previstos: Gemini, base URL
  `https://generativelanguage.googleapis.com/v1beta/openai/` (con la barra final).
  Escribí el código sin depender de un proveedor concreto: cambiar a OpenAI o a Gemini
  (su endpoint compatible) debe requerir solo cambiar esos tres secretos, sin tocar
  código: el dueño querrá poder probar distintos modelos.
  Si esos secretos no existen cuando llegues a la fase del agente, pará y pedíselos.
- Modelos con razonamiento: enviá `reasoning_effort` en `"none"` o `"minimal"` y un
  `max_tokens` generoso (2000 o más); con un tope chico pueden devolver `content` vacío.
  Manejá `content` nulo como error recuperable.
- Modelo por defecto: `gemini-3.5-flash-lite`. La capa gratuita de Gemini da ~10 RPM y
  ~500 RPD en Flash-Lite, pero `gemini-3.8-flash` solo 5 RPM y 20 RPD (confirmalo en AI
  Studio). Cada mensaje del usuario puede costar varias llamadas (bucle de herramientas):
  ahorrá llamadas, topeá las iteraciones y manejá el 429 con error claro y reintento
  (RF-18). Para probar más calidad, cambiá `AI_MODEL`.
- Bucle del agente en la Edge Function: llamar al modelo con las 4 herramientas en formato
  OpenAI (`tools`); ante `tool_calls` en la respuesta, validar los parámetros con Zod,
  ejecutar contra Postgres usando el JWT del usuario (NUNCA `service_role`, para que RLS
  aplique), responder con mensajes `role: "tool"` y su `tool_call_id`, y repetir hasta
  que el modelo conteste sin herramientas; poner un tope de iteraciones. Inyectar en el
  prompt de sistema la fecha y hora actuales en `America/Santo_Domingo`.

## PROYECTO SUPABASE (ya creado, vacío)
- Project ref: `qnyihdldowmvixbqeghz`
- URL: `https://qnyihdldowmvixbqeghz.supabase.co`
- Este proyecto NO da acceso a la API automáticamente a las tablas nuevas. Cada
  migración debe, además de habilitar RLS y crear las políticas, hacer GRANT explícito
  de lo mínimo necesario al rol `authenticated` (nunca a `anon`, salvo que un RF lo
  requiera). Verificá con dos usuarios reales que no hay `permission denied` ni datos
  ajenos visibles.
- Vincular con `supabase link --project-ref qnyihdldowmvixbqeghz`. El login global del
  CLI de esta máquina pertenece a OTRA cuenta y NO ve este proyecto: no hagas
  `supabase login` ni `logout`. Autenticá solo con la variable de entorno
  `SUPABASE_ACCESS_TOKEN` de esta sesión; si no existe, pará y pedísela al dueño. Nunca
  la imprimas ni la escribas en un archivo. Lo mismo con la contraseña de la base.
  La key de Gemini ya está en la variable de entorno `GEMINI_API_KEY`: cargala como
  secreto de la función con `supabase secrets set AI_API_KEY="$GEMINI_API_KEY"` (sin
  imprimirla). Si una política de seguridad te bloquea ese comando, decíselo al dueño y
  que lo ejecute él en su terminal.
- Crear `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (vacía). El
  `.env` real va en `.gitignore` (ya está).

## DISEÑÁ DESDE EL INICIO PARA EL "CAMBIO SORPRESA" (al final del brief)
- Tabla de perfiles con columna `role` (`user` | `supervisor`) desde la primera migración.
- "Responsable" es una llave foránea a un usuario, no texto libre.
- RLS con una función `security definer` que consulte el rol, no con `using (true)`.
Al terminar los requisitos obligatorios, implementá el cambio sorpresa.

## COSAS QUE SE SUELEN HACER MAL (verificalas explícitamente)
- El modelo NO escribe en la base: el backend ejecuta cada herramienta y valida sus
  parámetros (RF-14).
- Fechas relativas calculadas en `America/Santo_Domingo` y no en UTC; probar casos cerca
  de medianoche (RF-19).
- Ambigüedad ("la de Juan" con dos tareas) => preguntar antes de actuar (RF-16).
- Eliminar por chat pide confirmación (RF-17).
- Si la IA falla o responde algo inválido: error claro, se conserva el texto escrito, se
  puede reintentar (RF-18).
- RLS probada de verdad con dos usuarios llamando a la API directamente (RF-03).
- Ninguna pantalla en blanco: estados de carga, vacío y error (RF-25).
- El service worker no debe cachear respuestas autenticadas de forma insegura.

## MÉTODO
1. Antes de escribir código, creá `PLAN.md` (una página): qué hacés, qué dejás fuera y por
   qué, y las dudas que le harías al evaluador.
2. Trabajá por fases del brief. Un commit por unidad de trabajo, mensajes Conventional
   Commits en inglés, mencionando los RF cubiertos. Commits frecuentes, nunca uno solo al
   final. El repo ya está inicializado en `main`.
3. Migraciones SQL versionadas en `supabase/migrations/` (RF-29), recreables desde cero.
4. Pruebas automáticas mínimas (RF-30): al menos 3, sobre manejo de fechas y/o validación
   de herramientas del agente.
5. Mantené `DECISIONS.md`: cada decisión técnica importante, el porqué y las alternativas
   descartadas. Es para que luego el dueño entienda y explique todo en una revisión en vivo.

## ENTREGABLES EN EL REPO
- `README.md`: cómo correrla, decisiones, tabla RF-01..RF-30 con estado (hecho / parcial /
  fuera) y cómo verificar cada uno, y lista honesta de lo que quedó fuera. Incluí una
  sección corta "Cómo se usó IA": qué se delegó, qué se revisó, qué se corrigió.
- Dos usuarios de prueba sembrados con contraseña (documentados en el README).
- Guion del video de 3 a 5 minutos en `docs/video-guion.md` (el guion, no el video).

## LÍMITES DE SEGURIDAD
- No hagas push, no crees repos remotos y no despliegues sin que te lo pida.
- Nunca imprimas ni commitees secretos.
- Trabajá solo dentro de esta carpeta.

## CIERRE
Al terminar, entregá un resumen: qué RF están hechos, cuáles parciales o fuera, qué
verificaste de verdad (y cómo) y qué no pudiste verificar.
