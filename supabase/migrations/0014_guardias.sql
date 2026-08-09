-- Migracion 0014: guardias, configuracion, propiedades_internas,
-- lead_escalamientos y leads.escalamiento_desde (Fase B guardias).
-- Spec: docs/ultrapowers/specs/2026-08-05-guardias-design.md
-- Plan: docs/ultrapowers/plans/2026-08-09-fase-b-guardias.md
--
-- Nota de grants (mismo criterio que 0013): los default privileges de 0001
-- ya conceden todo a `authenticated`, asi que aqui se REVOCA primero y se
-- concede solo lo necesario. RLS es el guardian principal; los grants son
-- defensa en profundidad.

-- ===== guardias: rol mensual, un asesor por turno =====
create table public.guardias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  turno text not null check (turno in ('manana','tarde')),
  hora_inicio time not null,
  hora_fin time not null,
  asesor_id uuid not null references public.usuarios(user_id),
  creado_en timestamptz not null default now(),
  unique (fecha, turno)
);
create index on public.guardias (fecha);

-- ===== configuracion: key-value del org (solo admin; el sync lee con service role) =====
create table public.configuracion (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- ===== propiedades_internas: marca exclusiva INVISIBLE para asesores =====
-- Tabla aparte a proposito: admin y asesor comparten rol authenticated y RLS
-- es por fila — una columna en propiedades seria visible via select. La RLS
-- de esta tabla no tiene policy para no-admins: deny por default.
create table public.propiedades_internas (
  propiedad_id uuid primary key references public.propiedades(id) on delete cascade,
  exclusiva boolean not null default false,
  actualizado_en timestamptz not null default now()
);

-- ===== lead_escalamientos: pasos ejecutados (UNIQUE = idempotencia del cron) =====
create table public.lead_escalamientos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  paso text not null check (paso in ('recordatorio_15','abierto_30','dueno_120','recordatorio_vip')),
  ejecutado_en timestamptz not null default now(),
  unique (lead_id, paso)
);

-- ===== leads.escalamiento_desde: snapshot del reloj (NULL = no escala) =====
-- Se fija al asignar: now() en horario de guardia, hora_inicio de la guardia
-- destino si el lead entro fuera de horario, NULL si quedo en bandeja o fue
-- asignado a mano. Ediciones posteriores del rol NO lo mueven.
alter table public.leads add column escalamiento_desde timestamptz;

-- ===== RLS =====
alter table public.guardias enable row level security;
alter table public.configuracion enable row level security;
alter table public.propiedades_internas enable row level security;
alter table public.lead_escalamientos enable row level security;

-- guardias: todos los autenticados leen (el asesor ve el rol); escribe solo admin
create policy "autenticado lee guardias" on public.guardias
  for select to authenticated using (true);
create policy "admin inserta guardias" on public.guardias
  for insert to authenticated with check ((select private.is_admin()));
create policy "admin actualiza guardias" on public.guardias
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin elimina guardias" on public.guardias
  for delete to authenticated using ((select private.is_admin()));

-- configuracion / propiedades_internas: SOLO admin (sin policy para asesor
-- = deny por default; el asesor ni sabe que existen)
create policy "admin lee configuracion" on public.configuracion
  for select to authenticated using ((select private.is_admin()));
create policy "admin escribe configuracion" on public.configuracion
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admin lee propiedades_internas" on public.propiedades_internas
  for select to authenticated using ((select private.is_admin()));
create policy "admin escribe propiedades_internas" on public.propiedades_internas
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- lead_escalamientos: admin solo lectura; escrituras SOLO service role (el cron)
create policy "admin lee lead_escalamientos" on public.lead_escalamientos
  for select to authenticated using ((select private.is_admin()));

-- ===== grants: revocar el default amplio y conceder lo minimo =====
revoke insert, update, delete on public.guardias from authenticated;
grant insert (fecha, turno, hora_inicio, hora_fin, asesor_id)
  on public.guardias to authenticated;
grant update (hora_inicio, hora_fin, asesor_id)
  on public.guardias to authenticated;
grant delete on public.guardias to authenticated;

revoke insert, update, delete on public.configuracion from authenticated;
grant insert (clave, valor) on public.configuracion to authenticated;
grant update (valor, actualizado_en) on public.configuracion to authenticated;

revoke insert, update, delete on public.propiedades_internas from authenticated;
grant insert (propiedad_id, exclusiva) on public.propiedades_internas to authenticated;
grant update (exclusiva, actualizado_en) on public.propiedades_internas to authenticated;

revoke insert, update, delete on public.lead_escalamientos from authenticated;

-- ===== columna nueva de leads: el asesor no la escribe desde el cliente =====
-- (0002 maneja leads con column grants; escalamiento_desde queda fuera del
-- grant de update de authenticated: solo el service role la fija)

-- ===== seed de configuracion (el admin ajusta desde la UI) =====
insert into public.configuracion (clave, valor) values
  ('umbral_vip_mxn',   'null'::jsonb),
  ('dueno_user_id',    'null'::jsonb),
  ('correo_dueno',     'null'::jsonb),
  ('turno_manana',     '{"inicio":"09:00","fin":"15:00"}'::jsonb),
  ('turno_tarde',      '{"inicio":"15:00","fin":"00:00"}'::jsonb),
  ('escalamiento_min', '{"recordatorio":15,"abierto":30,"dueno":120}'::jsonb);
