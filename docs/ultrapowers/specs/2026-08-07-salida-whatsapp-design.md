# Salida instrumentada a WhatsApp

**Fecha:** 2026-08-07
**Estado:** diseño aprobado en conversación, pendiente de plan de implementación

## El problema

Cuando a un asesor le cae un lead, lo saca a WhatsApp para hablarle. En ese
momento la conversación deja de existir para el sistema: Klo-Ser no sabe si le
escribió, si le contestaron, ni cómo va. El pipeline se queda quieto aunque el
trabajo esté ocurriendo, y las métricas de actividad que la dirección quiere
medir (cuántos contactos, cuántas citas) no tienen de dónde salir.

El equipo trabaja con **números personales**, así que conectar la API oficial de
WhatsApp queda descartado: dar de alta el número de un asesor en la Cloud API le
inutiliza WhatsApp en su celular. Las librerías no oficiales (que sí permitirían
usar el número personal) violan los términos de Meta y arriesgan el baneo del
número de trabajo. **No se integra WhatsApp: se instrumenta la salida hacia él.**

## Qué se construye

Dos momentos.

**Al salir.** El botón de WhatsApp de la ficha del lead deja de ser un enlace
suelto: antes de abrir la conversación registra el contacto y mueve el lead a
`contactado`. Ese dato no depende de que nadie reporte nada.

**Al volver.** Cuando el asesor regresa a Klo-Ser, se le pregunta cómo le fue con
ese lead, con botones de un toque. Puede posponerlo; si lo pospone, el lead queda
en una lista visible y vuelve a subir en su cola.

## Decisiones tomadas

| Decisión | Resuelto |
|---|---|
| ¿Conectar WhatsApp por API? | No. Números personales + términos de Meta lo impiden. |
| ¿El clic mueve la etapa? | Sí, a `contactado`, y solo desde `nuevo`. |
| ¿Qué significa `contactado`? | «Le escribí» — explícitamente NO «hablamos». |
| ¿Se puede posponer el reporte? | Sí. El lead queda en «Esperando resultado». |
| ¿Dónde vive el estado pendiente? | Tabla nueva. `seguimientos` es inmutable. |

## El hallazgo que fija el modelo de datos

La idea inicial era guardar el resultado como una columna de `seguimientos`. **No
es posible, y es a propósito:** la migración 0002 revoca `update` y `delete` a
`authenticated`, y además instala el trigger `private.seguimientos_inmutable()`
que lanza excepción para *cualquier* rol. `seguimientos` es append-only por
diseño de seguridad y no se va a desarmar para esto.

El repo ya resolvió antes este mismo problema — «un evento cuyo desenlace se
conoce después» — con la tabla `visitas`: identidad inmutable al insertar,
y `grant update (fecha, estado, nota_resultado)` para el desenlace. **El diseño
copia ese patrón**, que además ya está probado en producción.

## Modelo de datos

Migración **0013**, tabla nueva:

```sql
create type resultado_contacto as enum (
  'pendiente',      -- salió a WhatsApp, todavía no reporta
  'contesto',       -- hubo respuesta del lead
  'no_contesto',    -- se escribió y no hubo respuesta
  'cita',           -- derivó en cita agendada
  'no_interesa'     -- el lead descartó
);

create table contactos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid not null references usuarios(user_id),
  resultado resultado_contacto not null default 'pendiente',
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);
```

Grants espejo de `visitas`: insert de las columnas de identidad,
`grant update (resultado, resuelto_en)` — nada más. RLS owner-or-admin por
ownership del lead, igual que `seguimientos` y `visitas`.

Índice parcial para la lista de pendientes, que es la consulta caliente:

```sql
create index on contactos_whatsapp (autor_id, creado_en)
  where resultado = 'pendiente';
```

**Por qué una tabla y no una columna en `leads`:** una columna solo guarda el
estado actual. Un asesor que escribe tres veces y recibe respuesta a la tercera
es exactamente el dato que las métricas de actividad necesitan, y con una columna
se pierde. Una fila por intento da contactos por periodo, tasa de respuesta y
tiempo hasta la respuesta sin trabajo adicional.

## Flujo

### Salir

1. El asesor toca **WhatsApp** en la ficha del lead.
2. Server action `registrarSalidaWhatsapp(leadId)`:
   - inserta `contactos_whatsapp` con `resultado = 'pendiente'`;
   - inserta un `seguimientos` tipo `whatsapp` (el timeline humano);
   - llama al avance automático de etapa hacia `contactado`.
3. Se abre `wa.me` con el teléfono del lead.

Los tres efectos son **best-effort**: si algo falla, la conversación se abre de
todas formas. Bloquear a un asesor porque no se pudo escribir una fila sería
peor que perder la fila. Mismo criterio ya establecido en `avance-automatico.ts`.

### Volver

4. El componente detecta el regreso con `visibilitychange` — el mismo mecanismo
   que ya usa `banner-instalacion.tsx`.
