'use server'

/**
 * Server actions de admin para el rol de guardias y su configuración
 * (Fase B). Todas exigen requireAdmin y van por service role, igual que
 * las acciones de leads: RLS restringe a los asesores, pero la mutación
 * canónica vive aquí.
 */
import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerConfiguracion, type ConfiguracionGuardias } from '@/lib/guardias/consultas'
import type { ResultadoAccion } from '@/lib/leads/acciones'

const RUTA_GUARDIAS = '/admin/guardias'
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

function esFechaValida(fecha: string): boolean {
  return RE_FECHA.test(fecha) && !Number.isNaN(new Date(`${fecha}T00:00:00Z`).getTime())
}

async function asesorActivo(supabase: SupabaseClient, asesorId: string): Promise<boolean> {
  const { data } = await supabase
    .from('usuarios')
    .select('user_id')
    .eq('user_id', asesorId)
    .eq('rol', 'asesor')
    .eq('activo', true)
    .maybeSingle()
  return data !== null
}

/**
 * Asigna (upsert por UNIQUE fecha+turno) o libera (asesorId null) un turno.
 * Las horas salen de los defaults de configuración del turno.
 */
export async function guardarGuardia(
  fecha: string,
  turno: 'manana' | 'tarde',
  asesorId: string | null
): Promise<ResultadoAccion> {
  await requireAdmin()
  if (!esFechaValida(fecha)) return { error: 'Fecha inválida' }
  if (turno !== 'manana' && turno !== 'tarde') return { error: 'Turno inválido' }

  const supabase = createAdminClient()

  if (asesorId === null) {
    const { error } = await supabase.from('guardias').delete().eq('fecha', fecha).eq('turno', turno)
    if (error) return { error: `No se pudo liberar el turno: ${error.message}` }
    revalidatePath(RUTA_GUARDIAS)
    return { ok: true }
  }

  if (!(await asesorActivo(supabase, asesorId))) {
    return { error: 'El asesor no está disponible' }
  }

  const config = await leerConfiguracion(supabase)
  const horas = turno === 'manana' ? config.turnoManana : config.turnoTarde

  const { error } = await supabase
    .from('guardias')
    .upsert(
      { fecha, turno, hora_inicio: horas.inicio, hora_fin: horas.fin, asesor_id: asesorId },
      { onConflict: 'fecha,turno' }
    )
  if (error) return { error: `No se pudo guardar la guardia: ${error.message}` }

  revalidatePath(RUTA_GUARDIAS)
  return { ok: true }
}

export type ResultadoCopia = { ok: true; copiadas: number } | { error: string }

/**
 * Copia el rol de la semana anterior (lunes−7 … domingo−7) a la semana que
 * empieza en `lunesDestino`, SIN pisar turnos ya capturados en el destino.
 */
