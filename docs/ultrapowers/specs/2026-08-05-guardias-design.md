# Guardias con asignación automática y escalamiento — Diseño

> Spec aprobado en brainstorming el 2026-08-05. Complementa `docs/VISION-PRODUCTO.md`
> (este proyecto materializa el ruteo/escalamiento del Bloque 3 usando el sistema
> de guardias real de Montana como fuente de asignación).

## Problema

Montana ya opera con un rol mensual de guardias (un asesor por turno, mañana y
tarde) pero vive fuera del sistema. Los leads de EasyBroker caen a la bandeja y
esperan a que un admin los asigne a mano — de madrugada o en fin de semana nadie
decide y el lead se enfría. El dueño quiere: cargar las guardias del mes una vez
y que la asignación, los recordatorios y el escalamiento corran solos.

## Decisiones tomadas con el usuario

1. **Estructura de guardia:** un asesor por turno; dos turnos por día (mañana y
   tarde). La cobertura del día termina a **medianoche (00:00)**.
2. **Fuera de guardia** (00:00 → apertura del primer turno, o hueco sin rol): el
   lead se asigna al asesor de la **siguiente** guardia programada y se avisa al
   dueño. Su cronómetro de escalamiento empieza al **inicio de su turno**, no a
   la hora en que entró el lead.
3. **«Contestado» = marcar «Contactado»** (etapa ≠ `nuevo`) **o** registrar un
   seguimiento **manual** (`tipo ≠ 'sistema'`) posterior a la asignación. Ojo:
   la asignación misma crea un seguimiento `tipo = 'sistema'` (patrón de
   `asignarLead`), por eso los seguimientos de sistema NO cuentan como
   respuesta. Cualquiera de las dos señales detiene el escalamiento y alimenta
   la métrica de primera respuesta.
4. **Escalamiento:** push inmediato al de guardia → a los **15 min** push
   recordatorio → a los **30 min** push a **todos** los asesores con «Tomar
   lead» (el primero que lo toma se lo queda) → a las **2 h** correo + push al
   dueño. Tiempos editables en configuración.
5. **Regla VIP:** leads de propiedades **exclusivas** (marca manual del admin) o
   con **precio ≥ umbral configurable** se asignan directo al **dueño**, quien
   decide si se lo queda o lo manda a la guardia. Los VIP no entran al
   escalamiento abierto; solo recordatorio al dueño a los 15 min.
6. **La marca «exclusiva» es invisible para asesores** — garantizado a nivel de
   base de datos, no solo de UI.
7. **Captura del rol:** calendario clicable en el admin, con «copiar semana
   anterior». Sin importación de archivos en v1.
8. **Canal de notificaciones:** push PWA en el teléfono (todos usarán la webapp
   instalada; es parte del onboarding) + campanita in-app. Correo solo para el
   escalamiento final al dueño.

## Arquitectura: dos fases de un proyecto

### Fase A — Infraestructura Push PWA (prerequisito reutilizable)

- Manifest + service worker + llaves VAPID (Web Push estándar, sin costo por
  mensaje). Seguir el skill del proyecto `pwa-web-push`.
- Tabla `push_suscripciones`: usuario, endpoint, llaves p256dh/auth, user-agent,
  creada_en. Un usuario puede tener varios dispositivos. RLS: cada quien sus
  filas. **(Corrección 2026-08-05: la tabla YA existe desde 0001 con RLS y
  policies select/insert/delete en 0002 — solo falta la policy de UPDATE para
  el upsert de re-sync; eso es lo único que agrega la migración 0007.)**
- Helper de servidor `enviarPush(destinatarioId, {titulo, cuerpo, url})` con
  limpieza de suscripciones muertas (410 Gone). Es la primitiva que después
  usarán el resumen de las 8am y las alertas de citas.
- UX de activación: banner de instalación, solicitud de permiso, e instrucciones
  específicas de iPhone (requiere «Agregar a pantalla de inicio»). Aviso al
  admin cuando un asesor activo no tiene push habilitado.

### Fase B — Guardias, asignación y escalamiento