5. Si hay un contacto `pendiente` de este asesor, aparece una hoja con:
   **Agendé una cita** · **Me contestó** · **No me contestó** · **No le interesa**
   · *Ahora no*.
6. Server action `resolverContacto(contactoId, resultado)`: escribe `resultado` y
   `resuelto_en`, y aplica el efecto sobre el lead:

| Botón | Etapa del lead | Efecto extra |
|---|---|---|
| Agendé una cita | `cita_agendada` | abre el formulario de visita |
| Me contestó | sin cambio (`contactado`) | sale de la lista de pendientes |
| No me contestó | sin cambio (`contactado`) | sube en la cola para reintento |
| No le interesa | `cerrado_perdido` | entra a reactivación de perdidos |
| Ahora no | sin cambio | sigue `pendiente`, sigue en la lista |

## Las dos guardas

**No mover hacia atrás.** Ya está resuelto y probado: `etapaTrasEvento()`
(`src/lib/leads/avance-etapa.ts`) es una función pura que solo empuja hacia
adelante y nunca toca leads cerrados ni etapas fuera del tablero. El avance por
WhatsApp **reutiliza esa función tal cual** — no se escribe una regla nueva.
`avanzarEtapaPorVisita()` se generaliza a `avanzarEtapaPorEvento()` y su tipo
`MotivoAvance` gana el valor `'whatsapp_enviado'`.

**No duplicar por manoteo.** Si ya existe un contacto `pendiente` de ese asesor
para ese lead, no se crea otro: se reutiliza. Tres toques en cinco minutos son un
contacto, no tres — de lo contrario la métrica de actividad premia al que más
teclea.

## La ventana ciega que este diseño cierra

Hoy la cola del día arma dos listas: **«Atiende ahora»** son los leads asignados
**sin ningún seguimiento**, y **«Necesitan seguimiento»** los que llevan **más de
24 h** desde el último. Al registrar un seguimiento, el lead sale de la primera y
todavía no califica para la segunda: **queda 24 horas invisible**.

Sin remedio, el automatismo empeoraría el problema que intenta resolver — un
toque accidental escondería un lead nuevo por un día. Por eso se agrega una
tercera lista, **«Esperando resultado»**, alimentada por el índice parcial. El
lead cambia de fila, nunca desaparece.

## Superficie de interfaz

- **Ficha del lead** (`/asesor/leads/[id]`): el botón de WhatsApp pasa a ser la
  acción instrumentada. La hoja de resultado se monta aquí.
- **Cola del día** (`/asesor`): sección «Esperando resultado» entre «Atiende
  ahora» y «Necesitan seguimiento».
- Estilo según la skill `fintech-muro-ui`; la hoja reutiliza el patrón de
  `sheet-seguimiento.tsx`.

## Pruebas

Unitarias (sin Supabase, como `avance-etapa`):
- `etapaTrasEvento('nuevo', 'contactado')` → `'contactado'`
- `etapaTrasEvento('negociacion', 'contactado')` → `null` (no retrocede)
- `etapaTrasEvento('cerrado_ganado', 'contactado')` → `null`
- dedupe: con un `pendiente` vigente, no se crea un segundo contacto

Integración (RLS, `vitest.integration.config.ts`):
- un asesor no lee ni resuelve contactos de leads ajenos
- `update` sobre columnas fuera de `(resultado, resuelto_en)` es rechazado
- el insert con `autor_id` forjado es rechazado

En navegador (obligatorio — ver memoria del proyecto):
- salir a WhatsApp desde la ficha y confirmar que el lead se mueve a
  «Contactado» y aparece en «Esperando resultado»
- volver a la app y confirmar que la hoja aparece sola
- posponer y confirmar que el lead sigue en la lista

## Fuera de alcance

- Integración con la API de WhatsApp (Cloud API, coexistencia, Embedded Signup).
- Plantillas de mensaje configurables y medición de cuál convierte mejor. Es
  valioso y ya está prometido en la landing pública, pero medir *qué mensaje
  funciona* solo importa cuando ya se mide bien *si hubo respuesta*.
- Recordatorio push al asesor con contactos pendientes. La infraestructura existe
  (Fase A) y es el siguiente paso natural, pero no entra aquí.

## Riesgos aceptados

**El asesor puede no volver.** Si cierra todo, `visibilitychange` no dispara y
nadie reporta nada. Es la razón por la que «Esperando resultado» es una lista
persistente y no solo una pregunta al vuelo: la pregunta se pierde, la lista no.

**`contactado` es una afirmación débil.** Significa «le escribí», no «hablamos».
Queda documentado en la etiqueta de la interfaz para que nadie lo lea como
contacto efectivo; el dato duro de si hubo respuesta lo da `resultado`.

**En escritorio el regreso es menos confiable.** Abrir WhatsApp Web en otra
pestaña dispara `visibilitychange`, pero el asesor puede quedarse trabajando en
esa pestaña indefinidamente. En móvil —que es donde ocurre el trabajo real— el
regreso desde la app de WhatsApp es fiable.
