# Klo-Ser — Visión de producto y roadmap

> Documento de dirección, no de implementación. Sirve para que cualquier sesión
> de Claude Code entienda hacia dónde va el sistema antes de proponer cómo.
> Complementa a `CONTEXTO.md` (qué existe hoy) y `docs/decisiones.md` (bitácora).
> Redactado: 2026-08-05.

---

## 1. Qué estamos construyendo realmente

Klo-Ser no busca ser un CRM inmobiliario más. Ya existen muchos (EasyBroker,
Wasi, Inmobly) y todos tienen el mismo problema: los asesores no los usan
porque son más lentos que WhatsApp.

El problema real de Montana Realty no es que le falte un módulo. Es que la
información de la operación vive fragmentada: ideas en el pizarrón, otras en
las ventanas, conversaciones sueltas en el teléfono de cada asesor, y la
dirección sin precisión de qué está pasando. Cuando un asesor se va, se lleva
todo: sus contactos, quién visitó qué, qué cliente dijo que volvía en seis meses.

**Klo-Ser es la capa de verdad operativa de la inmobiliaria.** Su valor no está
en gestionar, está en que si se apaga, se pierde información que no existe en
ningún otro lado.

### El criterio de diseño que ordena todo

Un sistema se vuelve indispensable por tres razones, nunca por tener más
features:

1. Guarda algo que no existe en otro lado
2. Ahorra un trabajo que la gente odia hacer
3. Da poder frente a alguien más

Los CRMs genéricos solo intentan la primera y le cargan el costo de captura al
asesor. Klo-Ser tiene que atacar la 2 y la 3 para el asesor, y la 1 para la
dirección.

**Filtro para cada feature:** ¿esto le quita trabajo a alguien o se lo agrega?
Si se lo agrega, tiene que devolverle algo en la misma pantalla y en el mismo
momento. Si no, no lo van a usar y no importa qué tan bien esté construido.

---

## 2. Los dos productos que conviven

Hay que tenerlos separados conceptualmente aunque compartan base de datos.

**Producto A: el pipeline de leads.** EasyBroker entra, admin asigna, asesor
trabaja, se agenda cita, se cierra. Alta frecuencia, uso diario, móvil-first.
Es lo que ya está construido en su mayoría.

**Producto B: el sistema operativo de la empresa.** Iniciativas, dirección,
dashboard, coordinación. Baja frecuencia, uso semanal, lo usa el dueño y dos o
tres personas clave. Casi no existe todavía.

El riesgo es construir los dos en paralelo y terminar con un Notion mediocre
pegado a un CRM mediocre. Si B es nada más un gestor de tareas con gráficas
encima, no vale nada: para eso ya existe Notion y ya lo están ignorando.

### El pegamento (aquí está el producto de verdad)

Lo que hace que B no sea un task manager genérico es que **las iniciativas de
dirección se conecten a las métricas que A genera solo.**

La idea que hoy está en el pizarrón como "hay que conseguir más exclusivas en
Carrizalejo" deja de ser un post-it y se vuelve una iniciativa con dueño, fecha
y una métrica que el sistema ya mide (propiedades captadas en esa zona, leads
generados por ellas, citas agendadas). El dueño no reporta avance. El sistema
ya sabe.

Ningún CRM del mercado hace esto porque los CRMs miden transacciones y las
herramientas de gestión miden tareas, pero nadie amarra la decisión estratégica
con el dato operativo.

El vehículo que lo vuelve indispensable no es el dashboard, es **la junta
semanal**. Si el lunes el sistema le entrega al dueño la agenda armada (qué se
decidió la semana pasada, qué avanzó, qué leads se enfriaron, qué asesor no
contestó en 24 horas, qué iniciativa lleva tres semanas sin movimiento),
Montana no puede volver a operar sin eso.

---

## 3. El cimiento técnico del que depende todo

