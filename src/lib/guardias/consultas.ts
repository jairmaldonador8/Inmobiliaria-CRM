/**
 * Consultas de guardias, configuración del org y regla VIP (Fase B).
 *
 * Sin 'use server' y sin 'server-only': lo consumen el sync de EasyBroker y
 * el cron de escalamiento (service role vía DI) además de server components.
 * Todas las funciones reciben el cliente por DI, igual que enviarPush.
 *
 * Spec: docs/ultrapowers/specs/2026-08-05-guardias-design.md
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { convertirFechaHoraMonterreyAIso, diaMonterrey } from '@/lib/fechas/monterrey'

export interface Guardia {
  id: string
  fecha: string
  turno: 'manana' | 'tarde'
  hora_inicio: string
  hora_fin: string
  asesor_id: string
}

export interface ConfiguracionGuardias {
  umbralVipMxn: number | null
  duenoUserId: string | null
  correoDueno: string | null
  escalamientoMin: { recordatorio: number; abierto: number; dueno: number }
  turnoManana: { inicio: string; fin: string }
  turnoTarde: { inicio: string; fin: string }
}

/** Defaults que replican el seed de la migración 0014. */
export const CONFIG_DEFAULTS: ConfiguracionGuardias = {
  umbralVipMxn: null,
  duenoUserId: null,
  correoDueno: null,
  escalamientoMin: { recordatorio: 15, abierto: 30, dueno: 120 },
  turnoManana: { inicio: '09:00', fin: '15:00' },
  turnoTarde: { inicio: '15:00', fin: '00:00' },
}

const COLUMNAS_GUARDIA = 'id, fecha, turno, hora_inicio, hora_fin, asesor_id'

/** Postgres `time` llega como 'HH:MM:SS'; los inputs/config traen 'HH:mm'. */
function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

function diaRelativo(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Ventana [inicio, fin) del turno en instantes UTC. `hora_fin <= hora_inicio`
 * significa que el turno termina al día siguiente — en la práctica solo el
 * caso '00:00' (la cobertura del día termina a medianoche, decisión 1 del
 * spec), pero se resuelve en general por si el admin captura otra cosa.
 */
export function ventanaGuardia(
  g: Pick<Guardia, 'fecha' | 'hora_inicio' | 'hora_fin'>
): { inicio: Date; fin: Date } {
  const inicioHhmm = hhmm(g.hora_inicio)
  const finHhmm = hhmm(g.hora_fin)
  const finCruzaDia = finHhmm <= inicioHhmm
  const inicioIso = convertirFechaHoraMonterreyAIso(g.fecha, inicioHhmm)
  const finIso = convertirFechaHoraMonterreyAIso(
    finCruzaDia ? diaRelativo(g.fecha, 1) : g.fecha,
    finHhmm
  )
  if (!inicioIso || !finIso) {
    throw new Error(`guardia con horario inválido: ${g.fecha} ${g.hora_inicio}-${g.hora_fin}`)
  }
  return { inicio: new Date(inicioIso), fin: new Date(finIso) }
}

/**
 * Guardia cuya ventana cubre `ahora` (inicio inclusive, fin exclusivo), o
 * null si nadie está de guardia. Consulta hoy Y ayer en Monterrey por si un
 * turno capturado cruza la medianoche.
 */
export async function guardiaActiva(
  supabase: SupabaseClient,
  ahora: Date
): Promise<Guardia | null> {
  const hoy = diaMonterrey(ahora)
  const { data, error } = await supabase
    .from('guardias')
    .select(COLUMNAS_GUARDIA)
    .in('fecha', [diaRelativo(hoy, -1), hoy])
  if (error) throw new Error(`consulta de guardia activa: ${error.message}`)

  for (const g of (data ?? []) as Guardia[]) {
    const { inicio, fin } = ventanaGuardia(g)
    if (inicio <= ahora && ahora < fin) return g
  }
  return null
}

/**
 * Primera guardia cuyo inicio es FUTURO (inicio > ahora), ordenada por
 * instante real de inicio; null si no hay rol cargado hacia adelante.
 */
export async function siguienteGuardia(
  supabase: SupabaseClient,
  ahora: Date
): Promise<Guardia | null> {
  const { data, error } = await supabase
    .from('guardias')
    .select(COLUMNAS_GUARDIA)
    .gte('fecha', diaMonterrey(ahora))
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true })
    .limit(50)
  if (error) throw new Error(`consulta de siguiente guardia: ${error.message}`)

  const futuras = ((data ?? []) as Guardia[])
    .map((g) => ({ g, inicio: ventanaGuardia(g).inicio }))
    .filter((x) => x.inicio > ahora)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
  return futuras[0]?.g ?? null
}

