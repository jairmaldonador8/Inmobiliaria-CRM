-- Migracion 0004: idempotencia del sync EasyBroker (Task 10, carry-overs de review)

-- 1. seguimientos.easybroker_id: marca el contact request de EasyBroker que
--    origino un seguimiento de "consulta repetida". UNIQUE (nulls permitidos,
--    los seguimientos manuales no lo llevan) para que reprocesar el mismo
--    contact request — reintento del cron o invocaciones traslapadas — no
--    duplique seguimientos ni dispare notificaciones repetidas: el sync trata
--    la violacion 23505 como "duplicado, saltar".
alter table seguimientos add column easybroker_id text unique;

-- 2. sync_estado.lock_until: lease de ejecucion unica del sync (fila con
--    recurso='lock'). sincronizarEasyBroker adquiere un lease de 5 minutos con
--    un UPDATE condicional atomico y lo libera al terminar; una corrida
--    concurrente que no obtiene el lease regresa de inmediato (omitido).
alter table sync_estado add column lock_until timestamptz;
