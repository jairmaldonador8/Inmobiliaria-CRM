# Salida instrumentada a WhatsApp — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al sacar un lead a WhatsApp el sistema registre el contacto, mueva el lead a «Contactado» y, al volver el asesor, le pida el desenlace con un toque — sin que ningún lead quede invisible.

**Architecture:** Una tabla nueva `contactos_whatsapp` con el patrón «identidad inmutable + desenlace mutable» de `visitas`, dos Server Actions (`registrarSalidaWhatsapp`, `resolverContacto`), y una tercera lista en la cola del día derivada en JS del mismo arreglo de leads que ya se consulta. La regla de avance de etapa se reutiliza sin modificar su lógica.

**Tech Stack:** Next 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), Tailwind v4, Vitest.

**Spec:** `docs/ultrapowers/specs/2026-08-07-salida-whatsapp-design.md` — léelo antes de empezar. Las decisiones ya están tomadas y justificadas ahí; este plan solo las ejecuta.

**Preferencias del proyecto:** auto-commit **ON**, auto-push **OFF**. Commitea al cerrar cada tarea; **nunca hagas push** — el dueño del repo aprueba los pushes a mano. Los documentos de diseño NO van en los commits de código.

---

## Contexto que no es obvio

Cinco cosas que ya mordieron en la revisión del spec. Si las ignoras, rompes producción:

1. **`window.open` va SÍNCRONO, antes de cualquier `await`.** Los navegadores móviles bloquean popups diferidos. `boton-whatsapp.tsx` ya lo hace bien y lo documenta. No lo muevas.
2. **`seguimientos` es inmutable** (0002: sin grants de update/delete + trigger que lanza excepción). No intentes actualizar una fila de ahí.
3. **`cerrado_perdido` no es columna del kanban.** `etapaTrasEvento` devuelve `null` para él. Los cierres van por `cambiarEtapa`, que escribe `NOTA_CIERRE` — de esa nota dependen las métricas.
4. **Las policies se modelan sobre `seguimientos`** (ownership del lead), **no** sobre `visitas` (que protege por autor y dejaría contactos huérfanos al reasignar un lead).
5. **Nada puede asumir «un solo pendiente por lead».** El dedupe acepta una carrera; las consultas usan `limit 1` y las resoluciones aplican a todas las filas pendientes del lead.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0013_contactos_whatsapp.sql` | enum, tabla, RLS, grants, índice |
| `src/lib/contactos/formato.ts` | vocabulario puro: etiquetas y qué resultados cuentan como «sin respuesta» |
| `src/lib/contactos/acciones.ts` | `registrarSalidaWhatsapp`, `resolverContacto` |
| `src/lib/contactos/consultas.ts` | derivar «Sin respuesta» del arreglo de leads |
| `src/lib/leads/avance-automatico.ts` | *modificar*: generalizar a `avanzarEtapaPorEvento` |
| `src/components/leads/boton-whatsapp.tsx` | *modificar*: cambiar la acción que dispara |
| `src/components/visitas/hoja-agendar-visita.tsx` | *modificar*: API controlada + `onAgendada` |
| `src/components/contactos/hoja-desenlace.tsx` | hoja de desenlace + detector de regreso |
| `src/app/(asesor)/asesor/leads/[id]/page.tsx` | *modificar*: montar el cliente compartido |
| `src/app/(asesor)/asesor/page.tsx` | *modificar*: sección «Sin respuesta» |

---

### Task 1: Migración 0013

**Files:**
- Create: `supabase/migrations/0013_contactos_whatsapp.sql`

- [ ] **Step 1: Escribir la migración**

Sigue el estilo del repo: comentarios en español **sin acentos**, y explicando la decisión, no solo el qué.

```sql
-- Migracion 0013: contactos de WhatsApp con desenlace.
--
-- Problema: cuando el asesor saca un lead a WhatsApp, el sistema pierde el
-- hilo. Se registra que se mando un mensaje (seguimientos) pero nunca si
-- hubo respuesta, asi que el pipeline se queda quieto y no hay de donde
-- sacar tasa de respuesta.
--
-- Por que una tabla nueva y no una columna en seguimientos: seguimientos es
-- append-only por diseno de seguridad (ver 0002: sin grants de update/delete
-- y trigger private.seguimientos_inmutable que lanza excepcion para
-- CUALQUIER rol). El desenlace se conoce despues, asi que necesita una fila
-- mutable. Es el mismo patron de `visitas`.
--
-- Por que no una columna en leads: una columna solo guarda el estado actual.
-- Un asesor que escribe tres veces y recibe respuesta a la tercera es
-- justamente el dato que las metricas necesitan.

create type resultado_contacto as enum (
  'pendiente',
  'contesto',
  'no_contesto',
  'cita',
  'no_interesa',
  'sin_reporte'
);

