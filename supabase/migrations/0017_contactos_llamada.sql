-- Migracion 0017: el registro de contactos salientes deja de ser solo de
-- WhatsApp. El asesor tambien puede llamar desde la app, y esa llamada
-- merece el mismo trato: queda anotada al instante y al volver el sistema
-- pregunta como le fue.
--
-- Dos cambios:
--   1. `contactos_whatsapp` se renombra a `contactos` y gana `canal`. El
--      nombre viejo mentiria en cuanto entren llamadas; las policies, los
--      grants y los indices viajan solos con el rename (van por OID).
--   2. `lead_eventos` acepta los dos tipos nuevos de llamada.

-- ===== 1. contactos por canal =====
alter table public.contactos_whatsapp rename to contactos;

-- Las filas existentes son todas de WhatsApp: el default las cubre.
alter table public.contactos
  add column canal text not null default 'whatsapp'
  check (canal in ('whatsapp', 'llamada'));

-- El pendiente se busca por lead + canal, que es como pregunta la hoja.
create index on public.contactos (lead_id, canal, creado_en desc);

-- Las policies conservan su nombre viejo (`contactos_whatsapp_*`): renombrar
-- no cambia su comportamiento y tocarlas aqui solo agregaria riesgo. El
-- grant de insert por columnas de 0013 tampoco incluye `canal`, asi que se
-- vuelve a conceder con la columna nueva.
grant insert (lead_id, autor_id, canal) on public.contactos to authenticated;

-- ===== 2. eventos de llamada =====
-- El check de 0016 se define inline, asi que Postgres lo nombro
-- `lead_eventos_tipo_check`. Se reemplaza por la lista completa mas los dos
-- tipos nuevos.
alter table public.lead_eventos drop constraint if exists lead_eventos_tipo_check;
alter table public.lead_eventos add constraint lead_eventos_tipo_check check (tipo in (
  -- triggers (fila leads)
  'lead_creado','lead_asignado','lead_reasignado','etapa_cambiada',
  'lead_archivado','lead_desarchivado',
  -- codigo (acciones de negocio)
  'seguimiento_registrado','whatsapp_enviado','whatsapp_desenlace',
  'llamada_iniciada','llamada_desenlace',
  'visita_agendada','visita_realizada','visita_cancelada',
  'tomado_de_bandeja',
  -- codigo, solo admin (supervision)
  'escalamiento_paso','push_recordatorio'
));
