-- 0009: grants de columna de visitas tras 0008.
-- duracion_min la edita el asesor al reagendar; las columnas gcal_* son
-- estado interno del espejo de Google y solo las escribe el servidor.
revoke update on public.visitas from authenticated;
grant update (fecha, duracion_min, estado, nota_resultado)
  on public.visitas to authenticated;

revoke insert on public.visitas from authenticated;
grant insert (lead_id, propiedad_id, asesor_id, fecha, duracion_min, estado, nota_resultado)
  on public.visitas to authenticated;
