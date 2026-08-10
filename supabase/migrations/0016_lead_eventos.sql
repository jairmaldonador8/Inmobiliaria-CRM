-- Migracion 0016: lead_eventos — historia append-only del lead.
-- Spec: docs/ultrapowers/specs/2026-08-10-lead-eventos-design.md
-- 3 capas append-only (patron 0002 seguimientos + 0013/0014 grants):
-- RLS solo select/insert, revoke update/delete, trigger RAISE EXCEPTION.

create table public.lead_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in (
    'lead_creado','lead_asignado','lead_reasignado','etapa_cambiada',
    'lead_archivado','lead_desarchivado',
    'seguimiento_registrado','whatsapp_enviado','whatsapp_desenlace',
    'visita_agendada','visita_realizada','visita_cancelada',
    'tomado_de_bandeja',
    'escalamiento_paso','push_recordatorio'
  )),
  actor_id uuid references public.usuarios(user_id),  -- null = sistema
  payload jsonb not null default '{}'::jsonb,
  ocurrido_en timestamptz not null default now()
);
create index on public.lead_eventos (lead_id, ocurrido_en desc);
create index on public.lead_eventos (tipo, ocurrido_en desc);

-- ===== Capa 1: RLS (solo select/insert; update/delete deny por default) =====
alter table public.lead_eventos enable row level security;

create policy lead_eventos_select_admin on public.lead_eventos
  for select to authenticated using (private.is_admin());

-- Asesor: eventos de sus leads, sin tipos de supervision.
create policy lead_eventos_select_asesor on public.lead_eventos
  for select to authenticated using (
    tipo not in ('escalamiento_paso','push_recordatorio')
    and exists (
      select 1 from public.leads l
      where l.id = lead_eventos.lead_id and l.asesor_id = (select auth.uid())
    )
  );

-- Insert desde la app: actor real, sin tipos de supervision, lead visible.
create policy lead_eventos_insert_app on public.lead_eventos
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and tipo not in ('escalamiento_paso','push_recordatorio',
                     'lead_creado','lead_asignado','lead_reasignado',
                     'etapa_cambiada','lead_archivado','lead_desarchivado')
    and (
      private.is_admin()
      or exists (
        select 1 from public.leads l
        where l.id = lead_eventos.lead_id and l.asesor_id = (select auth.uid())
      )
    )
  );
-- Nota: los tipos de trigger tampoco son insertables por la app — solo el
-- trigger DEFINER los escribe. Supervision entra por service role (cron).

-- ===== Capa 2: grants (patron 0013/0014 revoke-then-grant + columnas 0006) =====
revoke all on public.lead_eventos from anon, authenticated;
grant select on public.lead_eventos to authenticated;
grant insert (lead_id, tipo, actor_id, payload)
  on public.lead_eventos to authenticated;  -- id/ocurrido_en server-managed

-- ===== Trigger de captura en leads (SECURITY DEFINER, patron research) =====
create or replace function private.leads_anota_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();  -- null bajo service role = sistema
begin
  if tg_op = 'INSERT' then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id, 'lead_creado', v_actor, jsonb_strip_nulls(jsonb_build_object(
      'fuente', new.fuente, 'fuente_detalle', new.fuente_detalle,
      'propiedad_id', new.propiedad_id)));
    if new.asesor_id is not null then
      insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
      values (new.id, 'lead_asignado', v_actor,
              jsonb_build_object('de', null, 'a', new.asesor_id));
    end if;
    return new;
  end if;

  if new.asesor_id is distinct from old.asesor_id then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id,
      case when old.asesor_id is null then 'lead_asignado' else 'lead_reasignado' end,
      v_actor, jsonb_build_object('de', old.asesor_id, 'a', new.asesor_id));
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id, 'etapa_cambiada', v_actor,
            jsonb_build_object('de', old.etapa, 'a', new.etapa));
  end if;
  if new.archivado is distinct from old.archivado then
    insert into public.lead_eventos (lead_id, tipo, actor_id, payload)
    values (new.id,
      case when new.archivado then 'lead_archivado' else 'lead_desarchivado' end,
      v_actor, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.leads_anota_eventos() from public, anon, authenticated;

drop trigger if exists leads_anota_eventos on public.leads;
create trigger leads_anota_eventos
  after insert or update on public.leads
  for each row execute function private.leads_anota_eventos();

-- ===== Backfill (ANTES de instalar el bloqueo; idempotente) =====
-- Re-ejecutable: si el bloqueo ya existia (re-corrida), se quita primero.
drop trigger if exists lead_eventos_bloquea_update_delete on public.lead_eventos;
delete from public.lead_eventos where payload->>'backfill' = 'true';

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select id, 'lead_creado', null, jsonb_strip_nulls(jsonb_build_object(
    'fuente', fuente, 'fuente_detalle', fuente_detalle,
    'propiedad_id', propiedad_id, 'backfill', 'true')), creado_en
from public.leads;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select id, 'lead_asignado', null,
       jsonb_build_object('a', asesor_id, 'backfill', 'true'), asignado_en
from public.leads where asesor_id is not null and asignado_en is not null;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'seguimiento_registrado', autor_id,
       jsonb_build_object('tipo', tipo, 'seguimiento_id', id, 'backfill', 'true'),
       creado_en
from public.seguimientos;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'escalamiento_paso', null,
       jsonb_build_object('paso', paso, 'backfill', 'true'), ejecutado_en
from public.lead_escalamientos;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select v.lead_id,
       case v.estado when 'realizada' then 'visita_realizada'
                     when 'cancelada' then 'visita_cancelada'
                     else 'visita_agendada' end,
       null, jsonb_build_object('visita_id', v.id, 'backfill', 'true'), v.creada_en
from public.visitas v;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'whatsapp_enviado', autor_id,
       jsonb_build_object('contacto_id', id, 'backfill', 'true'), creado_en
from public.contactos_whatsapp;

insert into public.lead_eventos (lead_id, tipo, actor_id, payload, ocurrido_en)
select lead_id, 'whatsapp_desenlace', autor_id,
       jsonb_build_object('contacto_id', id, 'desenlace', resultado, 'backfill', 'true'),
       resuelto_en
from public.contactos_whatsapp
where resultado <> 'pendiente' and resuelto_en is not null;

-- ===== Capa 3: inmutable incluso para service role (patron 0002) =====
create or replace function private.lead_eventos_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'lead_eventos es inmutable';
end;
$$;
create trigger lead_eventos_bloquea_update_delete
  before update or delete on public.lead_eventos
  for each row execute function private.lead_eventos_inmutable();
