-- Migracion 0013: contactos de WhatsApp con desenlace.
--
-- Problema: cuando el asesor saca un lead a WhatsApp, el sistema pierde el
-- hilo. Se registra que se mando un mensaje (seguimientos) pero nunca si
-- hubo respuesta, asi que el pipeline se queda quieto y no hay de donde
-- sacar tasa de respuesta.
--
-- Por que una tabla nueva y no una columna en seguimientos: seguimientos es
-- append-only por diseno de seguridad (ver 0002: sin grants de update/delete
-- y trigger private.seguimientos_inmutable que lanza excepcion para
-- CUALQUIER rol). El desenlace se conoce despues, asi que necesita una fila
-- mutable. Es el mismo patron de `visitas`.
--
-- Por que no una columna en leads: una columna solo guarda el estado actual.
-- Un asesor que escribe tres veces y recibe respuesta a la tercera es
-- justamente el dato que las metricas necesitan.

create type resultado_contacto as enum (
  'pendiente',
  'contesto',
  'no_contesto',
  'cita',
  'no_interesa',
  'sin_reporte'
);

create table contactos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid not null references usuarios(user_id),
  resultado resultado_contacto not null default 'pendiente',
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

-- Indice por lead + recencia, NO parcial por resultado: la lista «Sin
-- respuesta» primero elige el contacto MAS RECIENTE de cada lead y despues
-- mira su estado. Un indice parcial por resultado empujaria a la consulta
-- ingenua («tiene alguna fila pendiente»), que hace que la lista crezca para
-- siempre.
create index contactos_whatsapp_lead_recencia_idx
  on contactos_whatsapp (lead_id, creado_en desc);

alter table contactos_whatsapp enable row level security;

-- Policies modeladas sobre `seguimientos` (ownership del LEAD), no sobre
-- `visitas` (que protege por autor). Si se protegiera por autor, al
-- reasignar un lead su contacto pendiente quedaria huerfano: invisible para
-- el asesor nuevo y para el anterior.
create policy "asesor lee contactos de sus leads o admin" on contactos_whatsapp
  for select to authenticated
  using (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- El `and autor_id = auth.uid()` ancla la autoria: sin el, un asesor podria
-- insertar un contacto a nombre de otro (mismo criterio que 0002 para
-- seguimientos).
create policy "asesor inserta contactos de sus leads o admin" on contactos_whatsapp
  for insert to authenticated
  with check (
    (
      lead_id in (select id from leads where asesor_id = (select auth.uid()))
      or (select private.is_admin())
    )
    and autor_id = (select auth.uid())
  );

create policy "asesor resuelve contactos de sus leads o admin" on contactos_whatsapp
  for update to authenticated
  using (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  )
  with check (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- Grants de columna: la identidad se fija al insertar y no se repunta.
--
-- CRITICO: hay que REVOCAR primero. Supabase concede por default privileges
-- todos los privilegios sobre las tablas nuevas de `public` a
-- `authenticated`, asi que un `grant insert (col, col)` suelto es ADITIVO y
-- no restringe nada -- un asesor podria repuntar lead_id o autor_id de un
-- contacto. Es el mismo orden de 0006 (seguimientos) y 0009 (visitas).
revoke insert on contactos_whatsapp from authenticated;
revoke update on contactos_whatsapp from authenticated;
revoke delete on contactos_whatsapp from authenticated;
grant select on contactos_whatsapp to authenticated;
grant insert (lead_id, autor_id) on contactos_whatsapp to authenticated;
grant update (resultado, resuelto_en) on contactos_whatsapp to authenticated;
