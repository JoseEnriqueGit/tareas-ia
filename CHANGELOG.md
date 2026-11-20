# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/):
`MAYOR.MENOR.PARCHE`, donde un cambio incompatible sube MAYOR, una función nueva sube MENOR y una corrección sube PARCHE.

## [Unreleased]

## [1.2.4] - 2026-11-20

### Corregido
- Las respuestas antiguas que guardaron la nota interna se limpian también en el historial que recibe el asistente, para que no vuelva a copiarla.

## [1.2.3] - 2026-11-20

### Corregido
- El asistente ya no copia en sus respuestas la nota interna con las tareas mostradas (ids y fechas); la app también la oculta en mensajes antiguos.
- "¿Qué completé hoy/ayer/esta semana?" filtra por la fecha de completado en el servidor, en la zona horaria del usuario.

## [1.2.2] - 2026-11-20

### Corregido
- El asistente ya no afirma nada sobre las tareas de otras personas cuando el usuario no es supervisor: explica que solo un supervisor puede verlas.
- Para un supervisor, "mis tareas" son las que tiene asignadas; "las del equipo" son todas, indicando el responsable.
- Las respuestas como "la segunda" o "esa" después de una tarjeta se refieren a las tareas mostradas en ella.
- Los totales son reales aunque solo se muestre una parte, y el asistente nunca dice que algo se hizo si falló.
- El asistente recibe si una tarea está vencida, su fecha en palabras y cuándo se creó y completó, en vez de calcularlo.
- Fechas hasta dentro de 14 días y "la próxima semana" se resuelven sin que el modelo calcule.
- Una sola eliminación pendiente por mensaje; si se da una hora, va a la descripción y se aclara que solo se guarda la fecha.
- El error al pedir tareas de otra persona dice "ver" en vez de "asignar".

## [1.2.1] - 2026-11-19

### Corregido
- Las fechas del asistente ya no duplican palabras cuando el modelo nombra el día: "el lunes 2026-11-23" se muestra "el lunes 23", "hoy 2026-11-19" se muestra "hoy" y "vence el 2026-11-20" se muestra "vence mañana".
- Si el asistente consulta 20 tareas o más, la tarjeta dice "Al menos 20 tareas" y "Ver todas en Tareas" en vez de un total que quedaría corto.

## [1.2.0] - 2026-11-19

### Añadido
- Las tareas que consulta el asistente se muestran como tarjetas tocables (fecha en palabras, prioridad, estado y responsable) que abren su detalle; el asistente responde con un resumen breve en vez de repetir la lista.
- Formato de las respuestas del asistente: párrafos, listas con viñetas y numeradas, negritas, cursivas y código; las fechas AAAA-MM-DD se muestran en palabras ("mañana", "lunes 23").

### Corregido
- Botones desactivados con aspecto de desactivados; una URL de tarea mal formada muestra "La tarea no existe" en vez de un error técnico; editar ya no duplica el detalle en el historial.

## [1.1.0] - 2026-11-19

### Añadido
- Vista de detalle de cada tarea: título, descripción completa, fecha en palabras, prioridad, estado, responsable, quién la creó y cuándo se creó y completó. Cambio de estado de un toque y botones Editar y Eliminar (con confirmación).
- El detalle funciona sin conexión con la copia guardada en el dispositivo.

### Cambiado
- Tocar una tarea (en la lista o en los enlaces del asistente) abre su detalle; la edición pasa a /tareas/:id/editar y al guardar vuelve al detalle.

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
[1.2.4]: https://tareas-ia.vercel.app
[1.2.3]: https://tareas-ia.vercel.app
[1.2.2]: https://tareas-ia.vercel.app
[1.2.1]: https://tareas-ia.vercel.app
[1.2.0]: https://tareas-ia.vercel.app
[1.1.0]: https://tareas-ia.vercel.app
[1.0.1]: https://tareas-ia.vercel.app
[1.0.0]: https://tareas-ia.vercel.app
