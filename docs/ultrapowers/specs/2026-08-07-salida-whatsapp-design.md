# Salida instrumentada a WhatsApp

**Fecha:** 2026-08-07
**Estado:** diseño aprobado en conversación, pendiente de plan de implementación

## El problema

Cuando a un asesor le cae un lead, lo saca a WhatsApp para hablarle. El sistema
registra que se envió un mensaje, pero ahí se acaba: nadie sabe si le contestaron
ni cómo va. El pipeline se queda quieto aunque el trabajo esté ocurriendo, y las
métricas de actividad que la dirección quiere medir (contactos, tasa de
respuesta, citas) no tienen de dónde salir.

El equipo trabaja con **números personales**, así que conectar la API oficial de
WhatsApp queda descartado: dar de alta el número de un asesor en la Cloud API le
inutiliza WhatsApp en su celular. Las librerías no oficiales (que sí permitirían
usar el número personal) violan los términos de Meta y arriesgan el baneo del
número de trabajo. **No se integra WhatsApp: se instrumenta la salida hacia él.**

## Punto de partida: qué existe ya

Esto **no se construye desde cero**. `src/components/leads/boton-whatsapp.tsx` ya
resuelve buena parte:

- abre una hoja con las **plantillas activas** de la agencia, con vista previa ya
  rellenada (`plantillas_mensajes` existe desde la 0001, con CRUD de admin en la
  0002 y `src/lib/plantillas/` cableado);
- abre `wa.me` con el mensaje listo;
- registra un `seguimientos` tipo `whatsapp` cuya nota dice **qué plantilla se
  usó** (`Se envió plantilla "X"` / `Mensaje directo por WhatsApp`).

Lo que falta es el desenlace: nadie sabe si hubo respuesta, y el lead no se
mueve de etapa.

> **Restricción heredada, no negociable.** El componente abre `wa.me` con
> `window.open` **síncrono, antes de cualquier trabajo async**, y lo documenta:
> los navegadores móviles bloquean los popups diferidos. Cualquier cambio que
> meta un `await` antes de esa llamada rompe WhatsApp en el celular — que es
> donde ocurre el trabajo real. El registro corre detrás, fire-and-forget.

## Qué se agrega

**Al salir.** Además de lo que ya hace, la salida registra un *contacto* con
desenlace pendiente y mueve el lead a `contactado`.

**Al volver.** Cuando el asesor regresa a Klo-Ser, se le pregunta cómo le fue,
con botones de un toque. Puede posponerlo; si lo pospone, el lead queda en una
lista visible.

## Decisiones tomadas

| Decisión | Resuelto |
|---|---|
| ¿Conectar WhatsApp por API? | No. Números personales + términos de Meta lo impiden. |
| ¿El clic mueve la etapa? | Sí, a `contactado`, y solo desde `nuevo`. |
| ¿Qué significa `contactado`? | «Le escribí» — explícitamente NO «hablamos». |
| ¿Se puede posponer el reporte? | Sí. El lead queda en «Sin respuesta». |
| ¿Dónde vive el estado? | Tabla nueva. `seguimientos` es inmutable. |
| ¿Se conserva el selector de plantillas? | Sí, intacto, y la nota sigue diciendo cuál se usó. |
| ¿Aplica cuando el que toca es admin? | No. Solo el asesor dueño del lead instrumenta. |

## El hallazgo que fija el modelo de datos

La idea inicial era guardar el resultado como una columna de `seguimientos`. **No
es posible, y es a propósito:** la migración 0002 revoca `update` y `delete` a
`authenticated` y además instala el trigger `private.seguimientos_inmutable()`,
que lanza excepción para *cualquier* rol. `seguimientos` es append-only por
diseño de seguridad y no se va a desarmar para esto.

El repo ya resolvió antes «un evento cuyo desenlace se conoce después» con
`visitas`: identidad inmutable al insertar y
`grant update (fecha, duracion_min, estado, nota_resultado)` (migración **0009**,
que reemplazó al grant original de la 0002). **Se copia esa forma de la tabla.**

> **Lo que NO se copia de `visitas` son sus policies.** `visitas` se protege por
> **autor** (`asesor_id = auth.uid()`, policies de la 0002 líneas 153-164), no por
> ownership del lead. Copiar eso aquí reintroduciría el huérfano por reasignación
> que este diseño evita a propósito. Las policies se modelan sobre
> **`seguimientos`**: `lead_id in (select id from leads where asesor_id = auth.uid())
> or private.is_admin()`.

## Modelo de datos

Migración **0013**, tabla nueva:

