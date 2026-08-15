-- Migracion 0021: tema PLUMA por usuario + bandera de bienvenida.
--
-- La ley de PLUMA (2026-08-14): cada persona elige su fondo (blanco galeria
-- o negro grafito) en su INTRODUCCION de bienvenida, y la preferencia lo
-- sigue a cualquier dispositivo. La cookie `tema` es solo transporte por
-- dispositivo; esta columna es la verdad.
--
-- bienvenida_completada arranca en false: los asesores existentes y los
-- nuevos pasan una vez por /bienvenida (elegir tema + activar avisos).
-- Los admins no se redirigen (el layout solo manda asesores), pero tambien
-- guardan su tema aqui via el switch de la luna.

alter table public.usuarios
  add column tema text not null default 'blanco'
    check (tema in ('blanco','negro')),
  add column bienvenida_completada boolean not null default false;

-- Sin cambios de RLS/grants: las escrituras pasan por acciones de servidor
-- (service role) que solo tocan la fila del propio usuario autenticado.
