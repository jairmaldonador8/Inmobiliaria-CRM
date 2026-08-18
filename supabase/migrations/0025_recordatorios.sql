-- Migracion 0025: recordatorios de follow-up por lead (ronda 2).
-- Spec: docs/ultrapowers/specs/2026-08-18-ronda-2-leads-design.md
--
-- El asesor pacta con la app CUANDO retomar un lead ("manana 9:00, confirmar
-- si la casa sigue disponible"). Un job de pg_cron (recordatorios-5min ->
-- /api/cron/recordatorios) empuja la notificacion al vencer; la cola
-- "Para hoy" del inicio los muestra hasta que haya actividad real.

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Dueño del recordatorio. NO se deriva del lead: si el lead se reasigna,
  -- el recordatorio sigue siendo un compromiso de quien lo creo (y la cola
  -- "Para hoy" acota por asesor_id explicito, patron admin-en-vista-asesor).
  asesor_id uuid not null references public.usuarios(user_id),
  fecha_hora timestamptz not null,
  nota text not null default '',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'hecho', 'cancelado')),
  -- Idempotencia del cron: null = push pendiente de mandar. La escribe SOLO
  -- el service role (queda fuera del grant de update de authenticated).
  notificado_en timestamptz,
  creado_en timestamptz not null default now()
);

comment on table public.recordatorios is
  'Follow-ups pactados por el asesor sobre un lead. El cron '
  'recordatorios-5min notifica los vencidos (notificado_en = idempotencia); '
  'la actividad real posterior en el lead los marca hechos.';

-- Cola "Para hoy" y ficha del lead.
create index on public.recordatorios (asesor_id, estado, fecha_hora);
create index on public.recordatorios (lead_id, estado);
-- Barrido del cron: solo pendientes sin push, ordenados por vencimiento.
create index recordatorios_cron_pendientes
  on public.recordatorios (fecha_hora)
  where estado = 'pendiente' and notificado_en is null;

-- ===== RLS =====
alter table public.recordatorios enable row level security;

-- El asesor ve los suyos; el admin ve todos (supervision en la ficha admin).
create policy recordatorios_select on public.recordatorios
  for select to authenticated
  using (asesor_id = (select auth.uid()) or private.is_admin());

-- Solo se crean recordatorios PROPIOS sobre leads PROPIOS: un recordatorio
-- ajeno seria una tarea impuesta, y eso ya lo cubren las notificaciones.
create policy recordatorios_insert on public.recordatorios
  for insert to authenticated
  with check (
    asesor_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = recordatorios.lead_id
        and l.asesor_id = (select auth.uid())
        and l.archivado = false
    )
  );

-- Reprogramar / marcar hecho / cancelar: solo el dueño, y sigue siendo suyo.
create policy recordatorios_update on public.recordatorios
  for update to authenticated
  using (asesor_id = (select auth.uid()))
  with check (asesor_id = (select auth.uid()));

-- Sin delete: cancelado es el borrado del dominio (queda el rastro).

-- ===== Grants (patron 0013/0014 revoke-then-grant + columnas 0006) =====
revoke all on public.recordatorios from anon, authenticated;
grant select on public.recordatorios to authenticated;
grant insert (lead_id, asesor_id, fecha_hora, nota)
  on public.recordatorios to authenticated;  -- id/estado/creado_en server-managed
grant update (fecha_hora, nota, estado)
  on public.recordatorios to authenticated;  -- notificado_en solo service role