**Tabla append-only de eventos del lead.** Insert únicamente, sin update ni
delete, aplicado desde RLS y no desde la aplicación. Cada transición guarda:
lead, actor, estado anterior, estado nuevo, timestamp, metadata.

Esto convierte los "seguimientos inmutables" de una promesa del README a una
garantía a nivel de base de datos. El estado actual del lead pasa a ser una
vista derivada del último evento, no una columna que se pisa.

**Por qué es el paso 1 y no uno más:** sin timestamps limpios de cada
transición no hay tiempo de primera respuesta, no hay alerta de enfriamiento,
no hay ruteo, no hay escalamiento nocturno, no hay resumen matutino. Toda la
capa de inteligencia y automatización se construye encima de esta tabla. Si se
hace mal o tarde, hay que rearquitectar.

**Auditoría previa: HECHA (2026-08-05).** El campo se sobreescribe:
`cambiarEtapa` en `src/lib/leads/acciones-asesor.ts` hace `update({ etapa })`
sobre `leads.etapa`. Solo los cierres (ganado/perdido) insertan un seguimiento
tipo `sistema`, y es best-effort (si falla, no se revierte ni reintenta). Las
transiciones intermedias no dejan huella. Conclusión: es migración nueva; el
backfill solo puede recuperar cierres, el historial intermedio previo no existe.

**Nota de implementación (revisión técnica):** la garantía de inmutabilidad se
logra igual con `leads.etapa` como columna canónica + trigger de base de datos
que inserta el evento en cada UPDATE de etapa. Derivar el estado del último
evento (event sourcing puro) reescribe kanban, consultas y RLS sin ganancia —
evaluar el trigger primero.

### Multi-tenant desde ahora

La intención declarada es: Montana primero, luego vender la fórmula. Eso obliga
a meter `org_id` en todas las tablas y en las políticas RLS **antes de que haya
usuarios reales operando**.

Hoy son dos días de trabajo con los tests de integración RLS que ya existen. Con
el piloto corriendo y datos vivos son semanas y riesgo de fuga entre tenants.
Es la ventana más barata que va a existir.

Ojo: multi-tenant a nivel de datos, no features "genéricas" todavía. Montana
sigue siendo n=1 y generalizar de un solo caso produce abstracciones falsas.

---

## 4. Roadmap por bloques

### Bloque 0 · Seguridad (bloqueante, antes de cualquier feature)

Hay datos reales de Montana en una URL pública con credenciales de prueba
activas. Esto no espera.

- Rotar keys de Supabase, `EASYBROKER_API_KEY` y `CRON_SECRET` (este último se
  actualiza en Supabase Vault y en Vercel)
- Auditar el historial de git buscando credenciales commiteadas en cualquier punto
- Crear el usuario admin real (`administrador@montana-realty-co.com`), con la
  contraseña definida fuera del repo, en el dashboard de Supabase
- Desactivar los seeds `*@montana.test` una vez verificado el acceso real
- Limpiar los 3 leads demo del seed
- Gate de basic auth en `src/proxy.ts` mientras el sistema está en construcción,
  excluyendo `/api/cron/easybroker-sync` que ya tiene su propio Bearer

Nota: en plan Hobby, la protección nativa de Vercel no cubre el dominio de
producción, solo previews. Por eso el gate va en código.

### Bloque 1 · Cimiento de datos

- Migración de `org_id` multi-tenant en todas las tablas, JWT y políticas RLS
- Auditoría del modelo de estados actual
- Tabla append-only de eventos del lead
- Migrar kanban y captura rápida a que escriban eventos
- Backfill de los seguimientos ya capturados desde el cutover
- Métricas derivadas: tiempo de primera respuesta por asesor, tiempo por etapa,
  leads sin tocar
- Conectar el subdominio propio de Montana en Vercel

### Bloque 2 · Que el asesor quiera abrirlo

