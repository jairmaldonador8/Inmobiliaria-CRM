-- Migracion 0001: esquema completo CRM Montana Realty
-- 13 tablas de negocio + sync_estado (interna). Sin RLS (ver migracion 0002).

-- =====================
-- Enums
-- =====================
create type rol_usuario as enum ('admin','asesor');
create type etapa_lead as enum ('nuevo','contactado','cita_agendada','visita_realizada','negociacion','apartado','cerrado_ganado','cerrado_perdido');
create type fuente_lead as enum ('portal','whatsapp','referido','redes','walk_in','otro');
create type tipo_interes as enum ('compra','renta');
create type tipo_seguimiento as enum ('llamada','whatsapp','correo','visita','otro','sistema');
create type estado_sugerencia as enum ('nueva','revisada','implementada');
create type estado_visita as enum ('agendada','realizada','cancelada');
create type tipo_operacion as enum ('venta','renta');

-- =====================
-- Tablas
-- =====================

create table agencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  comision_pct numeric(5,2) not null default 5.0 check (comision_pct between 0 and 100),
  reparto_asesor_pct numeric(5,2) not null default 50.0 check (reparto_asesor_pct between 0 and 100),
  umbral_sin_atender_horas int not null default 24,
  umbral_estancada_dias int not null default 30,
  creada_en timestamptz not null default now()
);

create table usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agencia_id uuid not null references agencias(id),
  rol rol_usuario not null,
  nombre text not null,
  telefono text,
  foto text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table propiedades (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  easybroker_id text not null unique,
  titulo text not null,
  tipo text,
  -- operacion es text (vocabulario crudo de EasyBroker: sale/rental); el enum tipo_operacion aplica solo a operaciones internas
  operacion text,
  precio numeric(14,2), moneda text not null default 'MXN',
  ubicacion text,
  colonia text, ciudad text, lat double precision, lng double precision,
  superficie_construccion numeric(10,2), superficie_terreno numeric(10,2),
  recamaras int, banos numeric(4,1), estacionamientos int,
  estatus text not null default 'published',
  descripcion text, url_publica text,
  fotos jsonb not null default '[]'::jsonb,
  asesor_id uuid references usuarios(user_id),
  activa boolean not null default true,
  publicada_en timestamptz, actualizada_eb timestamptz, ultima_sync timestamptz,
  creada_en timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  nombre text not null,
  telefono text, email text,
  fuente fuente_lead not null default 'otro',
  fuente_detalle text,
  propiedad_id uuid references propiedades(id),
  asesor_id uuid references usuarios(user_id),
  etapa etapa_lead not null default 'nuevo',
  interes tipo_interes,
  presupuesto numeric(14,2),
  zona_interes text,
  notas text,
  easybroker_id text unique,
  mensaje_original text,
  archivado boolean not null default false,
  creado_en timestamptz not null default now(),
  asignado_en timestamptz
);

create table seguimientos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid references usuarios(user_id),
  tipo tipo_seguimiento not null,
  propiedad_id uuid references propiedades(id),
  nota text not null,
  creado_en timestamptz not null default now()
);

create table propiedad_portales (
  id uuid primary key default gen_random_uuid(),
  propiedad_id uuid not null references propiedades(id),
  portal text not null,
  url text,
  marcado_por uuid references usuarios(user_id),
  creado_en timestamptz not null default now(),
  unique (propiedad_id, portal)
);

create table visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  propiedad_id uuid references propiedades(id),
  asesor_id uuid not null references usuarios(user_id),
  fecha timestamptz not null,
  estado estado_visita not null default 'agendada',
  nota_resultado text,
  creada_en timestamptz not null default now()
);

create table operaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  lead_id uuid references leads(id),
  propiedad_id uuid references propiedades(id),
  asesor_id uuid not null references usuarios(user_id),
  tipo tipo_operacion not null,
  monto numeric(14,2) not null check (monto >= 0),
  comision_pct numeric(5,2) not null check (comision_pct between 0 and 100),
  comision_total numeric(14,2) not null,
  reparto_asesor_pct numeric(5,2) not null check (reparto_asesor_pct between 0 and 100),
  comision_asesor numeric(14,2) not null,
  comision_agencia numeric(14,2) not null,
  fecha_cierre date not null,
  registrada_por uuid not null references usuarios(user_id),
  creada_en timestamptz not null default now(),
  check (comision_asesor + comision_agencia = comision_total)
);

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references usuarios(user_id),
  tipo text not null,
  texto text not null,
  url text,
  leida boolean not null default false,
  creada_en timestamptz not null default now()
);

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  hilo_asesor_id uuid not null references usuarios(user_id),
  autor_id uuid not null references usuarios(user_id),
  texto text not null,
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);

create table sugerencias (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references usuarios(user_id),
  pantalla text not null,
  texto text not null,
  estado estado_sugerencia not null default 'nueva',
  creada_en timestamptz not null default now()
);

create table plantillas_mensajes (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id),
  nombre text not null,
  texto text not null,
  activa boolean not null default true,
  creada_en timestamptz not null default now()
);

create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(user_id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creada_en timestamptz not null default now()
);

-- Tabla interna de sincronizacion con EasyBroker
create table sync_estado (
  recurso text primary key,
  sync_cursor timestamptz,
  ultimo_ok timestamptz,
  ultimo_error text,
  actualizado_en timestamptz not null default now()
);

-- =====================
-- Indices
-- =====================
create index on leads (asesor_id);
create index on leads (agencia_id);
create index on leads (etapa);
create index on leads (telefono);
create index on leads (email);
create index on leads (propiedad_id);
create index on seguimientos (lead_id);
create index on propiedades (agencia_id);
create index on propiedades (asesor_id);
create index on notificaciones (destinatario_id) where not leida;
create index on visitas (asesor_id);
create index on visitas (fecha);
create index on mensajes (hilo_asesor_id);
create index on mensajes (hilo_asesor_id) where not leido;
create index on operaciones (asesor_id);
create index on sugerencias (estado);
create index on push_suscripciones (usuario_id);
