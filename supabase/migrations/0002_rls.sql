-- Migracion 0002: RLS owner-or-admin, column grants y seguimientos append-only
-- Patron: helpers security definer en schema private; policies siempre
-- "to authenticated" con helpers envueltos en (select ...) para initPlan caching.
-- Las escrituras de sync (EasyBroker) van por service-role, que ignora RLS.
--
-- Nota de diseno (deliberada): las tablas por-asesor se protegen por ownership
-- (asesor_id / ownership del lead), NO por agencia_id. Single-tenant en v1;
-- RLS multi-tenant llegaria en una migracion posterior.

-- =====================
-- 1. Helpers en schema privado
-- =====================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios
    where user_id = (select auth.uid()) and rol = 'admin' and activo
  );
$$;

revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- =====================
-- 2. Habilitar RLS en las 14 tablas
-- =====================
alter table public.agencias enable row level security;
alter table public.usuarios enable row level security;
alter table public.propiedades enable row level security;
alter table public.leads enable row level security;
alter table public.seguimientos enable row level security;
alter table public.propiedad_portales enable row level security;
alter table public.visitas enable row level security;
alter table public.operaciones enable row level security;
alter table public.notificaciones enable row level security;
alter table public.mensajes enable row level security;
alter table public.sugerencias enable row level security;
alter table public.plantillas_mensajes enable row level security;
alter table public.push_suscripciones enable row level security;
alter table public.sync_estado enable row level security;

-- =====================
-- 3. Policies por tabla
-- =====================

-- ===== agencias: lectura para cualquier autenticado (defaults/config); update solo admin =====
create policy "autenticado lee agencias" on public.agencias
  for select to authenticated
  using (true);

create policy "admin actualiza agencias" on public.agencias
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ===== usuarios: cada quien lee su fila o admin; escrituras solo admin =====
create policy "usuario lee su fila o admin" on public.usuarios
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "admin inserta usuarios" on public.usuarios
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin actualiza usuarios" on public.usuarios
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin elimina usuarios" on public.usuarios
  for delete to authenticated
  using ((select private.is_admin()));

-- ===== propiedades: lectura autenticado; escrituras solo admin (sync via service-role) =====
create policy "autenticado lee propiedades" on public.propiedades
  for select to authenticated
  using (true);

create policy "admin inserta propiedades" on public.propiedades
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin actualiza propiedades" on public.propiedades
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin elimina propiedades" on public.propiedades
  for delete to authenticated
  using ((select private.is_admin()));

-- ===== leads: owner-or-admin; asesor solo crea leads asignados a si mismo =====
create policy "asesor lee sus leads o admin" on public.leads
  for select to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "asesor inserta sus leads o admin" on public.leads
  for insert to authenticated
  with check (asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "asesor actualiza sus leads o admin" on public.leads
  for update to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()))
  with check (asesor_id = (select auth.uid()) or (select private.is_admin()));

-- ===== seguimientos: append-only, capa 1 (solo select + insert via ownership del lead) =====
create policy "asesor lee seguimientos de sus leads o admin" on public.seguimientos
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and l.asesor_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy "asesor inserta seguimientos de sus leads o admin" on public.seguimientos
  for insert to authenticated
  with check (
    (
      exists (
        select 1 from public.leads l
        where l.id = lead_id and l.asesor_id = (select auth.uid())
      )
      or (select private.is_admin())
    )
    and autor_id = (select auth.uid())
  );
-- Sin policies de update/delete (append-only).

-- ===== propiedad_portales: lectura autenticado; escrituras solo admin =====
create policy "autenticado lee propiedad_portales" on public.propiedad_portales
  for select to authenticated
  using (true);

create policy "admin inserta propiedad_portales" on public.propiedad_portales
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin actualiza propiedad_portales" on public.propiedad_portales
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin elimina propiedad_portales" on public.propiedad_portales
  for delete to authenticated
  using ((select private.is_admin()));

-- ===== visitas: owner-or-admin (select/insert/update) =====
create policy "asesor lee sus visitas o admin" on public.visitas
  for select to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "asesor inserta sus visitas o admin" on public.visitas
  for insert to authenticated
  with check (asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "asesor actualiza sus visitas o admin" on public.visitas
  for update to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()))
  with check (asesor_id = (select auth.uid()) or (select private.is_admin()));