El asesor sigue contactando al cliente por su método tradicional. El sistema no
pelea contra eso, lo aprovecha.

- **Expediente del lead.** Al abrirlo ya trae: ficha de la propiedad, link
  directo a EasyBroker, historial de ese teléfono si ya preguntó antes por otra
  cosa, propiedades comparables de la zona con su precio de lista. Hoy eso le
  toma 15 minutos entre pestañas y chats. Es el feature que cambia la adopción.
- **Los 5 estados en un tap desde el móvil.** Contactado, agendado, visitó,
  ofertó, cerró o cayó. Tres segundos, sin escribir nada. No se necesita el
  texto de la conversación, se necesitan los timestamps.
- **Generación de ficha PDF con un clic.** El asesor selecciona propiedades y
  sale el PDF con la identidad de Montana. Ya existe el design system; el motor
  de PDF hay que elegirlo e integrarlo (no hay WeasyPrint en el repo — stack
  TypeScript; candidatos: Playwright/Chromium en Vercel o react-pdf). Ningún
  CRM del mercado hace esto. *(Corregido 2026-08-05: la versión original
  afirmaba un pipeline de WeasyPrint que no existe.)*
- **El histórico como respaldo, no como vigilancia.** Cuando la dirección
  pregunte por qué se cayó un lead, el asesor tiene el registro de que contestó
  en 4 minutos y el cliente nunca volvió. Este encuadre es lo que decide si el
  equipo adopta o sabotea el sistema.

### Bloque 3 · Que la dirección no pueda soltarlo

- **Alertas por excepción.** Lead sin primera respuesta en X horas. Propiedad
  sin actividad en 30 días. Cita de mañana sin confirmar. Cliente que dijo
  "vuelvo en enero" y ya es enero. El valor está en el futuro cercano, no en el
  reporte del mes pasado.
- **Ruteo y escalamiento automático.** Lead entra, se asigna por zona y carga
  actual, push al asesor. Si no lo toma en 30 minutos se reasigna. Si nadie en
  2 horas, le suena al dueño. El dueño solo se entera cuando el sistema falló.
  Pasa de vigilar a supervisar por excepción.
- **Resumen de las 8am.** Qué pasó mientras no estaba, qué necesita atención.
  La infraestructura ya está: pg_cron corriendo en Supabase.
- **Reasignación con contexto completo.** Un clic y se lleva todo el historial.
  Suena chico, es enorme: hoy implica una llamada y screenshots de WhatsApp.
- **Memoria institucional.** Cuando un asesor se va, la información se queda.
  Este es el argumento más fuerte con el dueño, más que cualquier dashboard.

### Bloque 4 · Después del piloto

No antes: la capa de dirección necesita que la operación esté generando datos.
Un dashboard estratégico que nace vacío le enseña al dueño que el sistema no
sirve.

- Capa de iniciativas amarrada a métricas que el sistema ya mide
- Agenda automática de junta semanal
- Integración de WhatsApp, cuando esté resuelta la política del número
- Borrador asistido de respuesta que el asesor manda con un tap

### Bloque 5 · Pulido

- Migrar al mockup Muro las pantallas pendientes: bandeja, asesores, plantillas,
  perfil, detalle de lead
- Regenerar screenshots de `design-propuestas/assets/shots/`
- Verificar disponibilidad de marca y dominio para "Klo-Ser" antes de que el
  nombre quede grabado en todo. "Closer" está saturado en software de ventas
- Onboarding y performance, cuando ya se sepa qué se usa de verdad

---

## 5. Sobre la automatización (petición explícita del dueño)

El dueño quiere poder activar el sistema en horarios en que no puede trabajar y
que todo siga: contestar leads, dar seguimiento, todo automatizado.

**Lo que no se debe hacer: automatizar el contacto comercial con el lead.**

- En este segmento (San Pedro, tickets de millones), un bot no comunica
  eficiencia, comunica que no eres serio. El diferencial de Montana es el trato.
