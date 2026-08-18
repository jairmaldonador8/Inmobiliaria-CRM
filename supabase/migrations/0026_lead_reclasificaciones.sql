-- Migracion 0026: solicitudes de reclasificacion de lead (ronda 2).
-- Spec: docs/ultrapowers/specs/2026-08-18-ronda-2-leads-design.md
--
-- Cuando un asesor descubre al hablar con el "cliente" que en realidad es un
-- corredor externo, lo REPORTA — no lo aplica: reclasificar mueve el lead
-- fuera de las colas de urgencia, y un asesor podria "llevarse" un cliente
-- directo como corredor (riesgo senalado por Jair). La administracion aprueba
-- o rechaza; solo el service role escribe leads.clasificacion_eb (ver 0011).

create table public.lead_reclasificaciones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  solicitante_id uuid not null references public.usuarios(user_id),
  motivo text not null default '',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por uuid references public.usuarios(user_id),
  resuelta_en timestamptz,
  creada_en timestamptz not null default now()
);

comment on table public.lead_reclasificaciones is
  'Reportes de "este lead es un corredor, no cliente" hechos por asesores. '
  'Los resuelve un admin (service role): aprobar escribe '
  'leads.clasificacion_eb = co_broke y deja seguimiento de sistema.';

-- Una sola solicitud viva por lead: dos reportes simultaneos no deben abrir
-- dos expedientes (el segundo insert truena y la UI lo lee como "ya hay uno").
create unique index lead_reclasificaciones_pendiente_unica
  on public.lead_reclasificaciones (lead_id)
  where estado = 'pendiente';

create index on public.lead_reclasificaciones (lead_id, estado);

-- ===== RLS =====
alter table public.lead_reclasificaciones enable row level security;

-- El solicitante ve las suyas (para pintar "reporte enviado"); admin todas.
create policy lead_reclasificaciones_select on public.lead_reclasificaciones
  for select to authenticated
  using (solicitante_id = (select auth.uid()) or private.is_admin());

-- Solo se reporta un lead PROPIO, activo, y a nombre propio.
create policy lead_reclasificaciones_insert on public.lead_reclasificaciones
  for insert to authenticated
  with check (
    solicitante_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = lead_reclasificaciones.lead_id
        and l.asesor_id = (select auth.uid())
        and l.archivado = false
    )
  );

-- Sin update/delete para authenticated: la resolucion (estado, resuelta_por,
-- resuelta_en) la escribe el service role desde la accion de admin.

-- ===== Grants (patron 0013/0014 revoke-then-grant + columnas 0006) =====
revoke all on public.lead_reclasificaciones from anon, authenticated;
grant select on public.lead_reclasificaciones to authenticated;
grant insert (lead_id, solicitante_id, motivo)
  on public.lead_reclasificaciones to authenticated;
