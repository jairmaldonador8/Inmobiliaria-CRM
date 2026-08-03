-- Migracion 0005: el auth hook deja de mintar user_role para usuarios inactivos
--
-- BUG (gap de infraestructura de auth): 0003 resolvia v_rol leyendo
-- public.usuarios por user_id, SIN filtrar por activo. Un usuario desactivado
-- que inicia sesion de nuevo obtenia un claim user_role valido en su JWT
-- fresco -> el proxy lo enrutaba a /asesor -> requireAsesor() en el layout
-- lee activo=false y redirige a / -> el proxy, viendo sesion+rol validos,
-- lo regresa a /asesor -> bucle infinito de redirects.
--
-- FIX: agregar "and activo" al WHERE de la resolucion de rol. Con esto:
--   - usuario activo: comportamiento identico a 0003 (v_rol resuelto, claim
--     user_role inyectado).
--   - usuario inactivo: v_rol sale null (misma rama que "sin fila en
--     usuarios"), el hook devuelve el event SIN user_role y SIN error.
--     iniciarSesion() ya maneja esta rama (rol undefined): cierra la sesion
--     recien creada con signOut({scope:'local'}) y muestra "Tu cuenta no
--     tiene acceso. Contacta al administrador." No hace falta tocar el
--     proxy ni los layouts — la cuenta nunca llega a tener un JWT con rol.
--
-- El resto de la funcion (guardas, permisos, exception handler) es identico
-- a la version endurecida de 0003: un error inesperado en el hook (ej.
-- user_id no-UUID) jamas debe propagarse, porque bloquearia TODOS los
-- sign-ins de la plataforma.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  v_rol public.rol_usuario;
begin
  select rol
    into v_rol
  from public.usuarios
  where user_id = (event->>'user_id')::uuid
    and activo;

  -- Sin fila en usuarios (o usuario inactivo): devolver claims sin tocar
  -- (no user_role, no error).
  if v_rol is null then
    return event;
  end if;

  claims := jsonb_set(coalesce(event->'claims', '{}'::jsonb),
                      '{user_role}', to_jsonb(v_rol::text));
  return jsonb_set(event, '{claims}', claims);
exception
  -- Cinturon de seguridad: cualquier error inesperado (ej. user_id no-UUID) NO debe
  -- propagarse, porque un hook que lanza error bloquea TODOS los sign-ins de la plataforma.
  when others then
    return event;
end;
$$;
