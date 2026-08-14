/**
 * Datos y reglas de la bandeja «Ascua» (admin).
 *
 * El compromiso de respuesta está aquí como constante y NO en Ajustes
 * todavía: es la decisión que queda pendiente con dirección. Mientras no
 * exista ese número configurable, las bandas de la cola y el porcentaje
 * de la tarjeta de acento se leen contra estos valores.
 */
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { diaMonterrey } from '@/lib/fechas/monterrey'
import { HORA_MS } from '@/lib/leads/urgencia'

/** Un lead debería quedar atendido en 15 min y asignado en 6 h. */
export const COMPROMISO_MIN = 15
export const VENCE_HORAS = 6

export type Banda = 'alerta' | 'aviso' | 'ok'

/**
 * Banda de espera de un lead sin asignar. Fronteras inclusivas hacia
 * arriba, igual que `esUrgente`: a las 6 h exactas ya cuenta como vencido.
 */
export function bandaEspera(creadoEn: string, ahora: number): Banda {
  const horas = (ahora - new Date(creadoEn).getTime()) / HORA_MS
  if (horas >= VENCE_HORAS) return 'alerta'
  if (horas >= 1) return 'aviso'
  return 'ok'
}

/** «hace 26 h» en corto, para el medidor de la fila. */
export function textoEspera(creadoEn: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(creadoEn).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

export type CargaAsesor = {
  userId: string
  nombre: string
  abiertos: number
}

/**
 * Leads activos (asignados y sin cerrar) por asesor. Alimenta el panel
 * «El equipo, ahora»: quién tiene espacio para el siguiente lead.
 *
 * Va por el cliente que le pasen — la página ya verificó requireAdmin.
 */
export async function cargaAsesores(
  supabase: SupabaseClient,
  etapasCerradas: readonly string[]
): Promise<CargaAsesor[]> {
  const [{ data: asesores, error: eA }, { data: leads, error: eL }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('user_id, nombre')
      .eq('rol', 'asesor')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('leads')
      .select('asesor_id')
      .not('asesor_id', 'is', null)
      .eq('archivado', false)
      .not('etapa', 'in', `(${etapasCerradas.join(',')})`),
  ])
  if (eA) throw new Error(`carga de asesores: ${eA.message}`)
  if (eL) throw new Error(`carga de leads activos: ${eL.message}`)

  const porAsesor = new Map<string, number>()
  for (const l of leads ?? []) {
    const id = (l as { asesor_id: string }).asesor_id
    porAsesor.set(id, (porAsesor.get(id) ?? 0) + 1)
  }

  return (asesores ?? [])
    .map((a) => ({
      userId: a.user_id as string,
      nombre: a.nombre as string,
      abiertos: porAsesor.get(a.user_id as string) ?? 0,
    }))
    .sort((x, y) => x.abiertos - y.abiertos)
}

export type EntradaSemana = {
  /** Clave de día en Monterrey (YYYY-MM-DD). */
  dia: string
  /** Índice de franja: 0 = antes de 11, 1 = 11–13, … 4 = 17 en adelante. */
  franja: number
  nombre: string
  detalle: string
  estado: 'vencido' | 'hecho' | 'cola'
}

/** Las cinco franjas de la rejilla, en horas de Monterrey. */
export const FRANJAS = ['9:00', '11:00', '13:00', '15:00', '17:00'] as const
const CORTES = [11, 13, 15, 17]

function franjaDe(hora: number): number {
  for (let i = 0; i < CORTES.length; i++) {
    if (hora < CORTES[i]) return i
  }
  return CORTES.length
}

/**
 * Leads de los últimos siete días colocados en la rejilla día × franja.
 *
 * Solo cabe un bloque por celda: si caen varios en la misma franja del
 * mismo día se queda el más urgente (vencido gana a en cola, y en cola
 * gana a ya asignado), porque la rejilla es para detectar huecos de
 * atención, no para inventariar.
 */
export async function entradaSemana(
  supabase: SupabaseClient,
  ahora: Date
): Promise<{ dias: string[]; bloques: EntradaSemana[] }> {
  const dias: string[] = []
  for (let i = 6; i >= 0; i--) {
    dias.push(diaMonterrey(new Date(ahora.getTime() - i * 24 * HORA_MS)))
  }
  const desde = new Date(ahora.getTime() - 7 * 24 * HORA_MS)

  const { data, error } = await supabase
    .from('leads')
    .select('id, nombre, fuente, creado_en, asesor_id')
    .eq('archivado', false)
    .gte('creado_en', desde.toISOString())
    .order('creado_en', { ascending: true })
  if (error) throw new Error(`entrada de la semana: ${error.message}`)

  const prioridad = { vencido: 3, cola: 2, hecho: 1 } as const
  const porCelda = new Map<string, EntradaSemana>()

  for (const l of data ?? []) {
    const fila = l as { nombre: string; fuente: string; creado_en: string; asesor_id: string | null }
    const dia = diaMonterrey(new Date(fila.creado_en))
    if (!dias.includes(dia)) continue

    const hora = Number(
      new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Monterrey',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(fila.creado_en))
    )
    const franja = franjaDe(hora)
    const banda = bandaEspera(fila.creado_en, ahora.getTime())
    const estado: EntradaSemana['estado'] = fila.asesor_id
      ? 'hecho'
      : banda === 'alerta'
        ? 'vencido'
        : 'cola'

    const bloque: EntradaSemana = {
      dia,
      franja,
      nombre: fila.nombre,
      detalle: fila.asesor_id
        ? 'Asignado'
        : `${textoEspera(fila.creado_en, ahora.getTime())} sin dueño`,
      estado,
    }

    const clave = `${dia}|${franja}`
    const previo = porCelda.get(clave)
    if (!previo || prioridad[estado] > prioridad[previo.estado]) porCelda.set(clave, bloque)
  }

  return { dias, bloques: [...porCelda.values()] }
}
