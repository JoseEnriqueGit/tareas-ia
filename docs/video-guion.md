# Guion del video (3 a 5 minutos)

Grabar con el celular mostrando la app instalada. Antes de empezar:
- Usar la cuenta de Ana con las tareas borradas o pocas.
- Tener abierta en la PC la cuenta de Beto, para el paso 6.
- Esperar 1 minuto entre mensajes al asistente si se usa la capa gratuita de Gemini.

| Tiempo | Qué se muestra | Qué se dice |
|---|---|---|
| 0:00–0:20 | Pantalla de inicio del celular con el ícono "Tareas IA"; se abre a pantalla completa. | "Es una PWA instalada: abre en modo standalone, sin barra del navegador." |
| 0:20–0:45 | Login con Ana. Encabezado con su nombre, pestañas Hoy / Próximas / Vencidas / Completadas. | "Supabase Auth; sin sesión, cualquier ruta lleva al login." |
| 0:45–1:45 | Pestaña Asistente: dictar o escribir "Cobrar a Juan el viernes y cotización a Ana mañana, urgente". Mostrar la respuesta "Creé 2 tareas" y tocar un enlace. | "El modelo no escribe en la base: propone llamadas a herramientas, el backend las valida con Zod y las ejecuta con el usuario de la sesión. 'Mañana' y 'el viernes' se calculan en hora de Santo Domingo." |
| 1:45–2:30 | "Marca como hecha la de Juan" → el asistente pregunta cuál. Responder "la del viernes". | "Si hay ambigüedad, pregunta antes de actuar." |
| 2:30–3:00 | "Elimina la cotización de Ana" → aparece el botón "Sí, eliminar"; tocarlo. | "Eliminar nunca lo hace el modelo: pide confirmación y la borra la app." |
| 3:00–3:30 | Lista: tocar la pastilla de estado de una tarea, crear una a mano con título vacío para mostrar el error, guardarla bien. | "Cambio de estado con un toque; validación junto al campo." |
| 3:30–4:00 | Activar el modo avión y reabrir la app. | "Sin red abre igual y muestra las últimas tareas con el aviso de sin conexión. El service worker solo guarda la app, no datos autenticados." |
| 4:00–4:30 | En la PC con Beto: no ve las tareas de Ana. Login como la supervisora: ve las de todos y filtra por persona. | "RLS en Postgres: el aislamiento no depende de la interfaz. El rol de supervisor fue el cambio sorpresa." |
| 4:30–4:50 | Cierre. | "Lo que quedó fuera está en el README, con cómo verificar cada requisito." |