- Riesgo legal: si el bot afirma metros, precio o disponibilidad y se equivoca,
  la responsabilidad es de Montana. Con fichas desactualizadas de EasyBroker eso
  pasa seguido.
- Riesgo de producto: si el bot contacta y el lead se enfría, se ensucia la
  métrica de responsabilidad que es justamente el core del sistema.

**Lo que sí resuelve el 90% del deseo real:**

El dueño no quiere que el sistema hable por él. Quiere no estar amarrado al
teléfono para que las cosas no se caigan. Eso se resuelve completo:

1. **Acuse inmediato honesto.** Lead entra a las 11pm, en 30 segundos recibe
   confirmación con la ficha de la propiedad y opción de agendar, firmado por
   Montana, sin fingir ser una persona. Gana tiempo de primera respuesta, que es
   la métrica que más correlaciona con cierre, sin robots.
2. **Ruteo y escalamiento** (ver bloque 3). Esto es lo que de verdad le devuelve
   la noche.
3. **Automatización administrativa completa.** Recordatorios de cita,
   actualización de estado cuando entra un contact request de una propiedad ya
   en pipeline, generación de fichas, agenda del lunes, despertar leads dormidos.
   Nada de esto requiere juicio y todo esto es lo que hoy nadie hace.
4. **Borrador asistido.** El sistema redacta con contexto completo, el asesor lo
   lee y lo manda con un tap. La IA hace el trabajo, el humano pone la firma y la
   responsabilidad. En este segmento ese es el techo correcto.

**Regla:** el sistema puede tomar todas las decisiones administrativas y ninguna
de las decisiones comerciales. El juicio es lo único que Montana vende.

---

## 6. Lo que explícitamente NO se construye todavía

- **Scoring de probabilidad de cierre con IA.** Requiere cientos de operaciones
  históricas y Montana tiene cero en el sistema (decisión de cutover: leads desde
  hoy, los 1,496 históricos no se importan). Un score inventado lo detecta el
  asesor en una semana y quema la credibilidad de todo lo demás.
- **Chatbot que conversa con el cliente.** Ver sección 5.
- **Features genéricas para "cualquier inmobiliaria".** Multi-tenant a nivel de
  datos sí, generalización de producto no. Montana es n=1.
- **Módulos nuevos antes de que los existentes tengan uso diario real.**

La inteligencia viene en la v2, cuando el dataset acumulado sea algo que nadie
más tiene de Montana: qué asesor cierra qué tipo de producto, qué precio real
mueve el mercado contra el precio de lista, qué portal manda leads que cierran
contra los que solo hacen ruido.

---

## 7. Preguntas abiertas

Vale la pena resolverlas antes de que el código las decida por default.

1. **Política del número de WhatsApp.** La API de WhatsApp Business requiere
   número de la empresa. Si cada asesor usa el suyo, no se captura nada. Pedir
   centralizar es políticamente pesado porque el asesor siente que pierde a "su"
   cliente. Sin resolver esto, la integración de WhatsApp no puede diseñarse.
2. **Para quién se optimiza la adopción en la v1.** Si es para los asesores, el
   sistema debe ser casi invisible. Si es para la dirección, puede pedir más pero
   necesita que alguien arriba lo imponga. Las dos al mismo tiempo no se puede.
3. **Qué pasa con un lead cuando el asesor sale de Montana.** Define reglas de
   reasignación masiva y de retención de datos.
4. **Nombre y marca.** Verificación de disponibilidad pendiente.

---

## 8. Cómo usar este documento

Este archivo describe el destino. `CONTEXTO.md` describe el estado actual.
`docs/decisiones.md` registra el camino recorrido.

Antes de proponer una implementación, verificar contra la sección 1 (criterio de
diseño), la sección 6 (lo que no se construye) y el orden de los bloques. Si una
propuesta salta de bloque, debe justificarse explícitamente.
