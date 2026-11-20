# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/):
`MAYOR.MENOR.PARCHE`, donde un cambio incompatible sube MAYOR, una función nueva sube MENOR y una corrección sube PARCHE.

## [Unreleased]

## [1.0.1] - 2026-11-19

### Corregido
- Una versión nueva pospuesta con «Más tarde» ahora se aplica sola al volver a la app sin texto escrito, y el aviso reaparece si todavía hay texto.
- El aviso de versión nueva ya no tapa el encabezado: ocupa su propio espacio arriba.

## [1.0.0] - 2026-11-19

Primera versión publicada en https://tareas-ia.vercel.app.

### Añadido
- Registro, inicio de sesión y rutas protegidas con Supabase Auth; nombre del usuario en el encabezado (RF-01 a RF-04).
- Aislamiento de datos con RLS y permisos mínimos para `authenticated`, verificado con dos usuarios reales llamando a la API (RF-03).
- Tareas con título, descripción, fecha límite, prioridad, responsable y estado; vistas Hoy, Próximas, Vencidas y Completadas; editar, eliminar con confirmación y cambio de estado de un toque (RF-05 a RF-08).
- Validación junto al campo, filtros combinables y búsqueda por texto (RF-09, RF-10).
- Asistente de IA con herramientas (`crear_tarea`, `listar_tareas`, `actualizar_tarea`, `completar_tarea` y `eliminar_tarea`, que solo propone), ejecutadas y validadas en una Edge Function con el JWT del usuario (RF-12 a RF-17).
- Fechas relativas en `America/Santo_Domingo`, también cerca de medianoche (RF-19).
- Manejo de fallos de la IA con texto conservado, reintento y creación manual (RF-18); historial de la conversación (RF-20); dictado por voz (RF-21).
- PWA instalable con manifest, íconos y logo propio, y modo sin conexión con las últimas tareas guardadas (RF-23, RF-24).
- Rol de supervisor: ve todas las tareas, las asigna y filtra por persona (cambio sorpresa).
- Diseño móvil «Al alcance del pulgar»: barra de navegación inferior, hojas desde abajo, fechas en palabras y estados de carga, vacío, error y sin conexión (RF-22, RF-25).
- Actualización automática de la app instalada: busca versiones nuevas al abrirla, al volver a ella y cada hora; si hay texto escrito, avisa en vez de recargar.
- Versión de la app y fecha del build visibles en el menú de cuenta.
- 15 pruebas automáticas de fechas y de validación de herramientas (RF-30).

[Unreleased]: https://tareas-ia.vercel.app
[1.0.1]: https://tareas-ia.vercel.app
[1.0.0]: https://tareas-ia.vercel.app
