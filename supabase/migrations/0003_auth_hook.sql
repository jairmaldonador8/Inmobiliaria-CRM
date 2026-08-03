-- Migracion 0003: Custom Access Token Hook — inyecta el claim user_role en el JWT
--
-- IMPORTANTE (hosted Supabase): config.toml solo afecta al stack local del CLI.
-- En Supabase hosted el hook ADEMAS debe habilitarse manualmente en
-- Dashboard -> Authentication -> Hooks -> Custom Access Token, apuntando a
-- public.custom_access_token_hook.
--
-- Comportamiento: lee rol de public.usuarios para event->>'user_id'.
-- Si el usuario NO tiene fila en usuarios, devuelve el event SIN user_role y
-- SIN error: un auth user sin perfil debe poder iniciar sesion para que el
-- proxy lo desloguee con gracia. Si el hook lanzara error, TODOS los sign-ins
-- de la plataforma fallarian.

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
  where user_id = (event->>'user_id')::uuid;

  -- Sin fila en usuarios: devolver claims sin tocar (no user_role, no error).
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

-- Permisos: solo supabase_auth_admin puede ejecutar el hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- supabase_auth_admin necesita leer usuarios (y pasar RLS) para resolver el rol.
grant select on table public.usuarios to supabase_auth_admin;

create policy "auth admin lee usuarios" on public.usuarios
  as permissive for select
  to supabase_auth_admin
  using (true);
