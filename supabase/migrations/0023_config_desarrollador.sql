-- 0023: el desarrollador recibe las sugerencias del chat de Klo.
--
-- Pedido de Jair (2026-08-17, primer testeo real): el feedback que el equipo
-- le deja al gallito es material de desarrollo, no de operación — debe
-- notificar SOLO al desarrollador, no a todos los admins (Renata y Fede ya
-- son admins y les estaba llegando). Mismo patrón que dueno_user_id (0014):
-- un puntero en configuracion. NULL = fallback a todos los admins.

insert into public.configuracion (clave, valor) values
  ('desarrollador_user_id', 'null'::jsonb)
on conflict (clave) do nothing;