#### Modelo de datos (migración 0007)

| Objeto | Contenido | RLS |
|---|---|---|
| `guardias` | fecha (date), turno (`manana`\|`tarde`), hora_inicio, hora_fin, asesor_id → usuarios. UNIQUE(fecha, turno) | SELECT todos los autenticados; escritura solo admin |
| `configuracion` | key-value del org: `umbral_vip_mxn`, `dueno_user_id`, horarios default de turnos, `escalamiento_min` (15/30/120) | solo admin (el sync lee con service role) |
| `propiedades_internas` | propiedad_id (PK/FK), `exclusiva` boolean; espacio para futuras notas privadas de dirección | **solo admin** — el asesor no puede leerla ni saber que existe |
| `lead_escalamientos` | lead_id, paso (`recordatorio_15`\|`abierto_30`\|`dueno_120`\|`recordatorio_vip`), ejecutado_en. UNIQUE(lead_id, paso) | solo sistema/admin (el asesor nunca la lee directo; ver nota de «Tomar lead») |
| Columna `leads.escalamiento_desde` | timestamptz que fija el resolutor al asignar: `now()` en horario de guardia, `hora_inicio` de la guardia destino si el lead entró fuera de horario (aplica igual a VIP), NULL si quedó en bandeja. Es un snapshot: ediciones posteriores del rol NO lo mueven | misma RLS de `leads` |

Nota: NO se agrega columna a `propiedades` — admin y asesor comparten el rol
`authenticated` y RLS es por fila, así que la única forma de ocultar la marca a
nivel de datos es una tabla aparte.

#### Resolutor de asignación (dentro del sync, al insertar lead nuevo)

Orden de evaluación:

1. **VIP** (exclusiva en `propiedades_internas` O `precio ≥ umbral_vip_mxn`) →
   `asesor_id = dueno_user_id`, push «Lead VIP — decide quién lo atiende».
2. **Guardia activa ahora** (fecha + turno cuya ventana horaria cubre `now()` en
   zona de Monterrey) → asignar a ese asesor + push con datos del lead.
3. **Fuera de horario** → asignar al asesor de la siguiente guardia futura más
   próxima + push de aviso al dueño. El resolutor fija
   `leads.escalamiento_desde = hora_inicio` de esa guardia (snapshot; si el
   admin luego edita el rol, el reloj ya asignado no cambia).
4. **Sin rol cargado** (no hay guardia futura) → bandeja (`asesor_id = null`)
   como hoy + notificación al admin «no hay guardias programadas».

Los leads asignados **manualmente desde la bandeja** (vía `asignarLead`) NO
entran al escalamiento: `escalamiento_desde` queda NULL a propósito — un humano
ya intervino y ese flujo conserva su comportamiento actual.

La asignación reutiliza el patrón existente de `asignarLead`: seguimiento de
sistema + notificación in-app, y el candado optimista (`.is('asesor_id', null)`)
para no pisar asignaciones concurrentes. Si el resolutor falla por cualquier
razón, el lead cae a bandeja — **el sync jamás pierde un lead por las guardias**.

#### Motor de escalamiento

- pg_cron **cada 5 minutos** → GET `/api/cron/escalamiento` con Bearer (mismo
  patrón que `easybroker-sync-15min`; secret propio en Vault). Precisión
  aceptada: ±5 min.
- Query base: leads con `etapa = 'nuevo'`, `asesor_id` no nulo, no archivados,
  `escalamiento_desde` no nulo y **sin seguimiento manual** (`tipo ≠ 'sistema'`)
  posterior a `asignado_en`. Edad = `now() - escalamiento_desde` (la columna ya
  trae el reloj diferido resuelto; no se recalcula contra `guardias`).
