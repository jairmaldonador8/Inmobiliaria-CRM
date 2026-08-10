/**
 * Consultas del dashboard admin fintech (Task FM4): serie de leads de los
 * últimos 30 días, cierres ganados del mes y citas de hoy. Reciben el
 * cliente de Supabase por parámetro (inyección de dependencias, igual que
 * src/lib/notificaciones/crear.ts) para poder probarse con un stub y para
 * que la página decida qué cliente usar (RLS de sesión ya limita al admin
 * a ver todo vía private.is_admin()).
 *
 * Todas aceptan un `ahora` opcional (por defecto `new Date()`) para que los
 * tests puedan fijar el instante "actual" sin depender del reloj real.
 *
 * Zona horaria: America/Monterrey — las funciones genéricas de fecha
 * (`diaMonterrey`, `inicioDeHoyMonterrey`, `inicioDeMesMonterrey`) viven en
 * `src/lib/fechas/monterrey.ts`, fuente única de verdad compartida con el
 * resto de la app.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ETAPAS_LEAD, NOTA_CIERRE } from '@/lib/leads/formato'
import { diaMonterrey, inicioDeHoyMonterrey, inicioDeMesMonterrey } from '@/lib/fechas/monterrey'

const UN_DIA_MS = 24 * 60 * 60 * 1000
const DIAS_SERIE = 30

/**
 * Serie de leads creados por día calendario en America/Monterrey, para los
 * últimos 30 días (oldest→newest, exactamente 30 posiciones — los días sin
 * leads quedan en 0).
 *
 * Se pide un rango algo más amplio que 30 días (margen de 1 día) porque el
 * día calendario en Monterrey empieza ~6 h después de la medianoche UTC: sin
 * el margen, el primer día del rango perdería sus leads más tempraneros. El
 * agrupamiento real ocurre en JS con `diaMonterrey`, así que las filas de
 * más al pasado que no calzan en ninguna de las 30 claves simplemente no
 * cuentan.
 */
export async function serieLeads30Dias(
  supabase: SupabaseClient,
  ahora: Date = new Date()
): Promise<number[]> {
  const claves: string[] = []
  for (let i = DIAS_SERIE - 1; i >= 0; i--) {
    claves.push(diaMonterrey(new Date(ahora.getTime() - i * UN_DIA_MS)))
  }
  const indicePorClave = new Map(claves.map((clave, indice) => [clave, indice]))

  const desde = new Date(ahora.getTime() - (DIAS_SERIE + 1) * UN_DIA_MS)

  const { data, error } = await supabase
    .from('leads')
    .select('creado_en')
    .eq('archivado', false)
    .gte('creado_en', desde.toISOString())

  if (error) {
    throw new Error(`No se pudo obtener la serie de leads: ${error.message}`)
  }

  const conteos = new Array(DIAS_SERIE).fill(0) as number[]
  for (const fila of (data ?? []) as { creado_en: string }[]) {
    const clave = diaMonterrey(new Date(fila.creado_en))
    const indice = indicePorClave.get(clave)
    if (indice !== undefined) conteos[indice] += 1
  }

  return conteos
}

/**
 * Cierres «ganado» del mes en curso (America/Monterrey), para TODOS los
 * asesores (sin filtro de `asesor_id` — vista admin). Mismo patrón que la
 * cola del día del asesor (src/app/(asesor)/asesor/page.tsx): `leads` no
 * tiene columna de fecha de cierre, así que se cuenta por el seguimiento de
 * sistema con texto fijo (NOTA_CIERRE) que registra `cambiarEtapa`,
 * deduplicado por `lead_id` (un lead no debería cerrarse dos veces, pero el
 * dedup es gratis y defensivo).
 */
