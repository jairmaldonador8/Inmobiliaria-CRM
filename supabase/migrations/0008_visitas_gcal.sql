-- Migracion 0008: CRUD de visitas (duracion) + espejo Google Calendar
-- Habilita lo que necesita la integracion con Google Calendar (ver skill
-- google-calendar): duracion de la visita para calcular el fin del evento,
-- columnas de estado del espejo (sync_estado/intentos/proximo intento para
-- el cron gcal-retry) y la tabla donde vive la conexion OAuth de cada
-- asesor (refresh token cifrado, nunca legible desde el cliente).

-- =====================
-- 1. visitas: duracion + columnas de espejo Google Calendar
-- =====================
alter table visitas
  add column duracion_min integer not null default 60 check (duracion_min between 15 and 480),
  add column gcal_event_id text,
  add column gcal_sync_estado text not null default 'sin_conexion'
    check (gcal_sync_estado in ('sincronizada', 'pendiente', 'error', 'sin_conexion')),
  add column gcal_intentos integer not null default 0,
  add column gcal_proximo_intento timestamptz,
  add column gcal_ultimo_error text;

-- El cron gcal-retry hace polling por proximo_intento; el where acota el
-- indice a las filas que de verdad importan (pendientes).
create index visitas_gcal_pendientes_idx on visitas (gcal_proximo_intento)
  where gcal_sync_estado = 'pendiente';

-- Nota: el grant de columnas de UPDATE sobre `visitas` para `authenticated`
-- ya quedo acotado en la migracion 0002 a (fecha, estado, nota_resultado).
-- Las columnas nuevas (duracion_min, gcal_*) NO se agregan a ese grant: solo
-- el service-role (server actions / cron) las escribe.

-- =====================
-- 2. google_conexiones: conexion OAuth por asesor
-- =====================
create table google_conexiones (
  user_id uuid primary key references usuarios(user_id) on delete cascade,
  google_email text not null,
  refresh_token_cifrado text not null,
  estado text not null default 'activa' check (estado in ('activa', 'revocada')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

alter table google_conexiones enable row level security;

-- El asesor lee su propia conexion (para la card del dashboard: email
-- conectado, estado) y puede desconectarla. Insert/update solo por
-- service-role: sin policy para `authenticated` en esos comandos, y con RLS
-- habilitado la ausencia de policy deniega por default (mismo patron que
-- sync_estado/notificaciones en la migracion 0002).
create policy google_conexiones_select_propia on google_conexiones
  for select to authenticated using (user_id = (select auth.uid()));
create policy google_conexiones_delete_propia on google_conexiones
  for delete to authenticated using (user_id = (select auth.uid()));

-- Proteccion de columna del refresh token (patron de la seccion 4 de 0002):
-- Supabase otorga grants de TABLA completos a `authenticated` por default
-- privileges apenas se crea la tabla (incluye SELECT sobre todas las
-- columnas). Un `revoke select (columna) ... from authenticated` sin revocar
-- primero el grant de tabla NO tiene efecto — el grant de tabla sigue
-- cubriendo esa columna. Por eso se revoca el SELECT de tabla completo y se
-- regresa solo sobre las columnas seguras; refresh_token_cifrado queda
-- fuera del grant y por lo tanto ilegible para `authenticated` sin importar
-- la policy de fila.
revoke select on google_conexiones from authenticated;
grant select (user_id, google_email, estado, creada_en, actualizada_en)
  on google_conexiones to authenticated;
