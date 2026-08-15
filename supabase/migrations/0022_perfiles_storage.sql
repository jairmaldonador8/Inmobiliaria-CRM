-- Migracion 0022: bucket publico de fotos de perfil.
--
-- La bienvenida (paso «Tu perfil») deja al asesor subir su foto; la URL
-- publica se guarda en usuarios.foto (columna que existe desde 0001).
-- Carpeta por usuario (auth.uid()/...), mismo patron que 'captaciones'.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfiles', 'perfiles', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy perfiles_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Reemplazar la propia foto (upsert) requiere update ademas de insert.
create policy perfiles_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy perfiles_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'perfiles'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy perfiles_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'perfiles');
