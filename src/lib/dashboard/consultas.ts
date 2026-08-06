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
 * Zona horaria: America/Monterrey. El repo NO tiene `@date-fns/tz` instalado
 * (ver package.json) — los días calendario se derivan con
 * `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' })`, que
 * entrega claves `YYYY-MM-DD` listas para agrupar u ordenar como texto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { NOTA_CIERRE } from '@/lib/leads/formato'

const ZONA_HORARIA = 'America/Monterrey'
const UN_DIA_MS = 24 * 60 * 60 * 1000
const DIAS_SERIE = 30

/** Clave de día calendario (`YYYY-MM-DD`) de `fecha` en America/Monterrey. */
export function diaMonterrey(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(fecha)
}

/**
 * Offset UTC (en minutos, p. ej. -360 para UTC-6) vigente en
 * America/Monterrey en el instante `fecha`. Se calcula en vivo con Intl en
 * vez de asumir un valor fijo: México eliminó el horario de verano en la
 * mayor parte del país en 2022, pero calcularlo evita depender de esa regla.
 */
function offsetMinutosMonterrey(fecha: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    timeZoneName: 'longOffset',
  }).formatToParts(fecha)
  const texto = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-06:00'
  const coincidencia = texto.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!coincidencia) return -360
  const signo = coincidencia[1] === '-' ? -1 : 1
  return signo * (Number(coincidencia[2]) * 60 + Number(coincidencia[3]))
}

/** Instante UTC de las 00:00:00 del día calendario `claveDia` (`YYYY-MM-DD`) en America/Monterrey. */
function inicioDeDiaMonterrey(claveDia: string): Date {
  // `claveDia` interpretada como UTC es solo un candidato: se ajusta con el
  // offset real vigente ese día para llegar al instante UTC correcto.
  const candidato = new Date(`${claveDia}T00:00:00Z`)
  const offset = offsetMinutosMonterrey(candidato)
  return new Date(candidato.getTime() - offset * 60_000)
}

/** Instante UTC del inicio del día de hoy (según `ahora`) en America/Monterrey. */
export function inicioDeHoyMonterrey(ahora: Date): Date {
  return inicioDeDiaMonterrey(diaMonterrey(ahora))
}

/** Instante UTC del inicio del mes actual (según `ahora`) en America/Monterrey. */
export function inicioDeMesMonterrey(ahora: Date): Date {
  const claveDia = diaMonterrey(ahora)
  const primerDiaDelMes = `${claveDia.slice(0, 7)}-01`
  return inicioDeDiaMonterrey(primerDiaDelMes)
}

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
 * (por defecto 5). Sin filtro de `asesor_id`: se usa con el cliente de
 * SESIÓN (mismo patrón que el resto de la cola del día en
 * `src/app/(asesor)/asesor/page.tsx`), y RLS de `visitas` ya acota a las
 * propias del asesor (o a todas si es admin) — igual que `citasHoy`.
 */
export async function proximasVisitas(
  supabase: SupabaseClient,
  limite: number = LIMITE_PROXIMAS_VISITAS,
  ahora: Date = new Date()
): Promise<ProximaVisita[]> {
  const { data, error } = await supabase
    .from('visitas')
    .select('id, fecha, duracion_min, lead:leads(id, nombre), propiedad:propiedades(titulo)')
    .eq('estado', 'agendada')
    .gte('fecha', ahora.toISOString())
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
