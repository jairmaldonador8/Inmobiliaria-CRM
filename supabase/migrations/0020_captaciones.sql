-- Migracion 0020: captaciones — el asesor sube su captacion, el admin la
-- revisa con el score de calidad y la carga a EasyBroker con un click.
--
-- Flujo de estados:
--   borrador  -> el asesor la esta armando (solo el la ve editable)
--   enviada   -> en revision del admin
--   regresada -> el admin la devolvio con comentarios; el asesor la corrige
--   cargada   -> ya vive en EasyBroker (easybroker_id poblado); inmutable
--                para el asesor
--
-- Las fotos viven en el bucket publico 'captaciones' de Storage (primera vez
-- que el proyecto usa Storage): carpeta por usuario (auth.uid()/...), asi la
-- policy de subida es por prefijo. EasyBroker las consume por URL publica.

create table public.captaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id),
  asesor_id uuid not null references public.usuarios(user_id),
  estado text not null default 'borrador'
    check (estado in ('borrador','enviada','regresada','cargada')),

  -- Datos de la propiedad (nullable: el borrador se guarda incompleto;
  -- los bloqueantes del score deciden cuando se puede aprobar).
  titulo text not null default '',
  descripcion text not null default '',
  tipo text,
  operacion text check (operacion in ('sale','rental')),
  precio numeric(14,2),
  moneda text not null default 'MXN',
  colonia text,
  ciudad text,
  entidad text not null default 'Nuevo León',
  calle text,
  numero_exterior text,
  codigo_postal text,
  lat double precision,
  lng double precision,
  mostrar_ubicacion_exacta boolean not null default false,
  recamaras int,
  banos int,
  medios_banos int,
  estacionamientos int,
  antiguedad int,
  m2_construccion numeric(10,2),
  m2_terreno numeric(10,2),
  video_url text,
  tour_url text,
  -- [{"url": "...", "path": "..."}] en el orden elegido por el asesor.
  fotos jsonb not null default '[]',

  -- Revision y carga (server-managed: fuera de los grants de columnas).
  comentario_admin text,
  easybroker_id text unique,
  cargada_en timestamptz,
  cargada_por uuid references public.usuarios(user_id),

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index on public.captaciones (asesor_id);
create index on public.captaciones (estado);

alter table public.captaciones enable row level security;

-- El asesor ve las suyas; el admin ve todas.
create policy captaciones_select on public.captaciones
  for select to authenticated
  using (asesor_id = (select auth.uid()) or (select private.is_admin()));

-- El asesor crea las suyas (nace borrador o enviada, nunca cargada).
create policy captaciones_insert on public.captaciones
  for insert to authenticated
  with check (
    asesor_id = (select auth.uid())
    and estado in ('borrador','enviada')
  );

-- El asesor edita las suyas SOLO mientras estan en su cancha (borrador o
-- regresada) y no puede moverlas mas alla de 'enviada'. El admin
-- (regresar/cargar) opera con service role, no necesita policy.
create policy captaciones_update on public.captaciones
  for update to authenticated
  using (
    asesor_id = (select auth.uid())
    and estado in ('borrador','regresada')
  )
  with check (
    asesor_id = (select auth.uid())
    and estado in ('borrador','enviada')
  );

-- El asesor solo puede tirar borradores.
create policy captaciones_delete on public.captaciones
  for delete to authenticated
  using (asesor_id = (select auth.uid()) and estado = 'borrador');

-- Grants por columna: las server-managed (comentario_admin, easybroker_id,
-- cargada_*) quedan fuera — solo el service role las toca.
revoke insert, update, delete on public.captaciones from authenticated;
grant insert (
  agencia_id, asesor_id, estado, titulo, descripcion, tipo, operacion,
  precio, moneda, colonia, ciudad, entidad, calle, numero_exterior,
  codigo_postal, lat, lng, mostrar_ubicacion_exacta, recamaras, banos,
  medios_banos, estacionamientos, antiguedad, m2_construccion, m2_terreno,
  video_url, tour_url, fotos
) on public.captaciones to authenticated;
grant update (
  estado, titulo, descripcion, tipo, operacion, precio, moneda, colonia,
  ciudad, entidad, calle, numero_exterior, codigo_postal, lat, lng,
  mostrar_ubicacion_exacta, recamaras, banos, medios_banos, estacionamientos,
  antiguedad, m2_construccion, m2_terreno, video_url, tour_url, fotos,
  actualizado_en
) on public.captaciones to authenticated;
grant delete on public.captaciones to authenticated;

-- ===== Storage: bucket publico para las fotos de captaciones =====
-- Publico: EasyBroker exige URLs http(s) accesibles. Limite 6MB (el tope de
-- EB por imagen) y solo formatos que EB acepta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'captaciones', 'captaciones', true, 6291456,
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Subida: cada quien a su carpeta (primer segmento del path = su uid).
create policy captaciones_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'captaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Borrado: el dueno de la carpeta, o un admin.
create policy captaciones_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'captaciones'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

-- Lectura autenticada via API (la publica va por la URL del bucket publico).
create policy captaciones_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'captaciones');
