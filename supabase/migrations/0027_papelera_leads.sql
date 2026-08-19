-- Migracion 0027: papelera de leads (archivar / restaurar / borrar de verdad).
--
-- Contexto: el equipo creo leads de prueba durante el Live test y no habia
-- forma de quitarlos. La columna leads.archivado y los eventos
-- lead_archivado/lead_desarchivado existen desde 0001/0016, pero nunca
-- tuvieron UI ni ruta de borrado definitivo.
--
-- Modelo elegido (Jair, 2026-08-19): "Eliminar" ARCHIVA (reversible, sale de
-- todas las vistas porque cada consulta filtra archivado = false) y desde
-- /admin/leads/archivados un admin restaura o borra para siempre.
--
-- El borrado definitivo choca con la inmutabilidad de capa 3: seguimientos y
-- lead_eventos bloquean DELETE incluso para service role (0002 y 0016). Esa
-- inmutabilidad se conserva; lo que se abre es UNA excepcion nombrada: el
-- DELETE pasa solo si la transaccion viene marcada con app.purga_lead = el
-- lead que se esta purgando, marca que unicamente pone la funcion de purga.

-- ===== Capa 3, con la excepcion de purga =====

create or replace function private.seguimientos_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Unica ruta de borrado: la purga de ESE lead (public.eliminar_lead_definitivo).
  -- Cualquier otro delete, y todo update, siguen prohibidos para cualquier rol.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purga_lead', true), '') = old.lead_id::text then
    return old;
  end if;
  raise exception 'seguimientos es inmutable';
end;
$$;

create or replace function private.lead_eventos_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purga_lead', true), '') = old.lead_id::text then
    return old;
  end if;
  raise exception 'lead_eventos es inmutable';
end;
$$;

-- ===== Purga =====
--
-- SECURITY DEFINER porque set_config + los deletes tienen que correr con
-- permisos del dueno del esquema; el execute queda revocado para anon y
-- authenticated (la unica llamada es desde una Server Action que ya paso por
-- requireAdmin con el cliente service-role).
--
-- Se niega a borrar un lead con operacion registrada: eso es contabilidad
-- (comisiones), no un lead de prueba. Para ese caso la papelera basta.
--
-- Nota conocida: si el lead tenia visitas espejadas en Google Calendar, los
-- eventos del calendario NO se borran aqui (viven en la cuenta del asesor).
create or replace function public.eliminar_lead_definitivo(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existe boolean;
begin
  select exists (select 1 from public.leads where id = p_lead_id) into v_existe;
  if not v_existe then
    raise exception 'lead_inexistente' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.operaciones where lead_id = p_lead_id) then
    raise exception 'lead_con_operacion' using errcode = 'P0001';
  end if;

  -- Marca de transaccion (is_local = true): se apaga sola al terminar.
  perform set_config('app.purga_lead', p_lead_id::text, true);

  -- Notificaciones: no tienen FK al lead, se cuelgan de la url del detalle.
  delete from public.notificaciones
    where url like '%' || p_lead_id::text || '%';

  delete from public.contactos               where lead_id = p_lead_id;
  delete from public.visitas                 where lead_id = p_lead_id;
  delete from public.seguimientos            where lead_id = p_lead_id;
  delete from public.recordatorios           where lead_id = p_lead_id;
  delete from public.lead_escalamientos      where lead_id = p_lead_id;
  delete from public.lead_reclasificaciones  where lead_id = p_lead_id;
  delete from public.lead_eventos            where lead_id = p_lead_id;
  delete from public.leads                   where id = p_lead_id;
end;
$$;

comment on function public.eliminar_lead_definitivo(uuid) is
  'Borra un lead y todo su rastro. Solo service_role: la UI la llama desde '
  'la papelera de /admin/leads/archivados tras requireAdmin(). Rechaza leads '
  'con operacion registrada (P0001) y leads inexistentes (P0002).';

revoke execute on function public.eliminar_lead_definitivo(uuid)
  from public, anon, authenticated;
grant execute on function public.eliminar_lead_definitivo(uuid) to service_role;

-- ===== Cuando se fue a la papelera =====
--
-- `archivado` es un booleano desde 0001 y no dice CUANDO. En una papelera lo
-- primero que se busca es lo ultimo que se tiro, asi que se marca la hora.
--
-- Queda NULL en los leads archivados ANTES de esta migracion (en produccion,
-- 107 al 2026-08-19: 63 fixtures TEST-SYNC de cuando los tests corrian contra
-- prod, mas leads reales que se archivaron a mano). No se inventa una fecha
-- para ellos: null significa exactamente "se archivo antes de que existiera
-- esta pantalla", y la vista los ordena al final.
alter table public.leads add column if not exists archivado_en timestamptz;

comment on column public.leads.archivado_en is
  'Cuando el lead se mando a la papelera. NULL = archivado antes de 0027, o '
  'lead activo. Solo lo escribe el service role (archivarLead/restaurarLead).';
