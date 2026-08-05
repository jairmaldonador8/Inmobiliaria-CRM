-- 0007: policy UPDATE faltante en push_suscripciones — el upsert del re-sync
-- de suscripciones (ON CONFLICT (endpoint) DO UPDATE) la requiere. La tabla
-- existe desde 0001; RLS y policies select/insert/delete desde 0002.
create policy "usuario actualiza sus suscripciones push" on public.push_suscripciones
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