```sql
create type resultado_contacto as enum (
  'pendiente',      -- salió a WhatsApp, todavía no reporta
  'contesto',       -- hubo respuesta del lead
  'no_contesto',    -- se escribió y no hubo respuesta
  'cita',           -- derivó en cita agendada
  'no_interesa',    -- el lead descartó
  'sin_reporte'     -- nunca reportó y hubo un contacto posterior
);

create table contactos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid not null references usuarios(user_id),
  resultado resultado_contacto not null default 'pendiente',
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

-- La lista trabaja siempre sobre el contacto MÁS RECIENTE de cada lead
-- (ver «La ventana ciega»), así que el índice es por lead + recencia, NO
-- un índice parcial por resultado.
create index on contactos_whatsapp (lead_id, creado_en desc);
```

RLS y grants, modelados sobre `seguimientos`:

```sql
alter table contactos_whatsapp enable row level security;

create policy "asesor lee contactos de sus leads o admin" on contactos_whatsapp
  for select to authenticated
  using (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  );
-- insert: MISMA condición + ancla de autoría, igual que seguimientos (0002:130).
-- Sin el `autor_id = auth.uid()` un asesor podría forjar la autoría.
create policy "asesor inserta contactos de sus leads o admin" on contactos_whatsapp
  for insert to authenticated
  with check (
    (
      lead_id in (select id from leads where asesor_id = (select auth.uid()))
      or (select private.is_admin())
    )
    and autor_id = (select auth.uid())
  );
-- update: misma condición de lectura, y los grants de columna limitan el alcance.
create policy "asesor resuelve contactos de sus leads o admin" on contactos_whatsapp
  for update to authenticated
  using (…misma condición que select…)
  with check (…misma condición que select…);

revoke delete on contactos_whatsapp from authenticated;
grant insert (lead_id, autor_id) on contactos_whatsapp to authenticated;
grant update (resultado, resuelto_en) on contactos_whatsapp to authenticated;
```

Sin policy de DELETE, RLS ya lo negaría; el `revoke` explícito se mantiene por
consistencia con el precedente de `seguimientos` (0002:282).

**Por qué una tabla y no una columna en `leads`:** una columna solo guarda el
estado actual. Un asesor que escribe tres veces y recibe respuesta a la tercera
es exactamente el dato que las métricas necesitan, y con una columna se pierde.

**Los índices y las policies son por `lead_id`, no por `autor_id`.** Si un lead se
reasigna, un contacto anclado al asesor anterior desaparecería de toda cola
visible. El contacto viaja con el lead.

### Dedupe: por qué NO hay índice único

La versión anterior de este spec proponía
`create unique index … (lead_id) where resultado = 'pendiente'`. Se descarta por
dos razones concretas:

1. **Bloquearía contactos legítimos.** Un pendiente no caduca: «Ahora no» lo deja
   así indefinidamente y el asesor puede no volver nunca. Con el índice, escribir
   el lunes, posponer y volver a escribir el jueves registraría **un** contacto —
   destruyendo justo el historial de intentos que justifica la tabla.
2. **No se puede insertar contra él desde supabase-js.** PostgREST necesita un
   `onConflict` explícito, y un índice **parcial** no es un target válido:
   `.upsert(…, { onConflict: 'lead_id' })` falla con 42P10 y sin `onConflict` usa
   la PK, con lo que el índice parcial revienta con 23505 y el asesor vería un
   toast de error. El repo no tiene un solo `.rpc()` (verificado), así que
   resolverlo con una función SQL estrenaría un patrón sin precedente.

En su lugar, `registrarSalidaWhatsapp` resuelve el dedupe **en la acción**:

- si el lead tiene un contacto `pendiente` creado hace **menos de 5 minutos**, no
  se crea nada (es manoteo: tres toques son un contacto);
- si lo tiene y es **más viejo**, esos contactos pendientes pasan a `sin_reporte`
  (en plural: pueden ser más de uno, ver la carrera aceptada) y se inserta uno
  nuevo — es un segundo intento real, y queda el registro honesto de que el
  primero nunca se reportó;
- si no lo tiene, se inserta.

**El seguimiento se escribe siempre**, incluso cuando la ventana de 5 minutos
suprime el contacto. Hoy cada toque escribe uno y el timeline lo refleja; dejar
de hacerlo sería una regresión silenciosa. Lo que se deduplica es el *contacto*,
no el registro de que se mandó un mensaje.

**Carrera aceptada, y lo que obliga aguas abajo:** dos toques simultáneos pueden
crear dos filas `pendiente` para el mismo lead. Se prefiere eso a un toast de
error en la cara del asesor (criterio best-effort de `avance-automatico.ts`),
pero **nada puede asumir «como máximo un pendiente por lead»**:

