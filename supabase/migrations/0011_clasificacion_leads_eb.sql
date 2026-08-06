-- Migracion 0011: clasificacion de leads provenientes de EasyBroker.
--
-- Medido sobre 150 contact requests reales (ver skill easybroker-api, seccion
-- "Tipos de contact request"): lo que hoy cae TODO a la bandeja como si fuera
-- un lead en realidad son 3 cosas distintas —
--   - cliente_directo: comprador/arrendatario real (el lead de verdad).
--   - co_broke: corredor externo con un cliente interesado en una propiedad
--     nuestra (negociacion entre colegas).
--   - saliente: un asesor de Montana pregunto por una propiedad AJENA y el
--     corredor de esa agencia contesto. No es un lead (24% de la muestra).
-- Esta migracion solo agrega donde guardarlo; la deteccion vive en el sync
-- (src/lib/easybroker/sync.ts) y el consumo en la UI de bandeja es tarea
-- aparte.

create type clasificacion_lead_eb as enum ('cliente_directo', 'co_broke', 'saliente');

-- Nullable, SIN default. NULL cubre dos casos a proposito, sin distinguirlos
-- con un valor propio de enum ("sin_clasificar"): (a) leads que no vienen de
-- EasyBroker (fuente distinta de 'portal', o 'portal' historico previo a esta
-- migracion) y (b) leads de EasyBroker cuya clasificacion no se pudo resolver
-- (GET /v1/contacts/{id} fallo, o el contact request no traia property_id).
-- Igual que `interes` (tambien nullable para "aun no se sabe"), evita inflar
-- el enum con un valor que no es una categoria real del dominio, y deja
-- `is null` como el filtro natural de "pendiente de clasificar" tanto para el
-- backfill (scripts/backfill-clasificacion-eb.ts) como para la UI.
alter table leads add column clasificacion_eb clasificacion_lead_eb;

comment on column leads.clasificacion_eb is
  'Clasificacion del contact request de EasyBroker que origino el lead: '
  'cliente_directo (comprador/arrendatario real), co_broke (corredor externo '
  'con cliente interesado en propiedad nuestra) o saliente (asesor propio '
  'preguntando por propiedad ajena; no es un lead real). NULL = no viene de '
  'EasyBroker o clasificacion pendiente/fallida. La escribe el sync '
  '(service-role); ver grants en 0002_rls.sql (no se agrega a la allowlist de '
  'insert/update de authenticated).';

-- Filtro esperado desde la UI de bandeja (clasificacion_eb = 'saliente' para
-- excluir, o is null / 'cliente_directo' / 'co_broke' para incluir).
create index on leads (clasificacion_eb);

-- Nota de grants (decision, no se toca 0002_rls.sql): las grants de columna
-- de esa migracion usan un allowlist explicito tanto para insert como para
-- update de `leads` a `authenticated` (revoke de tabla + grant de columnas
-- puntuales). Una columna agregada despues por ALTER TABLE no hereda esas
-- grants -- hay que listarla a mano para que quede escribible -- asi que
-- `clasificacion_eb` ya nace SIN privilegio de insert/update para
-- `authenticated`, que es lo que queremos: solo el sync (service-role, que
-- ignora RLS y column grants) la escribe.
