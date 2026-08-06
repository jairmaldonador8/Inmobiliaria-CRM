-- Migracion 0010: cierra el hueco de grants de tabla que dejo la 0008 sobre
-- google_conexiones (ver skill google-calendar / Task 7).
--
-- La 0008 revoco el SELECT de tabla completo de `authenticated` y regranteo
-- solo columnas seguras (sin refresh_token_cifrado), pero NO toco los grants
-- de tabla de INSERT/UPDATE que Supabase otorga por default privileges al
-- crear la tabla. Hoy RLS bloquea la escritura porque no hay policy de
-- insert/update para `authenticated` (ver 0008: solo hay policies de select
-- y delete propios) — pero eso es una sola policy de distancia del desastre:
-- si alguna vez se agrega una policy de insert/update "propia" sin revisar
-- los grants de columna, `refresh_token_cifrado` quedaria escribible desde
-- el cliente de sesion. El refresh token SOLO lo escribe el servidor
-- (service-role, que ignora RLS y grants): revocamos insert/update de tabla
-- para `authenticated` de una vez, sin esperar a que exista esa policy.
--
-- `anon` nunca debería tener nada sobre esta tabla; se revoca explicito por
-- si Supabase le otorgo grants de tabla por default al crearla (mismo
-- patron defensivo que el resto de las migraciones de este repo).
revoke insert, update on public.google_conexiones from authenticated;
revoke insert, update, select on public.google_conexiones from anon;
