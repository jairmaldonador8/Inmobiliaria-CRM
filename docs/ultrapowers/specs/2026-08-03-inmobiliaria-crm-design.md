# Montana Realty — CRM Inmobiliario (Inmobiliaria-CRM)

**Fecha:** 2026-08-03
**Estado:** Aprobado por el usuario (brainstorming completo)
**Idioma del producto:** Español (México)
**Repo de referencia:** [TOP-DIGITAL-SYSTEM](https://github.com/jairmaldonador8/TOP-DIGITAL-SYSTEM) — se usa como base de patrones (stack, RLS, chat, notificaciones, PWA). Ese repo **no se modifica**; todo el código nuevo vive en este repo.

## 1. Resumen

Webapp CRM para la inmobiliaria **Montana Realty** (cliente de Top Digital). Un solo sitio con dos experiencias según rol:

- **Panel del admin** (`/admin`): dueño/administradores de Montana gestionan asesores, asignan leads, ven el inventario de propiedades sincronizado desde EasyBroker, registran operaciones/comisiones y monitorean todo desde un dashboard completo (actividad, pipeline, negocio, inventario).
- **Panel del asesor** (`/asesor`): cada asesor accede **solo a sus** leads, calendario de visitas, comisiones y chat. Mobile-first: el asesor trabaja desde el celular.

**Distribución:** webapp accesible por navegador, instalable como **PWA** ("Agregar a pantalla de inicio" con ícono de Montana). Se despliega en Vercel; inicialmente en URL `*.vercel.app`, después se conecta un subdominio del dominio de Montana (el sitio público de la inmobiliaria no se toca).

**Ambición:** una versión revolucionaria de CRM para el sector inmobiliario — la fase de research definirá qué capacidades del estado del arte se incorporan para diferenciarlo.

## 2. Decisiones tomadas durante brainstorming

| Tema | Decisión |
|---|---|
| Tamaño del equipo | Chico: 2–10 asesores + 1–2 administradores |
| Operaciones | Venta y renta |
| Portales | EasyBroker como hub principal (sindica a Inmuebles24, Vivanuncios, Trovit, Clasco); también Lamudi |
| Seguimiento de propiedades | **Integración automática con la API de EasyBroker** (opción A) |
| Entrada de leads | **Automática desde EasyBroker + captura manual** por asesores/admins (opción A) |
| Asignación de leads | **Manual por el admin** desde una bandeja central (opción A), con reasignación libre |
| Pipeline | Nuevo → Contactado → Cita agendada → Visita realizada → Negociación/Oferta → Apartado → Cerrado ganado / Cerrado perdido |
| Comisiones | **Completo**: monto de cierre, % comisión de agencia, reparto asesor/Montana |
| Dashboard admin | Muy completo: actividad de asesores + pipeline global + números del negocio + estado del inventario |
| Extras v1 | Calendario de visitas + notificaciones internas + chat interno (todo lo anterior) |
| Inteligencia sin costo | Matching lead↔inventario, lead scoring por reglas, inteligencia de inventario, módulo de feedback interno, plantillas de WhatsApp — todo con lógica sobre datos propios, sin servicios de paga (sección 8) |
| Asistente IA | Diferido a fase post-v1 (requiere API de LLM, costo ~centavos por uso) |
| Arquitectura | Opción 1: stack probado de Top Digital (Next.js App Router + Supabase + Vercel), multi-tenancy **preparado pero no implementado** |
| Dominio | Sin subdominio por ahora; se conecta después |
| Workflow | Auto-commit ON, auto-push ON, commit de design docs ON |

## 3. Arquitectura

- **Frontend/backend:** una sola aplicación Next.js (App Router) en Vercel. Rutas `/admin/*` y `/asesor/*`. Login único en `/`; tras autenticarse, redirección según rol. Responsivo, mobile-first para el asesor.
- **PWA:** manifest (`manifest.ts`, patrón del repo de referencia) con nombre, colores e ícono de Montana para instalarse en la pantalla de inicio del teléfono.
- **Supabase:**
  - **PostgreSQL + RLS:** cada asesor solo lee/escribe sus propias filas (leads, visitas, operaciones, mensajes); los admins ven todo. Garantizado a nivel base de datos, no solo en UI.
  - **Auth:** email + contraseña. Sin registro público: el admin da de alta a los asesores. Recuperación de contraseña estándar.
  - **Realtime:** chat y notificaciones en vivo.
  - **Storage:** fotos de perfil y archivos que no vengan de EasyBroker (las fotos de propiedades se sirven desde las URLs de EasyBroker).
- **Cron de Vercel:** sincronización con EasyBroker cada 15 minutos (ver sección 6).
- **Multi-tenancy preparado, no implementado:** tabla `agencias` con Montana como única fila; las tablas de negocio llevan `agencia_id` desde el día 1. Si Top Digital vende el sistema a otras inmobiliarias, no hay migración dolorosa. En v1 no hay UI ni lógica multi-agencia.
- **Secretos:** API key de EasyBroker en variables de entorno de Vercel; jamás llega al navegador.

## 4. Modelo de datos (12 tablas)

1. **agencias** — nombre, logo, configuración (% comisión default, reparto default, umbral de lead sin atender, umbral de propiedad estancada). Montana única fila en v1.
2. **usuarios** — vinculado a Supabase Auth: rol (`admin` | `asesor`), `agencia_id`, nombre, teléfono, foto, activo.
3. **propiedades** — `easybroker_id` (único), `agencia_id`, título, tipo (casa/departamento/terreno/local/oficina), operación (venta/renta), precio, moneda, ubicación (colonia, ciudad), **superficie en m² (construcción y/o terreno, según lo exponga la API de EasyBroker — validar en research)**, estatus (publicada/pausada/vendida/rentada), asesor responsable (`usuario_id`, asignado en nuestro sistema), URLs de fotos, fecha de alta, `ultima_sync`.
4. **propiedad_portales** — `propiedad_id`, portal (Inmuebles24, Lamudi, Vivanuncios, Trovit, Clasco, sitio propio…), URL pública, estado de publicación. Se actualiza en cada sync.
5. **leads** — `agencia_id`, nombre, teléfono, email opcional, fuente (portal vía EasyBroker / WhatsApp / referido / redes / walk-in), `propiedad_id` de interés opcional, `asesor_id` (null = bandeja del admin), etapa (embudo de la sección 2), tipo de interés (compra/renta), presupuesto aproximado opcional, **zona de interés opcional (se prellena con la zona de la propiedad de interés cuando existe; editable por el asesor)**, notas, `easybroker_id` opcional (para dedup), timestamps de creación y asignación.
6. **seguimientos** — `lead_id`, autor, tipo (llamada/WhatsApp/correo/visita/otro), **`propiedad_id` opcional (a qué propiedad se refiere el seguimiento — lo usa el matching para marcar "ya mostrada" y el dedup de EasyBroker para registrar "preguntó por otra propiedad")**, nota, timestamp. **Inmutable** (sin update/delete): evidencia de quién trabaja sus leads.
7. **visitas** — `lead_id`, `propiedad_id`, `asesor_id`, fecha/hora, estado (agendada/realizada/cancelada), nota de resultado.
8. **operaciones** — `lead_id`, `propiedad_id`, `asesor_id`, tipo (venta/renta), monto, % comisión de agencia, monto de comisión total, % reparto del asesor, comisión del asesor, comisión de Montana, fecha de cierre, registrada/aprobada por (`usuario_id` admin).
9. **notificaciones** — destinatario (`usuario_id`), tipo, texto, leída/no leída, timestamp.
10. **mensajes** — chat: un hilo por asesor (asesor ↔ admins), autor, texto, timestamp, leído.
11. **sugerencias** — feedback interno: autor, pantalla donde estaba (capturada automáticamente), texto, estado (nueva/revisada/implementada), timestamp.
12. **plantillas_mensajes** — plantillas de WhatsApp: nombre, texto con variables (`{nombre}`, `{propiedad}`, `{zona}`, `{precio}`, `{asesor}`), activa. CRUD por admins; uso por todos.

## 5. Pantallas

### Panel del asesor (`/asesor`) — mobile-first

1. **Inicio** — resumen del día: visitas de hoy, leads nuevos asignados, leads que requieren seguimiento, números del mes (cierres, comisiones).
2. **Mis Leads** — kanban por etapa (deslizable en celular); botón prominente **"+ Registrar lead"** (nombre, teléfono, fuente, propiedad opcional — captura en segundos); detalle de lead con historial de seguimientos, botones directos de **llamar / WhatsApp**, y agendar visita.
3. **Mi Calendario** — visitas por día/semana; marcar realizada/cancelada con nota de resultado.
4. **Mis Comisiones** — operaciones cerradas del mes/año, comisión acumulada del asesor.
5. **Propiedades** — inventario completo de Montana para consultar frente al cliente (precio, fotos, disponibilidad); distingue las propiedades a su cargo.
6. **Chat** — conversación en tiempo real con los admins.
7. **Notificaciones** — campanita con historial.

### Panel del admin (`/admin`)

1. **Dashboard** — 4 bloques:
   - *Actividad:* semáforo por asesor (leads sin atender >24h, seguimientos registrados en la semana).
   - *Pipeline:* leads por etapa, visitas de la semana, negociaciones y apartados abiertos.
   - *Negocio:* cierres y comisiones del mes, utilidad de Montana, ranking de asesores, tendencia mensual.
   - *Inventario:* propiedades activas por operación, presencia por portal, propiedades estancadas (sin leads en X días).
2. **Bandeja de leads** — leads sin asignar (EasyBroker + capturas manuales); asignar/reasignar a asesor en un clic.
3. **Leads global** — todos los leads, filtros por asesor/etapa/fuente/propiedad.
4. **Propiedades** — inventario sincronizado con estado por portal; asignar asesor responsable; indicador "última sincronización: hace X min"; botón **"Sincronizar ahora"**.
5. **Asesores** — alta/baja (soft delete), perfil con métricas individuales: leads atendidos, tasa de cierre, comisiones, tiempo de primera respuesta.
6. **Operaciones** — registrar/aprobar cierres con montos y comisiones.
7. **Calendario global** — todas las visitas de todos los asesores.
8. **Chats** — inbox con hilos de todos los asesores y badge de no leídos.
9. **Sugerencias** — panel de feedback interno: lista de sugerencias con autor, pantalla de origen y estado (nueva/revisada/implementada).
10. **Ajustes** — % comisión default, reparto default, umbral de lead sin atender, umbral de propiedad estancada, y CRUD de plantillas de WhatsApp.

## 6. Integración con EasyBroker

- **Fuente de verdad dividida:** EasyBroker es la fuente de verdad del **inventario** (ahí Montana publica y sindica a portales); nuestro sistema es la fuente de verdad del **seguimiento comercial** (leads, etapas, visitas, cierres, comisiones).
- **Solo lectura:** no se escribe de regreso a EasyBroker. El flujo actual de Montana en EasyBroker no cambia.
- **Cron cada 15 min** (Vercel Cron) con dos pasos:
  1. **Propiedades** (`GET /properties` de la API pública de EasyBroker): upsert por `easybroker_id` — cambios de precio, estatus y fotos se reflejan; se actualiza `propiedad_portales` con dónde está publicada cada una.
  2. **Leads** (`GET /contact_requests`): cada contacto nuevo cae a la **bandeja del admin** con propiedad de interés y fuente, y dispara notificación a admins.
- **Deduplicación de leads:** si el teléfono/email ya existe como lead, no se crea duplicado; se agrega la nueva consulta como seguimiento automático al lead existente y se notifica a su asesor ("tu lead preguntó por otra propiedad").
- **Botón "Sincronizar ahora"** en el panel admin.
- **Degradación con gracia:** si la API de EasyBroker falla, el sistema opera con los últimos datos sincronizados; el error queda registrado y el admin ve un aviso discreto de "sincronización pendiente". Captura manual y todo el CRM funcionan sin EasyBroker.
- La fase de research validará endpoints exactos, paginación, rate limits y campos disponibles de la API de EasyBroker. En particular: (a) si el estado de publicación en **Lamudi** llega vía EasyBroker — si no, ese portal se marca manualmente en `propiedad_portales`; (b) el plan de Vercel disponible — el cron de 15 min requiere plan de paga; en plan Hobby la cadencia se ajusta (p. ej. sync diaria + botón "Sincronizar ahora" como camino principal).

## 7. Reglas de negocio

- **Lead sin atender:** lead asignado sin ningún seguimiento tras **24 horas** (umbral configurable). Alimenta la alerta del asesor y el semáforo del admin.
- **Semáforo por asesor:** 🟢 al día / 🟡 tiene leads por atender (>24h) / 🔴 leads abandonados (>48h) — siempre con las señales explicadas, no solo el color.
- **Escalamiento:** lead sin atender > umbral (default 24h) notifica al asesor; al doble del umbral (2×, default 48h) notifica también a admins. Se configura un solo umbral; el nivel de escalamiento se deriva (2×).
- **Comisiones:** al registrar una operación se aplican el % de comisión de agencia y el reparto asesor/Montana default (configurables en Ajustes), editables por operación. **Registrar = aprobar** (un solo paso, siempre hecho por un admin); no existe un estado de aprobación separado. El asesor ve sus operaciones ya registradas.
- **Propiedad estancada:** activa con más de X días (default 30) sin generar leads → destacada en el bloque de inventario del dashboard.
- **Notificaciones automáticas:** lead nuevo en bandeja (admins), lead asignado (asesor), lead sin atender (asesor → escala a admins), recordatorio matutino de visitas del día (asesor), operación registrada (asesor), mensaje de chat nuevo (destinatario).
- **Métricas:** tasa de cierre = ganados ÷ (ganados + perdidos); comisión de Montana = comisión total − comisión del asesor; ranking de asesores por comisiones del mes; tiempo de primera respuesta = asignación → primer seguimiento.
- **Nada se borra:** asesores se desactivan (sus leads regresan a la bandeja; sus visitas agendadas se cancelan con notificación a admins; sus propiedades quedan sin responsable, listas para reasignar), leads perdidos se archivan, seguimientos son inmutables, propiedades removidas de EasyBroker se marcan inactivas (no se eliminan).

## 8. Inteligencia integrada (v1, sin costo externo)

Cinco capacidades que elevan la experiencia usando únicamente lógica sobre los datos propios del sistema — sin servicios de paga:

1. **Matching lead ↔ inventario** — en el detalle de cada lead, el sistema cruza tipo de interés (compra/renta), presupuesto (±15%) y zona de interés del lead contra el inventario activo y muestra "propiedades que le quedan", marcando cuáles ya se le mostraron (según visitas y seguimientos con `propiedad_id`). Notifica al asesor cuando una propiedad nueva sincronizada hace match con alguno de sus leads activos.
2. **Lead scoring por reglas** — puntaje de "calor" explicable: presupuesto definido (+), fuente portal (+), visita agendada (++), interés repetido — el lead volvió a preguntar por otra propiedad vía EasyBroker (+), días sin contacto (−). Todas las señales salen de datos que el sistema sí captura. El kanban del asesor ordena cada columna por score y muestra badge 🔥 en los calientes. Siempre con el desglose visible de por qué.
3. **Inteligencia de inventario** — además de "estancada", el *por qué*: precio por m² comparado contra propiedades similares del propio inventario (mismo tipo/operación/zona) que sí generan leads, y leads generados por portal por propiedad. Vive en el bloque de inventario del dashboard admin y en el detalle de propiedad.
4. **Módulo de feedback interno** — botón "💡 Sugerencia" visible en toda la app; captura automáticamente la pantalla, el usuario escribe su idea/problema. Panel en `/admin` para revisar sugerencias y marcarlas (nueva/revisada/implementada). Diseñado para el piloto interno: los asesores detectan áreas de mejora y alimentan la fase 2.
5. **Plantillas de WhatsApp** — plantillas con variables que se rellenan con los datos del lead/propiedad y abren WhatsApp (`wa.me`) con el texto listo para enviar. Los admins gestionan las plantillas; los asesores las usan desde el detalle del lead con un toque.

**Asistente IA (futuro, post-v1):** resumen del lead antes de llamar, sugerencia de siguiente paso y borradores personalizados de mensajes vía API de LLM (modelo económico; costo estimado en centavos por uso). Queda explícitamente fuera de v1.

## 9. Manejo de errores

- Validación de formularios con mensajes en español.
- Chat/notificaciones: reconexión automática de Realtime; los mensajes persisten en la base de datos.
- Sync de EasyBroker: degradación con gracia (sección 6), reintentos y registro de errores.
- Estados vacíos y de carga diseñados (primer uso sin datos, bandeja vacía, sin visitas hoy).
- Sin acciones destructivas irreversibles (sección 7, "nada se borra").

## 10. Testing

- **Crítico — RLS:** pruebas de integración que garanticen que un asesor jamás lee/escribe leads, visitas, operaciones, comisiones o chats de otro asesor, y que el rol asesor no accede a datos administrativos. (Mismo patrón `test:rls` del repo de referencia.)
- Pruebas unitarias de cálculos: comisiones y repartos, semáforo, métricas del dashboard, detección de lead sin atender y propiedad estancada, lead scoring, reglas de matching lead↔inventario y comparación de precio por m².
- Pruebas del mapeo/dedup de datos de EasyBroker (fixtures con respuestas simuladas de la API).
- Prueba de flujo principal: lead entra (sync o manual) → bandeja → asignación → seguimientos → visita → operación cerrada → se refleja en dashboard y comisiones.

## 11. Fases de entrega

Cada fase termina en algo usable y desplegado en Vercel (URL `*.vercel.app` hasta que se conecte el subdominio).

1. **Fase 1 — El corazón:** login con roles y redirección, alta de asesores, CRM de leads completo (bandeja, asignación, kanban, captura rápida, seguimientos), sync de propiedades y leads desde EasyBroker, **módulo de feedback interno** y **plantillas de WhatsApp** (listos desde el día uno del piloto). La tabla y el mecanismo de `notificaciones` existen desde esta fase (las genera el sync y la asignación de leads).
2. **Fase 2 — Control e inteligencia:** dashboard completo del admin (4 bloques), calendario de visitas, operaciones y comisiones, **matching lead↔inventario**, **lead scoring** e **inteligencia de inventario**.
3. **Fase 3 — Comunicación:** chat interno en tiempo real, UI completa de notificaciones (campanita con historial y tiempo real), PWA instalable, ajustes y pulido visual. En fases 1–2 las notificaciones se acumulan en la base y se muestran en una lista simple; aquí se pulen.

**Post-v1 (backlog):** asistente IA, integración WhatsApp API, Meta Lead Ads, multi-tenancy activo.