/** Lee `configuracion` completa y la tipa con defaults (claves null del seed → default). */
export async function leerConfiguracion(
  supabase: SupabaseClient
): Promise<ConfiguracionGuardias> {
  const { data, error } = await supabase.from('configuracion').select('clave, valor')
  if (error) throw new Error(`consulta de configuracion: ${error.message}`)

  const valores = new Map((data ?? []).map((f: { clave: string; valor: unknown }) => [f.clave, f.valor]))

  const numero = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  const turno = (v: unknown, def: { inicio: string; fin: string }) => {
    const o = v as { inicio?: unknown; fin?: unknown } | null
    return typeof o?.inicio === 'string' && typeof o?.fin === 'string'
      ? { inicio: o.inicio, fin: o.fin }
      : def
  }
  const escalamiento = (v: unknown) => {
    const o = v as { recordatorio?: unknown; abierto?: unknown; dueno?: unknown } | null
    return typeof o?.recordatorio === 'number' &&
      typeof o?.abierto === 'number' &&
      typeof o?.dueno === 'number'
      ? { recordatorio: o.recordatorio, abierto: o.abierto, dueno: o.dueno }
      : CONFIG_DEFAULTS.escalamientoMin
  }

  return {
    umbralVipMxn: numero(valores.get('umbral_vip_mxn')),
    duenoUserId: texto(valores.get('dueno_user_id')),
    correoDueno: texto(valores.get('correo_dueno')),
    escalamientoMin: escalamiento(valores.get('escalamiento_min')),
    turnoManana: turno(valores.get('turno_manana'), CONFIG_DEFAULTS.turnoManana),
    turnoTarde: turno(valores.get('turno_tarde'), CONFIG_DEFAULTS.turnoTarde),
  }
}

/**
 * VIP = propiedad marcada exclusiva (propiedades_internas) O precio >= umbral
 * configurado. Sin propiedad → false. Sin umbral → solo cuenta la exclusiva.
 * Lanza en errores de consulta: el resolutor degrada a bandeja (el sync jamás
 * pierde un lead) en vez de arriesgarse a rutear mal un VIP.
 */
export async function esLeadVip(
  supabase: SupabaseClient,
  propiedadId: string | null,
  config: ConfiguracionGuardias
): Promise<boolean> {
  if (!propiedadId) return false

  const { data: interna, error: errorInterna } = await supabase
    .from('propiedades_internas')
    .select('exclusiva')
    .eq('propiedad_id', propiedadId)
    .maybeSingle()
  if (errorInterna) throw new Error(`consulta de propiedades_internas: ${errorInterna.message}`)
  if (interna?.exclusiva) return true

  if (config.umbralVipMxn === null) return false

  const { data: propiedad, error: errorPrecio } = await supabase
    .from('propiedades')
    .select('precio')
    .eq('id', propiedadId)
    .maybeSingle()
  if (errorPrecio) throw new Error(`consulta de precio de propiedad: ${errorPrecio.message}`)

  const precio = propiedad?.precio
  return precio !== null && precio !== undefined && Number(precio) >= config.umbralVipMxn
}