export async function copiarSemanaAnterior(lunesDestino: string): Promise<ResultadoCopia> {
  await requireAdmin()
  if (!esFechaValida(lunesDestino)) return { error: 'Fecha inválida' }
  const lunes = new Date(`${lunesDestino}T00:00:00Z`)
  if (lunes.getUTCDay() !== 1) return { error: 'La fecha destino debe ser un lunes' }

  const corrimiento = (fecha: string, dias: number): string => {
    const d = new Date(`${fecha}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
  }

  const supabase = createAdminClient()
  const origenInicio = corrimiento(lunesDestino, -7)
  const origenFin = corrimiento(lunesDestino, -1)
  const destinoFin = corrimiento(lunesDestino, 6)

  const { data: origen, error: errorOrigen } = await supabase
    .from('guardias')
    .select('fecha, turno, hora_inicio, hora_fin, asesor_id')
    .gte('fecha', origenInicio)
    .lte('fecha', origenFin)
  if (errorOrigen) return { error: `No se pudo leer la semana anterior: ${errorOrigen.message}` }
  if (!origen || origen.length === 0) return { error: 'La semana anterior no tiene guardias capturadas' }

  const { data: destino, error: errorDestino } = await supabase
    .from('guardias')
    .select('fecha, turno')
    .gte('fecha', lunesDestino)
    .lte('fecha', destinoFin)
  if (errorDestino) return { error: `No se pudo leer la semana destino: ${errorDestino.message}` }

  const ocupados = new Set((destino ?? []).map((g) => `${g.fecha}:${g.turno}`))
  const nuevas = origen
    .map((g) => ({ ...g, fecha: corrimiento(g.fecha, 7) }))
    .filter((g) => !ocupados.has(`${g.fecha}:${g.turno}`))

  if (nuevas.length === 0) return { ok: true, copiadas: 0 }

  const { error: errorInsert } = await supabase.from('guardias').insert(nuevas)
  if (errorInsert) return { error: `No se pudo copiar la semana: ${errorInsert.message}` }

  revalidatePath(RUTA_GUARDIAS)
  return { ok: true, copiadas: nuevas.length }
}

export interface EntradaConfiguracionGuardias {
  umbralVipMxn: number | null
  duenoUserId: string | null
  correoDueno: string | null
  escalamientoMin: { recordatorio: number; abierto: number; dueno: number }
  turnoManana: { inicio: string; fin: string }
  turnoTarde: { inicio: string; fin: string }
}

function validarConfiguracion(entrada: EntradaConfiguracionGuardias): string | null {
  const { umbralVipMxn, correoDueno, escalamientoMin: m, turnoManana, turnoTarde } = entrada

  if (umbralVipMxn !== null && (!Number.isFinite(umbralVipMxn) || umbralVipMxn <= 0)) {
    return 'El umbral VIP debe ser un monto mayor a cero'
  }
  if (correoDueno !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoDueno)) {
    return 'El correo del dueño no es válido'
  }
  for (const t of [m.recordatorio, m.abierto, m.dueno]) {
    if (!Number.isInteger(t) || t <= 0) return 'Los tiempos de escalamiento deben ser minutos enteros positivos'
  }
  if (!(m.recordatorio < m.abierto && m.abierto < m.dueno)) {
    return 'Los tiempos deben ir en orden: recordatorio < abierto < dueño'
  }
  for (const hora of [turnoManana.inicio, turnoManana.fin, turnoTarde.inicio, turnoTarde.fin]) {
    if (!RE_HORA.test(hora)) return `Hora inválida: ${hora} (formato HH:mm)`
  }
  return null
}

/** Guarda la configuración completa de guardias/VIP/escalamiento (upsert por clave). */
export async function guardarConfiguracionGuardias(
  entrada: EntradaConfiguracionGuardias
): Promise<ResultadoAccion> {
  await requireAdmin()

  const invalida = validarConfiguracion(entrada)
  if (invalida) return { error: invalida }

  const supabase = createAdminClient()

  if (entrada.duenoUserId !== null) {
    const { data } = await supabase
      .from('usuarios')
      .select('user_id')
      .eq('user_id', entrada.duenoUserId)
      .eq('activo', true)
      .maybeSingle()
    if (!data) return { error: 'El usuario dueño no existe o está inactivo' }
  }

  const ahora = new Date().toISOString()
  const filas = [
    { clave: 'umbral_vip_mxn', valor: entrada.umbralVipMxn },
    { clave: 'dueno_user_id', valor: entrada.duenoUserId },
    { clave: 'correo_dueno', valor: entrada.correoDueno },
    { clave: 'escalamiento_min', valor: entrada.escalamientoMin },
    { clave: 'turno_manana', valor: entrada.turnoManana },
    { clave: 'turno_tarde', valor: entrada.turnoTarde },
  ].map((f) => ({ ...f, actualizado_en: ahora }))

  const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'clave' })
  if (error) return { error: `No se pudo guardar la configuración: ${error.message}` }

  revalidatePath(RUTA_GUARDIAS)
  return { ok: true }
}

/** Rol del mes + configuración para la pantalla admin (service role, solo admin). */
export async function leerRolYConfiguracion(
  inicioMes: string,
  finMes: string
): Promise<{ guardias: unknown[]; config: ConfiguracionGuardias }> {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('guardias')
    .select('id, fecha, turno, hora_inicio, hora_fin, asesor_id')
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha')
  if (error) throw new Error(`consulta del rol: ${error.message}`)
  return { guardias: data ?? [], config: await leerConfiguracion(supabase) }
}
