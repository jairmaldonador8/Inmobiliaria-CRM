-- Migracion 0015: pasos de escalamiento por RONDAS (Fase C, escalamiento v2).
-- Spec: docs/ultrapowers/plans/2026-08-09-escalamiento-v2.md
--
-- El motor ahora repite recordatorios (cada 15 min, digest al asesor
-- responsable) y re-broadcasts abiertos (cada 30 min, digest a todos) hasta
-- el umbral del dueno (120). Cada ronda es una fila:
--   recordatorio_r1, recordatorio_r2, ...  |  abierto_r1, abierto_r2, ...
-- UNIQUE(lead_id, paso) sigue siendo la idempotencia at-most-once por ronda.
--
-- Los nombres viejos 'recordatorio_15' / 'abierto_30' se retiran del CHECK:
-- la tabla esta VACIA en dev y prod (el rol aun no se captura), no hay filas
-- legacy. 'dueno_120' y 'recordatorio_vip' siguen igual (paso unico).

alter table public.lead_escalamientos
  drop constraint lead_escalamientos_paso_check;

alter table public.lead_escalamientos
  add constraint lead_escalamientos_paso_check
  check (paso ~ '^(recordatorio_r[1-9][0-9]*|abierto_r[1-9][0-9]*|dueno_120|recordatorio_vip)$');
