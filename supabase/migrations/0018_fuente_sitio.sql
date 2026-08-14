-- 0018: nueva fuente de leads 'sitio'.
--
-- El sitio oficial de Montana manda leads directo al CRM (server-to-server,
-- POST /api/leads/captura) sin pasar por EasyBroker. 'portal' queda reservado
-- para lo que entra por el sync de EasyBroker; 'sitio' identifica el canal
-- propio para el embudo por origen.
--
-- Nota: ADD VALUE es seguro dentro de la transaccion del script de migracion
-- (Postgres >= 12) siempre que el valor nuevo no se USE en la misma
-- transaccion — aqui solo se declara; lo usa la app en runtime.

alter type fuente_lead add value if not exists 'sitio';