-- ===== operaciones: lectura owner-or-admin; escrituras solo admin =====
create policy "asesor lee sus operaciones o admin" on public.operaciones
  for select to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "admin inserta operaciones" on public.operaciones
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin actualiza operaciones" on public.operaciones
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin elimina operaciones" on public.operaciones
  for delete to authenticated
  using ((select private.is_admin()));

-- ===== notificaciones: lee/marca-leida solo el destinatario; insert via service-role =====
create policy "destinatario lee sus notificaciones" on public.notificaciones
  for select to authenticated
  using (destinatario_id = (select auth.uid()));

create policy "destinatario actualiza sus notificaciones" on public.notificaciones
  for update to authenticated
  using (destinatario_id = (select auth.uid()))
  with check (destinatario_id = (select auth.uid()));
-- Sin policy de insert para authenticated (las crea el sistema via service-role).

-- ===== mensajes: hilo del asesor o admin; autor debe ser uno mismo =====
create policy "participante lee mensajes de su hilo" on public.mensajes
  for select to authenticated
  using (hilo_asesor_id = (select auth.uid()) or (select private.is_admin()));

create policy "participante inserta mensajes en su hilo" on public.mensajes
  for insert to authenticated
  with check (
    (hilo_asesor_id = (select auth.uid()) or (select private.is_admin()))
    and autor_id = (select auth.uid())
  );

create policy "participante marca leido en su hilo" on public.mensajes
  for update to authenticated
  using (hilo_asesor_id = (select auth.uid()) or (select private.is_admin()))
  with check (hilo_asesor_id = (select auth.uid()) or (select private.is_admin()));

-- ===== sugerencias: inserta cualquier autenticado como autor; lee autor o admin; update solo admin =====
create policy "autor lee sus sugerencias o admin" on public.sugerencias
  for select to authenticated
  using (autor_id = (select auth.uid()) or (select private.is_admin()));

create policy "autenticado inserta sugerencias propias" on public.sugerencias
  for insert to authenticated
  with check (autor_id = (select auth.uid()));

create policy "admin actualiza sugerencias" on public.sugerencias
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ===== plantillas_mensajes: lectura autenticado; escrituras solo admin =====
create policy "autenticado lee plantillas" on public.plantillas_mensajes
  for select to authenticated
  using (true);

create policy "admin inserta plantillas" on public.plantillas_mensajes
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin actualiza plantillas" on public.plantillas_mensajes
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin elimina plantillas" on public.plantillas_mensajes
  for delete to authenticated
  using ((select private.is_admin()));

-- ===== push_suscripciones: cada usuario gestiona las suyas =====
create policy "usuario lee sus suscripciones push" on public.push_suscripciones
  for select to authenticated
  using (usuario_id = (select auth.uid()));

create policy "usuario inserta sus suscripciones push" on public.push_suscripciones
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

create policy "usuario elimina sus suscripciones push" on public.push_suscripciones
  for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- ===== sync_estado: solo admin lee; escrituras solo service-role =====
create policy "admin lee sync_estado" on public.sync_estado
  for select to authenticated
  using ((select private.is_admin()));

-- =====================
-- 4. Column grants
-- =====================

-- leads: asesor NO puede tocar asesor_id / asignado_en (reasignacion via
-- Server Actions con service-role).
revoke update on public.leads from authenticated;
grant update (nombre, telefono, email, fuente, propiedad_id, etapa, interes,
  presupuesto, zona_interes, notas, archivado)
  on public.leads to authenticated;

-- notificaciones: solo se puede marcar leida.
revoke update on public.notificaciones from authenticated;
grant update (leida) on public.notificaciones to authenticated;

-- mensajes: solo se puede marcar leido.
revoke update on public.mensajes from authenticated;
grant update (leido) on public.mensajes to authenticated;

-- seguimientos: append-only, capa 2 (sin update/delete a nivel de grants).
revoke update, delete on public.seguimientos from authenticated;

-- =====================
-- 5. Trigger de inmutabilidad de seguimientos (capa 3: aplica a cualquier rol)
-- =====================
create or replace function private.seguimientos_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'seguimientos es inmutable';
end;
$$;

drop trigger if exists seguimientos_bloquea_update_delete on public.seguimientos;
create trigger seguimientos_bloquea_update_delete
  before update or delete on public.seguimientos
  for each row execute function private.seguimientos_inmutable();