- Pasos según edad, cada uno idempotente vía INSERT en `lead_escalamientos`
  (UNIQUE evita dobles aunque el cron se traslape):
  - ≥15 min → push recordatorio al asesor asignado (a dueño si es VIP; los VIP
    no ejecutan los pasos siguientes).
  - ≥30 min → push a todos los asesores activos con acción «Tomar lead»; la
    acción reasigna con compare-and-swap sobre el asesor vigente
    (`.eq('asesor_id', asesorOriginal)` — NO el candado `.is('asesor_id', null)`
    de bandeja, porque aquí el lead SÍ tiene asesor): el primero gana, los
    demás ven «ya fue tomado». La elegibilidad del botón se consulta vía server
    action (patrón existente del repo), nunca leyendo `lead_escalamientos`
    desde el cliente.
  - ≥120 min → correo + push al dueño.
- Marcar «Contactado» (etapa ≠ nuevo) o un seguimiento manual sacan al lead de
  la query y detienen todo.
- VIP: el recordatorio de 15 min usa el mismo `escalamiento_desde` diferido —
  un VIP que entra a las 3am NO despierta al dueño a las 3:15; su recordatorio
  corre desde la apertura del siguiente turno (el push de entrada sí es
  inmediato).
- **Correo:** requiere proveedor transaccional nuevo (no existe envío de correo
  propio hoy). Candidato: Resend. Decisión final en fase de investigación,
  vía marketplace de Vercel.

#### Pantallas

- **Admin → Guardias**: calendario del mes; tap en día → asignar asesor a cada
  turno; «copiar semana anterior»; huecos sin cubrir en rojo; navegación entre
  meses. Sección de configuración: horarios default, umbral VIP, tiempos de
  escalamiento.
- **Admin → Propiedad**: toggle «Exclusiva» (lee/escribe `propiedades_internas`).
- **Asesor**: banner en la cola del día («Estás de guardia hoy 14:00–00:00»),
  rol del mes en solo-lectura, y las push abren el lead directo (deep-link).
- **Acción «Tomar lead»**: pantalla del lead con botón visible solo cuando el
  lead está en escalamiento abierto.

#### Manejo de errores

- Resolutor de guardia falla → bandeja + alerta admin (nunca bloquea el sync).
- Asesor sin suscripción push → campanita + marca visible para el admin.
- Suscripciones push muertas → se limpian al recibir 410/404 del push service.
- Cron de escalamiento caído → al volver, procesa por edad acumulada (los pasos
  son por umbral, no por tick exacto) sin duplicar gracias a UNIQUE.

#### Pruebas

- **Unitarias** del resolutor: guardia activa, frontera de medianoche, hueco
  entre turnos, domingo sin rol, mes sin capturar, VIP por exclusiva, VIP por
  umbral, empate exclusiva+umbral.
- **Unitarias** del escalador con reloj simulado: cada umbral dispara una sola
  vez, VIP solo recordatorio, contactado detiene, reloj diferido para leads
  nocturnos, y seguimiento manual registrado ANTES de que abra el turno
  (lead nocturno ya contestado → no escala), lead asignado a mano desde
  bandeja → nunca escala.
- **Integración RLS** (patrón existente del repo): asesor NO lee
  `propiedades_internas` ni `configuracion`, NO escribe `guardias`; admin sí;
  «Tomar lead» concurrente: solo uno gana.
- **Integración** del endpoint de cron: 401 sin Bearer, 200 con Bearer.

## Fuera de alcance (YAGNI)

- Importación de Excel/CSV del rol.
- Reparto entre múltiples asesores en un mismo turno (hoy es uno por turno).
- Intercambio de guardias entre asesores desde la app (v2 si lo piden).
- WhatsApp como canal de notificación (política del número sin resolver).
- Ruteo por zona/carga (necesita Perfil de asesor 2.0; las guardias lo
  sustituyen por ahora).

## Dependencias y orden

1. Fase A (push) no depende de nada y desbloquea la B. Se planifica y ejecuta
   como **plan propio** (subsistema autocontenido y reutilizable); la Fase B
   tendrá el suyo.
2. La Fase B toca el sync de EasyBroker — coordinar con el Bloque 0/1 del
   documento de visión (si la tabla de eventos entra antes, el escalador usa
   sus timestamps; si no, funciona con `asignado_en` + etapa actual).
3. Proveedor de correo se decide en investigación (solo lo usa el paso de 2 h).
