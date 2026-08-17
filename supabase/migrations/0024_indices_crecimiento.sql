-- 0024: índices para crecer sin trabas (2026-08-17).
--
-- Preparación para más usuarios y más datos — cada índice responde a una
-- consulta real del código, no a una corazonada:
--
-- 1. Las DOS páginas de propiedades (admin y asesor) ordenan por
--    actualizada_eb desc y no había índice.
create index if not exists propiedades_actualizada_eb_idx
  on public.propiedades (actualizada_eb desc);

-- 2. «Último seguimiento por lead» (home admin, apartado del asesor, cola
--    del día): se consulta seguimientos por lead_id ordenado por creado_en
--    desc. El índice simple de lead_id (0001) no cubre el orden.
create index if not exists seguimientos_lead_recencia_idx
  on public.seguimientos (lead_id, creado_en desc);

-- 3. Pipeline por asesor (apartado /admin/asesores/[id], carga del equipo):
--    filtra asesor_id + etapa juntos; los índices sueltos de 0001 obligan a
--    combinar. Compuesto directo.
create index if not exists leads_asesor_etapa_idx
  on public.leads (asesor_id, etapa);

-- 4. La bandeja es SIEMPRE la misma consulta (sin asesor, no archivados,
--    por llegada): índice parcial exacto a su forma — chico y al grano.
create index if not exists leads_bandeja_idx
  on public.leads (creado_en desc)
  where asesor_id is null and archivado = false;