- la consulta del paso 6 usa `order by creado_en desc` + `limit 1`, **nunca**
  `.maybeSingle()` — con dos filas devolvería el error PGRST116;
- `resolverContacto` resuelve **todos** los contactos `pendiente` de ese lead, no
  uno; si resolviera solo el que se le pasó, la hoja reaparecería con el otro.

## Flujo

### Salir (modifica `boton-whatsapp.tsx`)

1. El asesor elige plantilla (o «Sin plantilla») en la hoja que ya existe.
2. **`window.open(wa.me…)` síncrono.** Sin cambios, sin `await` antes.
3. Fire-and-forget: la llamada actual a `registrarSeguimiento` se **reemplaza**
   por `registrarSalidaWhatsapp(leadId, { nombrePlantilla })`, que del lado del
   servidor hace tres escrituras (tres viajes a Supabase, no una transacción):
   - resuelve el dedupe e inserta `contactos_whatsapp` (arriba);
   - inserta el `seguimientos` tipo `whatsapp` **con la misma nota de hoy** —
     perder ese texto sería una regresión del timeline;
   - avanza la etapa a `contactado` vía `avanzarEtapaPorEvento`.
4. `router.refresh()`, como hoy.

`registrarSalidaWhatsapp` debe revalidar **`/asesor`, `/asesor/leads` y
`/asesor/leads/[id]`**. Hoy `registrarSeguimiento` revalida `/asesor/leads/[id]`,
`/admin/leads/[id]` y `/admin/leads` — ni `/asesor` ni `/asesor/leads`. Copiar
ese conjunto tal cual dejaría la cola del día en caché y la lista «Sin respuesta»
no aparecería hasta una recarga dura.

**Si el que toca es admin y no el asesor dueño del lead**, la acción escribe
*solo* el seguimiento: sin fila de contacto y sin mover etapa. La regla vive **en
la server action**, no duplicada en los dos componentes que montan el botón
(`(asesor)/asesor/leads/[id]:155` y `(admin)/admin/leads/[id]:197`).

### Volver (nuevo)

5. Un componente de cliente en la ficha del lead escucha `visibilitychange` — el
   mismo mecanismo que usa `banner-instalacion.tsx` — y al volver a `visible`
   llama `router.refresh()`.
6. El Server Component lee el **contacto más reciente** de ese lead
   (`order by creado_en desc`, `limit 1`); si su `resultado` es `pendiente`,
   monta la hoja de desenlace. El estado vive en el servidor: el cliente no lo
   inventa ni lo conserva entre recargas.
7. La hoja ofrece: **Agendé una cita** · **Me contestó** · **No me contestó** ·
   **No le interesa** · *Ahora no*.
8. `resolverContacto(leadId, resultado)` — **por lead, no por contacto**: escribe
   `resultado` y `resuelto_en` en todos los `pendiente` de ese lead (ver la
   carrera aceptada), aplica el efecto sobre el lead, y revalida `/asesor`,
   `/asesor/leads` y `/asesor/leads/[id]`. `cambiarEtapa` por su cuenta solo
   revalida `/asesor/leads` (`RUTA_KANBAN`), que no alcanza para refrescar ni la
   cola del día ni la ficha.

| Botón | Etapa del lead | Vía | Sigue en «Sin respuesta» |
|---|---|---|---|
| Agendé una cita | `cita_agendada` | la hoja de visita, al guardar | No |
| Me contestó | sin cambio (`contactado`) | — | No |
| No me contestó | sin cambio (`contactado`) | — | **Sí** |
| No le interesa | `cerrado_perdido` | **`cambiarEtapa`** | No |
| Ahora no | sin cambio | — | **Sí** (sigue `pendiente`) |

**«No le interesa» NO pasa por el avance automático.** `cerrado_perdido` no es
una columna del kanban: `etapaTrasEvento()` devolvería `null` y el lead nunca se
cerraría. Va por `cambiarEtapa` (`src/lib/leads/acciones-asesor.ts`), que además
escribe `NOTA_CIERRE.cerrado_perdido`, del que dependen la vista de leads
cerrados y el conteo de cierres del mes.

### «Agendé una cita»: los dos pasos

Es la única opción con interacción en dos tiempos, y exige trabajo que hay que
presupuestar:

