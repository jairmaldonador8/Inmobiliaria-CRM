# Ronda 2 — Leads: inicio confiable, pipeline móvil, recordatorios, Klo y clasificación de corredores

Fecha: 2026-08-18 · Aprobado por Jair (mockup: `design-propuestas/ronda-2-lead-ui.html`)

## Contexto

Del feedback del equipo en el chat de Klo (tandas 2 y 3, ver `/admin/sugerencias`) y de los
pedidos directos de Jair. Los bugs reportados por Renata y Arturo comparten una raíz: **toda
asignación de lead inserta un seguimiento `tipo='sistema'`**, y las colas del inicio tratan
cualquier seguimiento como «ya fue atendido», así que un lead recién asignado desaparece de
«Atiende ahora» al instante (`src/app/(asesor)/asesor/page.tsx`, filtro sobre
`ultimoSeguimiento`; los insert de sistema están en `asignarLead`/`tomarLead` de
`src/lib/leads/acciones.ts` y en la asignación automática del sync,
`src/lib/easybroker/sync.ts`).

## Alcance

### A. Inicio del asesor confiable (bugs)

**Actividad real del asesor** = seguimientos con `tipo != 'sistema'` + contactos. Cambios:

- La query de seguimientos del inicio agrega `.neq('tipo', 'sistema')`; «Atiende ahora» vuelve
  a ser «asignado y sin actividad real» (se mantiene la exclusión de `saliente`).
- «Necesitan seguimiento» mide 24 h desde la última actividad real.
- El punto ámbar/rojo del pipeline (`puntoSeguimiento` en `kanban-leads.tsx`) usa el mismo
  criterio: la query de `ultimo_seguimiento` en `/asesor/leads` también excluye `sistema`.
- NO se toca el conteo de «cerrados ganados del mes» (ese sí depende de seguimientos de
  sistema con `NOTA_CIERRE`).

### B. Leads en el teléfono

- **Orden**: más nuevos arriba (`creado_en` desc) — decisión de Jair; se elimina el orden por
  urgencia de `ListaLeadsMovil`. Los puntos de alerta siguen marcando urgencia.
- **Secciones por etapa**: con el filtro «Todos», la lista se agrupa verticalmente por etapa
  (orden de `ETAPAS_KANBAN`) con encabezado de color, línea y conteo. Los chips siguen
  filtrando a una sola etapa.
- **Tarjetas con más contexto**: propiedad, fuente, clasificación (ya están) + próximo
  recordatorio pendiente (⏰ + fecha corta).
- **Cerrados**: misma tarjeta móvil que el resto y verificación explícita en viewport 390px
  (reclamo de Arturo).

### C. Home del asesor con más sustancia

- Tarjetas de las colas muestran además: propiedad de interés, badge de etapa y clasificación.
- Cola nueva **«Para hoy»** (ver E) arriba de «Atiende ahora».
- «Mis números del mes» clicables: Leads activos y Nuevos del mes → `/asesor/leads`;
  Cerrados ganados → `/asesor/leads?vista=cerrados`.

### D. Barrita de etapa con Klo (ficha del lead, asesor y admin)

- Componente `BarritaEtapa`: 5 segmentos (etapas del kanban), coloreados con el **semáforo de
  avance** (gris → amarillos → verde en negociación; variante B del mockup, elegida por Jair).
  `cerrado_ganado`: barra completa verde; `cerrado_perdido`: barra apagada.
- **Klo caminando encima**: el APNG `gallo-camina` (optimizado y copiado a `public/`) parado
  sobre la etapa actual. La burbuja «Klo-ser to your dreams» aparece unos segundos **al
  avanzar de etapa** (y «¡Klo-ser than ever!» al cerrar ganado). Con
  `prefers-reduced-motion`, Klo estático y sin transición.
- Va en la ficha del lead debajo del encabezado, en `/asesor/leads/[id]` y `/admin/leads/[id]`.

### E. Recordatorios de follow-up

- **Migración 0025**: tabla `recordatorios` — `id`, `lead_id` (fk), `asesor_id` (fk),
  `fecha_hora timestamptz`, `nota text`, `estado` (`pendiente`/`hecho`/`cancelado`),
  `notificado_en timestamptz` (null = push pendiente; idempotencia del cron), `creado_en`.
  Índice parcial por `estado='pendiente'` + `fecha_hora`. RLS: el asesor CRUD sobre los
  suyos; admin lee todos (mismas convenciones de grants por columna que 0002).
- **UI**: hoja «¿Cuándo le das el siguiente seguimiento a X?» que se abre sola tras registrar
  un contacto (desenlace WhatsApp/llamada) o un seguimiento manual, con opciones rápidas
  (hoy en la tarde, mañana 9:00, en 3 días, próxima semana, fecha libre), nota y toggle de
  push. Además, botón «Recordatorio» siempre visible en la ficha. Editable/cancelable.