create table contactos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  autor_id uuid not null references usuarios(user_id),
  resultado resultado_contacto not null default 'pendiente',
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz
);

-- Indice por lead + recencia, NO parcial por resultado: la lista «Sin
-- respuesta» primero elige el contacto MAS RECIENTE de cada lead y despues
-- mira su estado. Un indice parcial por resultado empujaria a la consulta
-- ingenua («tiene alguna fila pendiente»), que hace que la lista crezca para
-- siempre.
create index contactos_whatsapp_lead_recencia_idx
  on contactos_whatsapp (lead_id, creado_en desc);

alter table contactos_whatsapp enable row level security;

-- Policies modeladas sobre `seguimientos` (ownership del LEAD), no sobre
-- `visitas` (que protege por autor). Si se protegiera por autor, al
-- reasignar un lead su contacto pendiente quedaria huerfano: invisible para
-- el asesor nuevo y para el anterior.
create policy "asesor lee contactos de sus leads o admin" on contactos_whatsapp
  for select to authenticated
  using (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- El `and autor_id = auth.uid()` ancla la autoria: sin el, un asesor podria
-- insertar un contacto a nombre de otro (mismo criterio que 0002 para
-- seguimientos).
create policy "asesor inserta contactos de sus leads o admin" on contactos_whatsapp
  for insert to authenticated
  with check (
    (
      lead_id in (select id from leads where asesor_id = (select auth.uid()))
      or (select private.is_admin())
    )
    and autor_id = (select auth.uid())
  );

create policy "asesor resuelve contactos de sus leads o admin" on contactos_whatsapp
  for update to authenticated
  using (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  )
  with check (
    lead_id in (select id from leads where asesor_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- Grants de columna: la identidad se fija al insertar y no se repunta.
--
-- CRITICO: hay que REVOCAR primero. Supabase concede por default privileges
-- todos los privilegios sobre las tablas nuevas de `public` a
-- `authenticated`, asi que un `grant insert (col, col)` suelto es ADITIVO y
-- no restringe nada -- un asesor podria repuntar lead_id o autor_id de un
-- contacto. Es el mismo orden de 0006 (seguimientos) y 0009 (visitas).
revoke insert on contactos_whatsapp from authenticated;
revoke update on contactos_whatsapp from authenticated;
revoke delete on contactos_whatsapp from authenticated;
grant select on contactos_whatsapp to authenticated;
grant insert (lead_id, autor_id) on contactos_whatsapp to authenticated;
grant update (resultado, resuelto_en) on contactos_whatsapp to authenticated;
```

- [ ] **Step 2: Aplicar en DESARROLLO únicamente**

⚠️ Lee `MEMORY.md` → «Entornos dev/prod» antes de correr nada. `.env.local` apunta a **dev**. No apliques nada en producción en esta tarea.

- [ ] **Step 3: Verificar que la tabla existe y RLS está activo**

Confirma: la tabla aparece, `rowsecurity = true`, y existen las tres policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_contactos_whatsapp.sql
git commit -m "feat: migracion 0013, contactos de whatsapp con desenlace"
```

---

### Task 2: Vocabulario puro de contactos

**Files:**
- Create: `src/lib/contactos/formato.ts`
- Test: `src/test/contactos-formato.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// @vitest-environment node
/**
 * Vocabulario de contactos de WhatsApp. Funciones puras, sin I/O.
 *
 * El valor está en `esSinRespuesta`: es la regla que decide si un lead
 * aparece en la lista «Sin respuesta», y equivocarla o deja leads invisibles
 * o hace que la lista crezca para siempre.
 */
import { describe, expect, it } from 'vitest'

import { esSinRespuesta, etiquetaResultado } from '@/lib/contactos/formato'

describe('esSinRespuesta', () => {
  it('un contacto pendiente cuenta como sin respuesta', () => {
    expect(esSinRespuesta('pendiente')).toBe(true)
  })

  it('«no me contestó» tambien cuenta: nadie respondio todavia', () => {
    expect(esSinRespuesta('no_contesto')).toBe(true)
  })

  it('«me contestó» NO cuenta', () => {
    expect(esSinRespuesta('contesto')).toBe(false)
  })

  it('cita y no_interesa NO cuentan: el lead ya avanzo o se cerro', () => {
    expect(esSinRespuesta('cita')).toBe(false)
    expect(esSinRespuesta('no_interesa')).toBe(false)
  })

  it('sin_reporte NO cuenta: fue reemplazado por un contacto posterior', () => {
    expect(esSinRespuesta('sin_reporte')).toBe(false)
  })

  it('tolera un valor desconocido sin reventar', () => {
    expect(esSinRespuesta('lo_que_sea')).toBe(false)
  })
})

describe('etiquetaResultado', () => {
  it('traduce al español del asesor', () => {
    expect(etiquetaResultado('no_contesto')).toBe('No me contestó')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/test/contactos-formato.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * Vocabulario de presentación de los contactos de WhatsApp.
 *
 * Sin 'server-only': se usa en Server Components y en la hoja de desenlace,
 * que es cliente. Mismo criterio que `leads/formato.ts`.
 */

export const RESULTADOS_CONTACTO = [
  'pendiente',
  'contesto',
  'no_contesto',
  'cita',
  'no_interesa',
  'sin_reporte',
] as const

export type ResultadoContacto = (typeof RESULTADOS_CONTACTO)[number]

/** Desenlaces que el asesor puede elegir en la hoja. `sin_reporte` NO: lo pone el sistema. */
export const DESENLACES_ELEGIBLES = ['cita', 'contesto', 'no_contesto', 'no_interesa'] as const

export type DesenlaceElegible = (typeof DESENLACES_ELEGIBLES)[number]

const ETIQUETAS: Record<ResultadoContacto, string> = {
  pendiente: 'Sin reportar',
  contesto: 'Me contestó',
  no_contesto: 'No me contestó',
  cita: 'Agendé una cita',
  no_interesa: 'No le interesa',
  sin_reporte: 'Nunca se reportó',
}

export function etiquetaResultado(resultado: string): string {
  return ETIQUETAS[resultado as ResultadoContacto] ?? resultado
}

/**
 * ¿Este resultado significa que el lead sigue esperando respuesta?
 *
 * `pendiente` (no reportó) y `no_contesto` (reportó que nadie respondió)
 * significan lo mismo para el asesor: nadie ha contestado. Unificarlos es lo
 * que evita que un lead quede 24 h invisible justo después de que el asesor
 * reportó, honestamente, que no le contestaron.
 *
 * Tolerante a valores desconocidos: ante la duda, NO lo listamos.
 */
export function esSinRespuesta(resultado: string): boolean {
  return resultado === 'pendiente' || resultado === 'no_contesto'
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/test/contactos-formato.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/contactos/formato.ts src/test/contactos-formato.test.ts
git commit -m "feat: vocabulario de contactos de whatsapp"
```

---

### Task 3: Generalizar el avance automático de etapa

**Files:**
- Modify: `src/lib/leads/avance-automatico.ts`
- Modify: `src/lib/visitas/acciones.ts` (los dos llamados existentes)
- Test: `src/test/avance-etapa.test.ts` (agregar un caso)

La regla pura (`etapaTrasEvento`) **no se toca**. Solo se generaliza el nombre del envoltorio y se agrega un motivo.

- [ ] **Step 1: Agregar el caso de `apartado` al test existente**

```ts
it('un lead «apartado» (fuera del tablero tras la 0012) no se mueve', () => {
  expect(etapaTrasEvento('apartado', 'contactado')).toBeNull()
})

it('un lead «nuevo» al que le escriben por WhatsApp pasa a «contactado»', () => {
  expect(etapaTrasEvento('nuevo', 'contactado')).toBe('contactado')
})

it('un lead «negociacion» al que le escriben por WhatsApp NO retrocede', () => {
  expect(etapaTrasEvento('negociacion', 'contactado')).toBeNull()
})
```

- [ ] **Step 2: Correr y verificar que pasan** (la regla ya lo soporta; estos tests solo la fijan)

Run: `npx vitest run src/test/avance-etapa.test.ts`
Expected: PASS

- [ ] **Step 3: Renombrar y ampliar el envoltorio**

En `avance-automatico.ts`: renombra `avanzarEtapaPorVisita` → `avanzarEtapaPorEvento` y amplía el motivo.

```ts
export type MotivoAvance = 'visita_agendada' | 'visita_realizada' | 'whatsapp_enviado'

const TEXTO_MOTIVO: Record<MotivoAvance, string> = {
  visita_agendada: 'al agendar una visita',
  visita_realizada: 'al marcar la visita como realizada',
  whatsapp_enviado: 'al enviar un WhatsApp',
}
```

⚠️ El texto resultante (`Etapa movida a «Contactado» al enviar un WhatsApp`) **no debe parecerse a `NOTA_CIERRE`** — el dashboard cuenta cerrados del mes comparando esa nota por texto exacto. El archivo ya lo advierte; respétalo.

- [ ] **Step 4: Actualizar los dos llamados en `visitas/acciones.ts`**

Solo cambia el nombre de la función. Los argumentos son idénticos.

- [ ] **Step 5: Verificar que nada quedó roto**

Run: `npx vitest run` y `npx tsc --noEmit`
Expected: sin errores, sin referencias a `avanzarEtapaPorVisita`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads/avance-automatico.ts src/lib/visitas/acciones.ts src/test/avance-etapa.test.ts
git commit -m "refactor: generaliza el avance de etapa a cualquier evento"
```

---

### Task 4: `registrarSalidaWhatsapp`

**Files:**
- Create: `src/lib/contactos/acciones.ts`

Modela el archivo sobre `src/lib/seguimientos/acciones.ts`: `'use server'`, cliente de **sesión** (nunca service-role), y RLS decide el ownership.

- [ ] **Step 1: Implementar la acción**

```ts
'use server'

/**
 * Server Actions de los contactos de WhatsApp.
 *
 * Cliente de SESIÓN siempre: RLS decide qué lead es de quién. Si un insert
 * falla por policy, el lead no es del asesor — no se verifica a mano.
 *
 * BEST-EFFORT POR DISEÑO, igual que `avance-automatico.ts`: cuando estas
 * funciones corren, WhatsApp YA se abrió en el teléfono del asesor. Perder
 * una fila es preferible a mostrarle un error por algo que ya ocurrió.
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { avanzarEtapaPorEvento } from '@/lib/leads/avance-automatico'

export type ResultadoContactoAccion = { ok: true } | { error: string }

/** Dos toques en este lapso son el mismo contacto, no dos. */
const VENTANA_DEDUPE_MS = 5 * 60 * 1000

function revalidarAsesor(leadId: string) {
  // `registrarSeguimiento` NO revalida /asesor ni /asesor/leads, y esta
  // acción sí mueve la etapa y alimenta la cola del día: sin estas dos, la
  // lista «Sin respuesta» no aparece hasta una recarga dura.
  revalidatePath('/asesor')
  revalidatePath('/asesor/leads')
  revalidatePath(`/asesor/leads/${leadId}`)
}

export async function registrarSalidaWhatsapp(
  leadId: string,
  datos: { nombrePlantilla?: string | null }
): Promise<ResultadoContactoAccion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const supabase = await createClient()

  // El seguimiento se escribe SIEMPRE, aunque el dedupe suprima el contacto:
  // hoy cada toque deja rastro en el timeline y quitarlo sería una regresión.
  const nota = datos.nombrePlantilla
    ? `Se envió plantilla "${datos.nombrePlantilla}"`
    : 'Mensaje directo por WhatsApp'

  const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
    lead_id: leadId,
    autor_id: usuario.user_id,
    tipo: 'whatsapp',
    nota,
  })
  if (errorSeguimiento) {
    return { error: 'No se pudo registrar el seguimiento' }
  }

  // El comportamiento instrumentado es SOLO del asesor dueño del lead. Un
  // admin revisando un lead ajeno no le deja pendientes a nadie ni le mueve
  // el pipeline. La regla vive aquí, no duplicada en los componentes.
  if (usuario.rol !== 'asesor') {
    revalidatePath(`/admin/leads/${leadId}`)
    revalidatePath('/admin/leads')
    return { ok: true }
  }

  // Dedupe: se lee y luego se escribe, sin transacción. Dos toques
  // simultáneos pueden crear dos filas; se acepta (ver spec). Nada aguas
  // abajo asume «un solo pendiente por lead».
  const { data: pendientes } = await supabase
    .from('contactos_whatsapp')
    .select('id, creado_en')
    .eq('lead_id', leadId)
    .eq('resultado', 'pendiente')

  const ahora = Date.now()
  const hayReciente = (pendientes ?? []).some(
    (c) => ahora - new Date(c.creado_en).getTime() < VENTANA_DEDUPE_MS
  )

  if (!hayReciente) {
    // Los pendientes viejos se degradan (en plural: pueden ser varios). Es
    // el registro honesto de que ese intento nunca se reportó.
    if ((pendientes ?? []).length > 0) {
      await supabase
        .from('contactos_whatsapp')
        .update({ resultado: 'sin_reporte', resuelto_en: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('resultado', 'pendiente')
    }

    const { error: errorContacto } = await supabase
      .from('contactos_whatsapp')
      .insert({ lead_id: leadId, autor_id: usuario.user_id })
    if (errorContacto) {
      console.error('No se pudo registrar el contacto:', errorContacto.message)
    }
  }

  // Avance de etapa: solo empuja desde 'nuevo'; la regla pura decide.
  const { data: lead } = await supabase
    .from('leads')
    .select('etapa')
    .eq('id', leadId)
    .maybeSingle()

  if (lead) {
    await avanzarEtapaPorEvento(supabase, {
      leadId,
      etapaActual: lead.etapa,
      destino: 'contactado',
      autorId: usuario.user_id,
      motivo: 'whatsapp_enviado',
    })
  }

  revalidarAsesor(leadId)
  return { ok: true }
}
```

- [ ] **Step 2: Escribir los tests del dedupe**

**Files:** Create `src/test/contactos-acciones.test.ts`

Es la lógica más intrincada de toda la feature y no puede quedarse solo con `tsc`. Copia el andamiaje de mocks de `src/test/visitas-acciones.test.ts` (mockea por completo `@/lib/auth/usuario-actual`, `@/lib/supabase/server` y `next/cache` — sin el último, `revalidatePath` lanza «Invariant: static generation store missing» fuera de un request de Next).

Casos mínimos:

- pendiente de hace 2 minutos → **no** se inserta contacto
- pendiente de hace 2 horas → se inserta uno nuevo **y** el viejo pasa a `sin_reporte`
- sin pendientes → se inserta
- dedupe suprimido → **el seguimiento sí se escribe** (es la regresión de timeline que hay que blindar)
- la nota conserva el nombre de la plantilla: `Se envió plantilla "X"`
- sin plantilla → `Mensaje directo por WhatsApp`
- `usuario.rol === 'admin'` → escribe el seguimiento pero **no** inserta contacto ni avanza etapa

- [ ] **Step 3: Correr los tests**

Run: `npx vitest run src/test/contactos-acciones.test.ts`
Expected: PASS

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contactos/acciones.ts src/test/contactos-acciones.test.ts
git commit -m "feat: registra la salida a whatsapp con contacto pendiente"
```

---

### Task 5: `resolverContacto`

**Files:**
- Modify: `src/lib/contactos/acciones.ts`

- [ ] **Step 1: Implementar**

Firma **por lead**, no por contacto: resuelve *todos* los pendientes de ese lead. Si resolviera solo uno, la hoja reaparecería con el otro tras una carrera.

```ts
import { cambiarEtapa } from '@/lib/leads/acciones-asesor'
import { DESENLACES_ELEGIBLES, type DesenlaceElegible } from '@/lib/contactos/formato'

export async function resolverContacto(
  leadId: string,
  desenlace: string
): Promise<ResultadoContactoAccion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  if (!(DESENLACES_ELEGIBLES as readonly string[]).includes(desenlace)) {
    return { error: 'El desenlace no es válido' }
  }
  const valor = desenlace as DesenlaceElegible

  // Guard simétrico al de registrarSalidaWhatsapp: sin él, un admin que
  // llegara aquí actualizaría el contacto y DESPUÉS `cambiarEtapa` lo
  // mandaría a /login por requireAsesor(), dejando el dato a medias.
  if (usuario.rol !== 'asesor') {
    return { error: 'Solo el asesor del lead puede reportar cómo le fue' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('contactos_whatsapp')
    .update({ resultado: valor, resuelto_en: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('resultado', 'pendiente')

  if (error) return { error: 'No se pudo registrar cómo te fue' }

  // «No le interesa» NO puede ir por el avance automático: 'cerrado_perdido'
  // no es columna del kanban, así que etapaTrasEvento devolvería null y el
  // lead nunca se cerraría. cambiarEtapa además escribe NOTA_CIERRE, del que
  // dependen la vista de cerrados y el conteo del mes.
  if (valor === 'no_interesa') {
    const resultado = await cambiarEtapa(leadId, 'cerrado_perdido')
    if ('error' in resultado) return resultado
  }

  // 'cita' NO mueve la etapa aquí: lo hace `agendarVisita` al guardar la
  // visita (ver Task 8). 'contesto' y 'no_contesto' dejan el lead en
  // «Contactado», donde ya está.

  revalidarAsesor(leadId)
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos y commit**

```bash
npx tsc --noEmit
git add src/lib/contactos/acciones.ts
git commit -m "feat: resuelve el desenlace del contacto de whatsapp"
```

---

### Task 6: Derivar la lista «Sin respuesta»

**Files:**
- Create: `src/lib/contactos/consultas.ts`
- Test: `src/test/contactos-consultas.test.ts`

**Decisión de implementación:** no se hace una consulta SQL con filtros propios. Se reutiliza el arreglo `leads` que `asesor/page.tsx` **ya trae** (que ya excluye archivados y cerrados) y se aplica el mismo patrón de «el más reciente por lead» que esa página ya usa para los seguimientos.

Esto resuelve de paso el problema del `NULL`: filtrar `clasificacion_eb` en JS incluye los `NULL`, igual que las otras dos colas. En SQL, `.neq('clasificacion_eb', 'saliente')` los **descartaría**, haciendo desaparecer todos los leads capturados a mano.

- [ ] **Step 1: Escribir el test que falla**

```ts
// @vitest-environment node
/**
 * Regla de la lista «Sin respuesta». Pura: recibe leads y contactos ya
 * consultados y decide cuáles se listan.
 *
 * Lo que se prueba es el NO: que un lead que ya contestó salga, aunque
 * arrastre un «no me contestó» viejo.
 */
import { describe, expect, it } from 'vitest'

import { leadsSinRespuesta } from '@/lib/contactos/consultas'

const LEADS = [
  { id: 'l1', nombre: 'Ana', clasificacion_eb: null },
  { id: 'l2', nombre: 'Beto', clasificacion_eb: 'cliente_directo' },
  { id: 'l3', nombre: 'Caro', clasificacion_eb: 'saliente' },
]

describe('leadsSinRespuesta', () => {
  it('lista un lead cuyo contacto más reciente está pendiente', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toEqual(['l1'])
  })

  it('NO lista un lead que ya contestó, aunque tenga un no_contesto viejo', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'no_contesto', creado_en: '2026-08-03T10:00:00Z' },
      { lead_id: 'l1', resultado: 'contesto', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })

  it('sí lista si el más reciente es pendiente aunque el viejo esté contestado', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'contesto', creado_en: '2026-08-03T10:00:00Z' },
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toEqual(['l1'])
  })

  it('conserva los leads con clasificacion_eb null: no se penaliza por falta de dato', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toContain('l1')
  })

  it('excluye los «saliente»: no son leads, son gestion nuestra', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l3', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })

  it('un lead sin contactos no aparece', () => {
    expect(leadsSinRespuesta(LEADS, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/test/contactos-consultas.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
/**
 * Regla de la lista «Sin respuesta» de la cola del día.
 *
 * Función PURA: recibe los leads que la página ya consultó y los contactos
 * de esos leads, y decide cuáles se listan. Sin I/O, para poder probar la
 * sutileza sin Supabase — mismo criterio que `avance-etapa.ts`.
 *
 * LA REGLA: un lead se lista si su contacto MÁS RECIENTE está sin
 * respuesta. NO «si tiene algún contacto sin respuesta» — con esa lectura
 * un «no me contestó» de la semana pasada mantendría al lead en la lista
 * para siempre, aunque después haya contestado.
 */

import { esSinRespuesta } from '@/lib/contactos/formato'

type LeadMinimo = { id: string; clasificacion_eb: string | null }
type ContactoMinimo = { lead_id: string; resultado: string; creado_en: string }

export function leadsSinRespuesta<T extends LeadMinimo>(
  leads: T[],
  contactos: ContactoMinimo[]
): T[] {
  // Contacto más reciente por lead. Mismo patrón que `ultimoSeguimiento` en
  // la cola del día: recorrer una sola vez quedándose con el mayor.
  const masReciente = new Map<string, ContactoMinimo>()
  for (const contacto of contactos) {
    const previo = masReciente.get(contacto.lead_id)
    if (!previo || new Date(contacto.creado_en) > new Date(previo.creado_en)) {
      masReciente.set(contacto.lead_id, contacto)
    }
  }

  return leads.filter((lead) => {
    // `clasificacion_eb == null` SÍ se incluye: no se penaliza al lead por
    // falta de dato. Es el MISMO criterio de las otras dos colas, y la razón
    // por la que este filtro vive en JS y no en SQL (allá el NULL lo
    // descartaría).
    if (lead.clasificacion_eb === 'saliente') return false

    const contacto = masReciente.get(lead.id)
    return contacto ? esSinRespuesta(contacto.resultado) : false
  })
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/test/contactos-consultas.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/contactos/consultas.ts src/test/contactos-consultas.test.ts
git commit -m "feat: regla de la lista sin respuesta"
```

---

### Task 7: Cambiar la acción del botón de WhatsApp

**Files:**
- Modify: `src/components/leads/boton-whatsapp.tsx:44-66`

⚠️ **NO muevas `window.open`.** Sigue siendo la primera instrucción de `enviar()`, síncrona. Lo único que cambia es la función que se llama después.

- [ ] **Step 1: Reemplazar el llamado**

```ts
    // Fire-and-forget: WhatsApp ya se abrió; el registro corre detrás.
    void registrarSalidaWhatsapp(leadId, {
      nombrePlantilla: plantilla?.nombre ?? null,
    }).then((resultado) => {
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      router.refresh()
    })
```

Además:
- borra las líneas 54-56 (`const nota = plantilla ? … : …`) — la nota ahora la arma el servidor, y dejarlas tira lint por variable sin usar;
- quita el import de `registrarSeguimiento` y agrega el de `registrarSalidaWhatsapp`;
- quita el `toast.success` — la confirmación ya es visible en la ficha (la etapa cambia y aparece el aviso de pendiente), un toast encima es ruido.

`router` y `toast` **siguen usándose** (`toast.error` y `router.refresh()`): no borres esos imports.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/boton-whatsapp.tsx
git commit -m "feat: el boton de whatsapp registra la salida instrumentada"
```

---

### Task 8: `HojaAgendarVisita` controlada

**Files:**
- Modify: `src/components/visitas/hoja-agendar-visita.tsx`

- [ ] **Step 1: Agregar props opcionales sin romper el uso actual**

```ts
type Props = {
  // …las props existentes…
  /** Modo controlado. Si se omite, la hoja administra su propio estado y muestra su trigger. */
  open?: boolean
  onOpenChange?: (abierto: boolean) => void
  /** Se dispara SOLO cuando la visita se guardó con éxito. */
  onAgendada?: () => void
}
```

El estado interno se usa **solo** cuando `open` es `undefined`. El `SheetTrigger` se renderiza solo en modo no controlado.

⚠️ `alCambiarAbierto` (líneas ~117-127) es hoy el único `onOpenChange` del `Sheet` y además **resetea los campos del formulario**. En modo controlado tiene que seguir limpiando *y* propagar a `onOpenChange?.(abrir)`; si lo reemplazas en vez de extenderlo, la hoja conserva los datos de la visita anterior.

- [ ] **Step 2: Dejar documentado el early-return de `deshabilitadoMotivo`**

Cuando esa prop tiene valor, el componente retorna un `<span>` deshabilitado **antes** de montar el `Sheet` (líneas ~204-215): en modo controlado, un `open = true` se ignoraría en silencio.

**No inventes una función para calcularlo.** `deshabilitadoMotivo` es una prop que llega del servidor y hoy **solo la pasa la ficha de admin** (`(admin)/admin/leads/[id]/page.tsx:217`, con el motivo «Asigna el lead a un asesor antes de agendar una visita»). La ficha del asesor nunca la pasa, y en `/asesor` el lead siempre tiene asesor — así que en el flujo de desenlace **siempre está habilitada**.

Basta con un comentario en el componente advirtiendo que el modo controlado y `deshabilitadoMotivo` son incompatibles, para que nadie los combine después sin darse cuenta.

- [ ] **Step 3: Llamar `onAgendada` tras el éxito**

Solo en la rama de éxito de `agendarVisita`, después de cerrar la hoja.

- [ ] **Step 4: Verificar que el uso actual no cambió**

Run: `npx vitest run && npx tsc --noEmit`
Expected: sin errores. La ficha sigue mostrando el botón «Agendar visita» como hoy.

- [ ] **Step 5: Commit**

```bash
git add src/components/visitas/hoja-agendar-visita.tsx
git commit -m "refactor: hoja de agendar visita con api controlada"
```

---

### Task 9: Hoja de desenlace y detector de regreso

**Files:**
- Create: `src/components/contactos/hoja-desenlace.tsx`
- Modify: `src/app/(asesor)/asesor/leads/[id]/page.tsx`

Un **solo** componente cliente monta la hoja de desenlace y la de visita, para no repetir las 8 props que la ficha le pasa hoy a `HojaAgendarVisita`.

⚠️ Este componente **sustituye** a `<HojaAgendarVisita>` en la rejilla 2×2 de acciones (`(asesor)/asesor/leads/[id]/page.tsx:166-175`), no se monta además. Tiene que seguir renderizando ahí el botón «Agendar visita» tal como se ve hoy — si lo montas aparte, el botón sale duplicado.

- [ ] **Step 1: Crear el componente**

Requisitos:
- Escucha `visibilitychange`; al volver a `visible`, `router.refresh()`. Modela el listener sobre `src/components/push/banner-instalacion.tsx:158-169` (registro único en el efecto de montaje, limpieza en el return).
- Recibe del servidor `hayPendiente: boolean`. Si es `true`, la hoja está abierta.
- Cuatro botones (`DESENLACES_ELEGIBLES`) + «Ahora no», que solo cierra.
- «Agendé una cita» abre la `HojaAgendarVisita` controlada; el contacto se resuelve a `cita` **en `onAgendada`**, no al tocar el botón. Si el asesor abandona el formulario, el contacto sigue pendiente — no hubo cita.
- En `/asesor` la hoja de visita **siempre está habilitada**: `deshabilitadoMotivo` solo lo pasa la ficha de admin (ver Task 8). No hay motivo que evaluar aquí y **no existe ninguna función para calcularlo** — no la busques ni la escribas.
- Copy dirigido al asesor: tono cercano está bien aquí. **El registro formal aplica a los mensajes que ve el cliente, no a esta interfaz** (ver memoria del proyecto «Tono de mensajes automatizados»).

- [ ] **Step 2: Consultar el pendiente en la ficha**

En `page.tsx`, junto a las consultas existentes:

```ts
supabase
  .from('contactos_whatsapp')
  .select('id, resultado')
  .eq('lead_id', id)
  .order('creado_en', { ascending: false })
  .limit(1),
```

⚠️ **`limit(1)`, nunca `.maybeSingle()`**: con dos filas pendientes (carrera aceptada) `maybeSingle` devuelve el error PGRST116. `hayPendiente` es `fila?.resultado === 'pendiente'`.

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/contactos/hoja-desenlace.tsx "src/app/(asesor)/asesor/leads/[id]/page.tsx"
git commit -m "feat: hoja de desenlace al volver de whatsapp"
```

---

### Task 10: Sección «Sin respuesta» en la cola del día

**Files:**
- Modify: `src/app/(asesor)/asesor/page.tsx`

- [ ] **Step 1: Consultar los contactos de los leads ya cargados**

El bloque que calcula `ultimoSeguimiento` está dentro de un `if (leads.length > 0)` (línea ~128). La consulta va ahí, pero **la variable se declara ANTES del `if`** — si la declaras dentro, el Step 2 no la ve y no compila:

```ts
// antes del if (leads.length > 0)
let contactos: { lead_id: string; resultado: string; creado_en: string }[] = []

// dentro del if, junto a la consulta de seguimientos
const { data: datosContactos } = await supabase
  .from('contactos_whatsapp')
  .select('lead_id, resultado, creado_en')
  .in('lead_id', leads.map((l) => l.id))
contactos = datosContactos ?? []
```

- [ ] **Step 2: Derivar la lista**

```ts
const sinRespuesta = leadsSinRespuesta(leads, contactos)
```

- [ ] **Step 3: Renderizar la sección entre «Atiende ahora» y «Necesitan seguimiento»**

Copia la forma de las secciones existentes (ícono + título + contador + lista o estado vacío). Ícono `MessageCircle`, acento `emerald` (el color del botón de WhatsApp). Estado vacío: `Nadie te quedó a deber respuesta 🎉`, en el mismo tono que los otros dos.

- [ ] **Step 4: Excluir de «Necesitan seguimiento» los que ya están aquí**

Un lead no debe salir en dos listas a la vez. Filtra de `necesitanSeguimiento` los ids presentes en `sinRespuesta`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add "src/app/(asesor)/asesor/page.tsx"
git commit -m "feat: seccion sin respuesta en la cola del dia"
```

---

### Task 11: Pruebas de integración de RLS

**Files:**
- Create: `src/test/contactos-rls.integration.test.ts`

Modela sobre `src/test/rls.integration.test.ts`. Corre con `npm run test:rls`.

- [ ] **Step 1: Escribir los casos**

- un asesor **no** lee contactos de leads ajenos
- un asesor **no** resuelve contactos de leads ajenos
- insert con `autor_id` forjado es rechazado
- `update` de `lead_id` o `autor_id` es rechazado (grants de columna)
- `delete` es rechazado
- tras reasignar el lead, el contacto pendiente es visible para el **nuevo** asesor y no para el anterior
- un admin tocando el botón en un lead ajeno **no** crea fila ni mueve etapa
- un lead archivado o cerrado **no** aparece en «Sin respuesta»

- [ ] **Step 2: Correr**

Run: `npm run test:rls`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/test/contactos-rls.integration.test.ts
git commit -m "test: rls de contactos de whatsapp"
```

---

### Task 12: Verificación en navegador

⚠️ **Los tests verdes NO bastan en este proyecto** (ver memoria «Verificación en navegador»). Esta tarea no es opcional.

- [ ] **Step 1: Levantar la app y entrar como asesor**

- [ ] **Step 2: Recorrer el flujo feliz**

Desde la ficha de un lead en «Nuevo»: tocar WhatsApp → elegir plantilla → confirmar que la etapa pasó a «Contactado» → volver a la app → confirmar que la hoja de desenlace aparece **sola**.

- [ ] **Step 3: Probar cada desenlace**

Los cuatro botones más «Ahora no». Confirmar contra la tabla de la spec: qué etapa queda y si el lead sigue en «Sin respuesta».

- [ ] **Step 4: Probar el abandono de la visita**

«Agendé una cita» → abrir la hoja → cerrarla sin guardar → el lead **sigue pendiente**.

- [ ] **Step 5: Probar el dedupe**

Tocar WhatsApp tres veces seguidas → debe haber **un** contacto y **tres** seguimientos en el timeline.

- [ ] **Step 6: Probar como admin**

Entrar a la ficha del mismo lead como admin y tocar WhatsApp → **no** debe crear contacto ni mover la etapa.

- [ ] **Step 7: EN UN CELULAR REAL — que WhatsApp abra**

La regresión más cara de este cambio es un popup bloqueado, y **no se reproduce en escritorio**. Prueba en un teléfono de verdad contra el servidor de desarrollo en la red local.

- [ ] **Step 8: Commit final si hubo ajustes**

---

## Al terminar

- Los demos desechables `src/app/demo-bienvenida/` y `src/app/demo-whatsapp/` se borran cuando esto esté en producción.
- La migración 0013 sigue **solo en desarrollo**. Aplicarla en producción es una decisión del dueño del repo, igual que el push.
- Siguiente paso natural (fuera de este plan): recordatorio push a los asesores con contactos sin respuesta.