- **`HojaAgendarVisita` hoy no es controlable**: tiene su propio estado `abierto`
  y renderiza su propio `SheetTrigger`. **El refactor entra en el alcance** y
  necesita tres cosas, no una:
  1. API controlada (`open` / `onOpenChange`), conservando el trigger actual como
     modo por defecto para no tocar su uso existente;
  2. un callback **`onAgendada`**, sin el cual no hay forma de saber que la
     visita se guardó y por tanto de resolver el contacto a `cita`;
  3. atender el early-return por `deshabilitadoMotivo`, que hoy **ni siquiera
     monta el `Sheet`** — en modo controlado un `open = true` se ignoraría en
     silencio. Si el lead no puede agendar (sin teléfono, sin propiedad), el
     botón «Agendé una cita» debe estar deshabilitado en la hoja de desenlace,
     no abrir una hoja que nunca aparece.
- **Una sola instancia cliente.** La ficha es Server Component, así que el estado
  compartido entre la hoja de desenlace y la de visita vive en un componente
  cliente nuevo que monta ambas. La alternativa —una segunda instancia dentro de
  la hoja de desenlace— obligaría a repetir las 8 props que hoy le pasa el
  servidor (`leadNombre`, `telefono`, `asesorNombre`, `asesorId`,
  `propiedadLeadId`, `propiedadLeadTitulo`, `propiedades`…) y a mantenerlas
  sincronizadas en dos lugares.
- **El contacto se resuelve a `cita` solo cuando la visita se guardó con éxito**,
  enganchado al éxito de `agendarVisita`. Si el asesor abre el formulario y lo
  abandona, el contacto **sigue `pendiente`** y el lead sigue en «Sin respuesta»,
  que es lo correcto: no hubo cita.
- La etapa la mueve `agendarVisita`, que ya llama `avanzarEtapaPorVisita` con
  destino `cita_agendada`. No se duplica esa lógica.

## Las dos guardas

**No mover hacia atrás.** `etapaTrasEvento()` (`src/lib/leads/avance-etapa.ts`)
es una función pura, ya probada, que solo empuja hacia adelante y nunca toca
leads cerrados ni etapas fuera del tablero. El avance a `contactado` **la
reutiliza tal cual**. `avanzarEtapaPorVisita()` se generaliza a
`avanzarEtapaPorEvento()` y `MotivoAvance` gana `'whatsapp_enviado'`, con su
entrada en `TEXTO_MOTIVO` — que, como advierte ese archivo, **no puede parecerse
a `NOTA_CIERRE`** o inflaría el conteo de cerrados del mes.

**No duplicar por manoteo.** Ventana de 5 minutos en la acción (ver arriba).

## La ventana ciega que este diseño cierra

Hoy la cola del día arma dos listas: **«Atiende ahora»** son los leads asignados
**sin ningún seguimiento**, y **«Necesitan seguimiento»** los que llevan **más de
24 h** desde el último. Al registrar un seguimiento, el lead sale de la primera y
todavía no califica para la segunda: **queda 24 horas invisible**. Eso pasa hoy,
cada vez que alguien manda un WhatsApp.

Entra una tercera lista, **«Sin respuesta»**, arriba de «Necesitan seguimiento»,
que cubre los dos estados que significan lo mismo para el asesor: `pendiente`
(no ha dicho cómo le fue) y `no_contesto` (dijo que no le respondieron).
Unificarlos es lo que evita reabrir el agujero — si `no_contesto` saliera de toda
lista, el lead volvería a ser invisible por 24 h justo después de que el asesor
reportó, honestamente, que nadie le contestó.

### Cómo se arma la lista, exactamente

**Regla: un lead está en «Sin respuesta» si su contacto MÁS RECIENTE es
`pendiente` o `no_contesto`.** No «si tiene algún contacto en esos estados» — esa
lectura hace que la lista crezca para siempre. Ejemplo del fallo: lunes «No me
contestó» (fila A), jueves vuelve a escribir (fila B, `pendiente`), el lead
responde y reporta «Me contestó» (B → `contesto`). Con la regla ingenua, A sigue
matcheando y el lead sigue listado pese a haber contestado. Con la regla del
contacto más reciente, sale — que es lo correcto. Esa es también la razón por la
que el índice es `(lead_id, creado_en desc)` y no un índice parcial por
`resultado`: el filtro por estado se aplica **después** de elegir el más
reciente, no antes.

**Y la consulta no puede ser solo sobre `contactos_whatsapp`.** Cerrar o archivar
un lead desde el kanban no toca esa tabla, así que la fila sobreviviría y el lead
reaparecería como zombi. Se une contra `leads` con los mismos criterios que las
otras dos colas:

- `archivado = false`
- `etapa not in (ETAPAS_CERRADAS)`
- **no es `saliente`** — con cuidado: las otras dos colas filtran en JS con
  `l.clasificacion_eb !== 'saliente'`, que **incluye los `NULL`** a propósito y
  está documentado en `asesor/page.tsx` («no se penaliza al lead por falta de
  dato»). En SQL, `<> 'saliente'` evalúa a `NULL` para esas filas y **las
  descarta**: todo lead capturado a mano o anterior a la 0011 desaparecería de la
  lista. Hay que escribirlo como
  `(clasificacion_eb is null or clasificacion_eb <> 'saliente')`, o filtrar en JS
  como las otras dos. **No usar `.neq()` a secas.**

## Superficie de interfaz

- **`boton-whatsapp.tsx`**: cambia la acción que dispara; la hoja de plantillas y
  el orden de `window.open` no se tocan.
- **`hoja-agendar-visita.tsx`**: refactor a API controlada, conservando el uso
  actual.
- **Ficha del lead** (`/asesor/leads/[id]`): detector de regreso + hoja de
  desenlace.
- **Ficha de admin** (`/admin/leads/[id]`): sin cambios de comportamiento.
- **Cola del día** (`/asesor`): sección «Sin respuesta».
- Estilo según la skill `fintech-muro-ui`; la hoja reutiliza el patrón de
  `sheet-seguimiento.tsx`.

## Pruebas

Unitarias (sin Supabase, como `avance-etapa`):
- `etapaTrasEvento('nuevo', 'contactado')` → `'contactado'`
- `etapaTrasEvento('negociacion', 'contactado')` → `null` (no retrocede)
- `etapaTrasEvento('cerrado_ganado', 'contactado')` → `null`
- `etapaTrasEvento('apartado', 'contactado')` → `null` (fuera del tablero, 0012)
- dedupe: pendiente de hace 2 min → no se crea contacto; de hace 2 h → se crea y
  el anterior queda `sin_reporte`
- dedupe suprimido → **el seguimiento sí se escribe** de todas formas
- la nota del seguimiento conserva el nombre de la plantilla
- «Sin respuesta» por contacto más reciente: lead con `no_contesto` viejo +
  `contesto` nuevo **no** aparece; con `contesto` viejo + `pendiente` nuevo **sí**
- el filtro de `saliente` conserva los leads con `clasificacion_eb = null`

Integración (RLS, `vitest.integration.config.ts`):
- un asesor no lee ni resuelve contactos de leads ajenos
- tras reasignar el lead, el contacto pendiente es visible para el **nuevo**
  asesor y ya no para el anterior
- `update` sobre columnas fuera de `(resultado, resuelto_en)` es rechazado
- insert con `autor_id` forjado es rechazado
- un admin tocando el botón en un lead ajeno no crea fila ni mueve etapa
- un lead archivado o cerrado no aparece en «Sin respuesta»

En navegador (obligatorio — ver memoria del proyecto):
- salir a WhatsApp y confirmar que el lead se mueve a «Contactado» y aparece en
  «Sin respuesta»
- volver a la app y confirmar que la hoja aparece sola
- posponer y confirmar que el lead sigue en la lista
- abrir la hoja de visita desde «Agendé una cita», abandonarla, y confirmar que
  el contacto sigue pendiente
- **en un celular real**: confirmar que WhatsApp sigue abriendo. La regresión más
  cara de este cambio es un popup bloqueado, y no se ve en escritorio.

## Fuera de alcance

- Integración con la API de WhatsApp (Cloud API, coexistencia, Embedded Signup).
- **Medir qué plantilla convierte mejor.** Las plantillas ya existen y no se
  tocan; lo que no entra es cruzar plantilla usada contra desenlace.
- Recordatorio push al asesor con contactos sin respuesta. La infraestructura
  existe (Fase A) y es el siguiente paso natural, pero no entra aquí.

## Riesgos aceptados

**El asesor puede no volver.** Si cierra todo, `visibilitychange` no dispara. Es
la razón por la que «Sin respuesta» es una lista persistente y no solo una
pregunta al vuelo: la pregunta se pierde, la lista no.

**`contactado` es una afirmación débil.** Significa «le escribí», no «hablamos».
Queda documentado en la etiqueta de la interfaz; el dato duro lo da `resultado`.

**En escritorio el regreso es menos confiable.** Abrir WhatsApp Web en otra
pestaña dispara `visibilitychange`, pero el asesor puede quedarse ahí. En móvil
—donde ocurre el trabajo real— el regreso desde la app de WhatsApp es fiable.

**Las tres escrituras pueden desincronizarse.** No hay transacción; si una falla,
las otras quedaron. Mismo criterio best-effort de `avance-automatico.ts`: se
prefiere perder una fila a bloquear al asesor. Los errores van a consola, no a la
cara del usuario.