export async function cierresGanadosMes(
  supabase: SupabaseClient,
  ahora: Date = new Date()
): Promise<number> {
  const inicioMes = inicioDeMesMonterrey(ahora)

  const { data, error } = await supabase
    .from('seguimientos')
    .select('lead_id')
    .eq('tipo', 'sistema')
    .eq('nota', NOTA_CIERRE.cerrado_ganado)
    .gte('creado_en', inicioMes.toISOString())

  if (error) {
    throw new Error(`No se pudieron obtener los cierres del mes: ${error.message}`)
  }

  return new Set((data ?? []).map((s) => s.lead_id as string)).size
}

/**
 * Cantidad de citas agendadas para hoy (America/Monterrey): visitas con
 * `estado = 'agendada'` y `fecha` dentro de las 24 h del día de hoy.
 */
export async function citasHoy(supabase: SupabaseClient, ahora: Date = new Date()): Promise<number> {
  const inicioHoy = inicioDeHoyMonterrey(ahora)
  const inicioManana = new Date(inicioHoy.getTime() + UN_DIA_MS)

  const { count, error } = await supabase
    .from('visitas')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'agendada')
    .gte('fecha', inicioHoy.toISOString())
    .lt('fecha', inicioManana.toISOString())

  if (error) {
    throw new Error(`No se pudieron obtener las citas de hoy: ${error.message}`)
  }

  return count ?? 0
}

const LIMITE_PROXIMAS_VISITAS = 5

/** Una visita agendada futura, ya lista para pintarse en la lista del dashboard. */
export type ProximaVisita = {
  id: string
  /** Fecha/hora ISO 8601 con offset (UTC); formatear en America/Monterrey al mostrar. */
  fecha: string
  duracionMin: number
  leadId: string
  leadNombre: string
  /** Título de la propiedad de interés; null si la visita no tiene propiedad vinculada. */
  propiedadTitulo: string | null
}

type FilaProximaVisita = {
  id: string
  fecha: string
  duracion_min: number
  lead: { id: string; nombre: string } | null
  propiedad: { titulo: string } | null
}

/**
 * Próximas visitas agendadas (futuras, `estado = 'agendada'`), ordenadas por
 * `fecha` ascendente (la más próxima primero) y limitadas a `limite` filas
 * (por defecto 5). Se usa con el cliente de SESIÓN (mismo patrón que el resto
 * de la cola del día en `src/app/(asesor)/asesor/page.tsx`), y RLS de
 * `visitas` ya acota a las propias del asesor.
 *
 * `asesorId` acota explícitamente cuando quien mira NO es un asesor: un admin
 * pasa `private.is_admin()` y RLS no lo filtra, así que en la vista de asesor
 * vería las visitas de toda la agencia. Sin el parámetro, el comportamiento es
 * idéntico al anterior.
 *
 * `lead:leads!inner(...)` (en vez del embed normal) para que una visita
 * cuyo lead ya no sea legible por RLS (p. ej. quedó huérfana de un cambio de
 * asesor que no movió también la visita) simplemente NO aparezca en vez de
 * pintarse con `lead: null` y un link roto. Defensa en profundidad: el
 * arreglo real vive en `reasignarLead` (src/lib/leads/acciones.ts), esto es
 * el respaldo para cualquier otra vía en la que la fila de `visitas` quede
 * desincronizada de su lead.
 */
