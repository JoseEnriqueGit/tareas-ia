-- S15.1: reserva del mensaje del chat por clientId. La Edge Function guarda el mensaje del
-- usuario ANTES de ejecutar herramientas; este índice hace que un reintento con el mismo
-- clientId choque (23505) aunque la primera petición siga en curso. Si la ejecución falla
-- antes de cualquier acción, la función borra su reserva: para eso cada usuario puede
-- borrar solo sus propios mensajes. Se puede volver a ejecutar.

create unique index if not exists chat_messages_user_client_id_key
  on public.chat_messages (user_id, (meta ->> 'clientId'))
  where role = 'user' and meta ? 'clientId';

drop policy if exists "chat_messages: borrar los propios" on public.chat_messages;
create policy "chat_messages: borrar los propios"
  on public.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- Privilegio mínimo: solo delete además de lo que ya tenía (select, insert); nunca a anon.
grant delete on public.chat_messages to authenticated;