- **Auto-resolución**: al registrar actividad real en el lead, sus recordatorios `pendiente`
  vencidos o del día se marcan `hecho` (el sistema no regaña por lo que ya hiciste).
- **Entrega**: job de pg_cron cada 5 min (patrón del cron de guardias) → endpoint
  `/api/cron/recordatorios` (CRON_SECRET) → `crearNotificacion` (campanita + push) al
  asesor por cada recordatorio `pendiente` con `fecha_hora <= now()` y `notificado_en is
  null`; marca `notificado_en`. El recordatorio queda `pendiente` (visible en rojo) hasta
  que haya actividad o se marque hecho.
- **Inicio**: cola «Para hoy» = recordatorios `pendiente` con `fecha_hora` hasta el fin del
  día de Monterrey; los vencidos, en rojo y primero.
- Los admins también los usan (ejercen de asesores); las consultas acotan por `asesor_id`
  explícito como el resto de la vista de asesor.

### F. Clasificación: corredores que llegan como cliente directo

- `mensajeSuenaACorredor(mensaje)` en `mapeo.ts`: función pura, insensible a mayúsculas y
  acentos, con patrones de habla de corredor («tengo (un) cliente», «para un/mi cliente»,
  «mi cliente busca/quiere», «cliente interesado», «soy asesor/agente/corredor/broker»,
  «comparto comisión», «co-broke»). Tests con frases reales.
- `clasificarContactRequest` recibe además el mensaje: si la propiedad es nuestra y (tag
  `agente` **o** el mensaje suena a corredor) → `co_broke`. Con tags no resueltos (null),
  el mensaje positivo basta para `co_broke`; si el mensaje no dispara, se queda `null` como
  hoy. El sync pasa `mensaje_original`.
- **Análisis de producción solo-lectura**: script que corre la heurística sobre los leads
  existentes con `mensaje_original` y reporta a Jair cuáles reclasificaría. NO escribe nada
  sin su visto bueno.

### G. «Reportar como corredor» con aprobación de admin

- **Migración 0026**: tabla `lead_reclasificaciones` — `id`, `lead_id`, `solicitante_id`,
  `motivo text null`, `estado` (`pendiente`/`aprobada`/`rechazada`), `resuelta_por`,
  `resuelta_en`, `creada_en`. Única una `pendiente` por lead (índice único parcial).
- **Asesor** (ficha, solo leads `cliente_directo` o sin clasificar): botón «Es un corredor,
  no cliente» + motivo opcional → inserta solicitud + `notificarAdmins` (campanita + push,
  liga a la ficha admin del lead).
- **Admin** (ficha admin del lead): banner de solicitud pendiente con Aprobar/Rechazar
  (server actions, service-role). Aprobar → `leads.clasificacion_eb = 'co_broke'` + evento
  en `lead_eventos` + notificación al solicitante. Rechazar → notificación al solicitante.
  El asesor nunca puede aplicárselo solo (riesgo señalado por Jair: llevarse un cliente
  directo como corredor).

### H. Ficha técnica y fotos por WhatsApp (pedido de Renata)

En el detalle de propiedad (asesor y admin): «Mandar ficha» — mensaje formal (tono cliente:
sin «te late»/«chance») con título, operación, precio, recámaras/baños/m² y `url_publica`,
vía Web Share o `wa.me`. «Mandar fotos» — Web Share API nivel 2 con las primeras fotos como
archivos; sin soporte del navegador, cae a compartir la liga.

### I. Filtro «mis captaciones» (pedido de Arturo)

En `/asesor/propiedades`: chip «Mías» que filtra por `propiedades.asesor_id = usuario`.

### J. Cierre de ronda

- Marcar `implementada` en la tabla `sugerencias` de prod lo que esta ronda resuelva.
- Pregunta de Arturo («¿mi captación se enlaza con EasyBroker?»): la contesta Jair; la
  respuesta correcta es que la carga a EasyBroker es manual tras aprobarse y el sync la trae.

## Fuera de alcance (diferido)

Fotos/screenshots en el chat de Klo, transcripción de conversaciones de WhatsApp (fase del
chatbot Klo), y la celebración visual «dopamina» (no funcional, decisión de Jair 2026-08-18).

## Testing y verificación

- Unit: heurística de corredor, orden/agrupado de la lista móvil (lógica pura extraída),
  reglas de «Para hoy» y de auto-resolución de recordatorios.
- Integración RLS: `recordatorios` y `lead_reclasificaciones` (patrón de los tests RLS
  existentes, contra DEV).
- Verificación en navegador (obligatoria en este repo): viewport 390px y escritorio, tema
  claro y oscuro, con el seed de DEV.
- Migraciones: primero DEV (`aplicar-migracion.mjs`), PROD al desplegar; el job nuevo de
  pg_cron se da de alta en ambos como `recordatorios-5min`.