export async function proximasVisitas(
  supabase: SupabaseClient,
  limite: number = LIMITE_PROXIMAS_VISITAS,
  ahora: Date = new Date(),
  asesorId?: string
): Promise<ProximaVisita[]> {
  let consulta = supabase
    .from('visitas')
    .select('id, fecha, duracion_min, lead:leads!inner(id, nombre), propiedad:propiedades(titulo)')
    .eq('estado', 'agendada')
    .gte('fecha', ahora.toISOString())

  if (asesorId) {
    consulta = consulta.eq('asesor_id', asesorId)
  }

  const { data, error } = await consulta
    .order('fecha', { ascending: true })
    .limit(limite)

  if (error) {
    throw new Error(`No se pudieron obtener las próximas visitas: ${error.message}`)
  }

  return ((data ?? []) as unknown as FilaProximaVisita[]).map((fila) => ({
    id: fila.id,
    fecha: fila.fecha,
    duracionMin: fila.duracion_min,
    leadId: fila.lead?.id ?? '',
    leadNombre: fila.lead?.nombre ?? '',
    propiedadTitulo: fila.propiedad?.titulo ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Métricas «Cómo van los leads» (historia de lead_eventos + foto de leads).
// Mismo contrato que el resto del módulo: (supabase, ahora = new Date()).
// Los eventos de backfill cuentan igual — son historia real del negocio.
// ---------------------------------------------------------------------------

/** Tipos de evento que cuentan como "contacto" con el lead. */
const TIPOS_CONTACTO = ['whatsapp_enviado', 'seguimiento_registrado'] as const

export interface ConteoEtapa {
  etapa: string
  cuenta: number
}

/**
 * Embudo por etapa de los leads ACTIVOS (no archivados), en el orden
 * canónico de `ETAPAS_LEAD` y sin etapas en cero (mismo criterio que
 * `agruparPorEtapa` del pipeline de cápsulas). Una etapa fuera del
 * vocabulario (defensa) se anexa al final en vez de perderse.
 *
 * `ahora` no interviene (es una foto, no una ventana) — se acepta por
 * uniformidad del contrato del módulo.
 */
export async function embudoPorEtapa(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ahora: Date = new Date()
): Promise<ConteoEtapa[]> {
  const { data, error } = await supabase.from('leads').select('etapa').eq('archivado', false)

  if (error) {
    throw new Error(`No se pudo obtener el embudo por etapa: ${error.message}`)
  }

  const conteos = new Map<string, number>()
  for (const fila of (data ?? []) as { etapa: string }[]) {
    conteos.set(fila.etapa, (conteos.get(fila.etapa) ?? 0) + 1)
  }

  const resultado: ConteoEtapa[] = []
  for (const etapa of ETAPAS_LEAD) {
    const cuenta = conteos.get(etapa)
    if (cuenta) {
      resultado.push({ etapa, cuenta })
      conteos.delete(etapa)
    }
  }
  for (const [etapa, cuenta] of conteos) {
    if (!(ETAPAS_LEAD as readonly string[]).includes(etapa)) {
      resultado.push({ etapa, cuenta })
    }
  }
  return resultado
}

/**
 * Mediana (en MINUTOS) del tiempo entre la asignación de un lead
 * (`lead_asignado` en los últimos 7 días) y su PRIMER contacto posterior
 * (`whatsapp_enviado` o `seguimiento_registrado`). Mediana en JS: ordenar
 * deltas y tomar el centro; con nº par, promedio de los dos centrales.
 * `null` si ningún lead asignado en la ventana tiene contacto posterior.
 *
 * Los leads sin contacto posterior NO cuentan (no aportan delta) — es una
 * métrica de velocidad de respuesta, no de cobertura.
 */
export async function medianaPrimeraRespuesta7d(
  supabase: SupabaseClient,
  ahora: Date = new Date()
): Promise<number | null> {
  const desde = new Date(ahora.getTime() - 7 * UN_DIA_MS)

  const { data, error } = await supabase
    .from('lead_eventos')
    .select('lead_id, tipo, ocurrido_en')
    .in('tipo', ['lead_asignado', ...TIPOS_CONTACTO])
    .gte('ocurrido_en', desde.toISOString())
    .order('ocurrido_en', { ascending: true })

  if (error) {
    throw new Error(`No se pudo obtener la mediana de primera respuesta: ${error.message}`)
  }

  // Primera asignación y primer contacto POSTERIOR a ella, por lead (las
  // filas llegan ordenadas ascendente, así que "primero visto" = más viejo).
  const asignadoEn = new Map<string, number>()
  const primerContactoEn = new Map<string, number>()
  for (const fila of (data ?? []) as { lead_id: string; tipo: string; ocurrido_en: string }[]) {
    const instante = new Date(fila.ocurrido_en).getTime()
    if (fila.tipo === 'lead_asignado') {
      if (!asignadoEn.has(fila.lead_id)) asignadoEn.set(fila.lead_id, instante)
      continue
    }
    const asignado = asignadoEn.get(fila.lead_id)
    if (asignado === undefined || instante < asignado) continue // contacto previo o lead fuera de ventana
    if (!primerContactoEn.has(fila.lead_id)) primerContactoEn.set(fila.lead_id, instante)
  }

  const deltasMin: number[] = []
  for (const [leadId, asignado] of asignadoEn) {
    const contacto = primerContactoEn.get(leadId)
    if (contacto !== undefined) deltasMin.push((contacto - asignado) / 60_000)
  }
  if (deltasMin.length === 0) return null

  deltasMin.sort((a, b) => a - b)
  const centro = Math.floor(deltasMin.length / 2)
  return deltasMin.length % 2 === 1
    ? deltasMin[centro]
    : (deltasMin[centro - 1] + deltasMin[centro]) / 2
}

export interface ConteoFuente {
  fuente: string
  cuenta: number
}

/**
 * Conteo de leads llegados por fuente (`payload.fuente` de `lead_creado`) en
 * los últimos 30 días, de mayor a menor. Un payload sin fuente (no debería
 * pasar — el trigger la anota siempre) cae al bucket 'otro'.
 */
export async function leadsPorFuente30d(
  supabase: SupabaseClient,
  ahora: Date = new Date()
): Promise<ConteoFuente[]> {
  const desde = new Date(ahora.getTime() - DIAS_SERIE * UN_DIA_MS)

  const { data, error } = await supabase
    .from('lead_eventos')
    .select('payload')
    .eq('tipo', 'lead_creado')
    .gte('ocurrido_en', desde.toISOString())

  if (error) {
    throw new Error(`No se pudieron obtener los leads por fuente: ${error.message}`)
  }

  const conteos = new Map<string, number>()
  for (const fila of (data ?? []) as { payload: Record<string, unknown> }[]) {
    const fuente = typeof fila.payload?.fuente === 'string' ? fila.payload.fuente : 'otro'
    conteos.set(fuente, (conteos.get(fuente) ?? 0) + 1)
  }

  return [...conteos.entries()]
    .map(([fuente, cuenta]) => ({ fuente, cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta)
}

const DIAS_ACTIVIDAD = 7

/**
 * Eventos de contacto (whatsapp_enviado + seguimiento_registrado) por día
 * calendario de Monterrey, últimos 7 días (oldest→newest, exactamente 7
 * posiciones). Patrón exacto de `serieLeads30Dias`, incluido el margen de un
 * día en el rango pedido por el desfase medianoche UTC ↔ Monterrey.
 */
export async function actividadContacto7d(
  supabase: SupabaseClient,
  ahora: Date = new Date()
): Promise<number[]> {
  const claves: string[] = []
  for (let i = DIAS_ACTIVIDAD - 1; i >= 0; i--) {
    claves.push(diaMonterrey(new Date(ahora.getTime() - i * UN_DIA_MS)))
  }
  const indicePorClave = new Map(claves.map((clave, indice) => [clave, indice]))

  const desde = new Date(ahora.getTime() - (DIAS_ACTIVIDAD + 1) * UN_DIA_MS)

  const { data, error } = await supabase
    .from('lead_eventos')
    .select('lead_id, tipo, ocurrido_en')
    .in('tipo', [...TIPOS_CONTACTO])
    .gte('ocurrido_en', desde.toISOString())

  if (error) {
    throw new Error(`No se pudo obtener la actividad de contacto: ${error.message}`)
  }

  const conteos = new Array(DIAS_ACTIVIDAD).fill(0) as number[]
  for (const fila of (data ?? []) as { ocurrido_en: string }[]) {
    const indice = indicePorClave.get(diaMonterrey(new Date(fila.ocurrido_en)))
    if (indice !== undefined) conteos[indice] += 1
  }

  return conteos
}
