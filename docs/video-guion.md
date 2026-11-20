# Guion del video (3 a 5 minutos)

Grabar con el celular mostrando la app instalada desde https://tareas-ia.vercel.app. Antes de empezar:
- Entrar con la cuenta de Ana (`ana@tareas-ia.dev`), que tiene pocas tareas de demo.
- Tener abierta en la PC la cuenta de Beto (`beto@tareas-ia.dev`) para el paso 7.
- Esperar unos 15 segundos entre mensajes al asistente (capa gratuita de Gemini).

| Tiempo | Qué se muestra | Qué se dice |
|---|---|---|
| 0:00–0:20 | Pantalla de inicio del celular con el ícono de Tareas IA; se abre a pantalla completa. Tocar el avatar y mostrar «Versión 1.3.x». | "Es una PWA instalada: abre sin barra del navegador y se actualiza sola cuando publico una versión nueva." |
| 0:20–0:45 | Login con Ana. «Hola, Ana», pestañas Hoy / Próximas / Vencidas / Completadas y barra inferior. | "Supabase Auth; sin sesión, cualquier ruta lleva al login. La navegación está abajo, al alcance del pulgar." |
| 0:45–1:45 | Asistente: dictar o escribir «Cobrar a Juan el viernes y cotización a Ana mañana, urgente». Mostrar «Creé 2 tareas» y tocar una tarjeta: se abre el detalle. | "El modelo no escribe en la base: propone llamadas a herramientas, el backend las valida y las ejecuta con el usuario de la sesión. 'Mañana' y 'el viernes' se calculan en hora de Santo Domingo." |
| 1:45–2:20 | «¿Qué tengo pendiente esta semana?»: resumen corto y tarjetas con datos reales. | "Responde solo con datos de la base: el texto resume y las tarjetas muestran las tareas reales." |
| 2:20–2:55 | «Marca como hecha la de Juan» → pregunta cuál → «la primera». | "Si hay ambigüedad, pregunta antes de actuar." |
| 2:55–3:20 | «Elimina la cotización de Ana» → botón «Sí, eliminar»; tocarlo. | "Eliminar nunca lo hace el modelo: pide confirmación y la borra la app, solo si tienes permiso." |
| 3:20–3:45 | Lista: tocar el círculo de estado; abrir una tarea a mano con el título vacío para mostrar el error. | "Cambio de estado con un toque y validación junto al campo." |
| 3:45–4:10 | Activar el modo avión y reabrir la app. | "Sin red abre igual y muestra las últimas tareas con el aviso de sin conexión. El service worker solo guarda la app, no datos autenticados." |
| 4:10–4:40 | En la PC con Beto: no ve las tareas de Ana; en la tarea que le asignó la supervisora solo puede cambiar el estado. Entrar como la supervisora: ve las de todos y filtra por persona. | "RLS en Postgres: el aislamiento y los permisos no dependen de la interfaz. El rol de supervisor fue el cambio sorpresa." |
| 4:40–4:55 | Cierre. | "Lo que quedó fuera y cómo verificar cada requisito está en el README; los cambios por versión, en el CHANGELOG." |
