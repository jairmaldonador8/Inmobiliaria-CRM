/**
 * Consultas de recordatorios para las vistas del asesor.
 *
 * Reciben el cliente por parámetro (patrón de consultas.ts de dashboard):
 * las páginas pasan el de sesión — RLS ya limita a los propios — pero el
 * acotado por `asesor_id` va EXPLÍCITO por el caso admin-en-vista-de-asesor
 * (un admin pasa private.is_admin() en el select y vería los de todos).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { inicioDeHoyMonterrey } from '@/lib/fechas/monterrey'

const DIA_MS = 24 * 60 * 60 * 1000

export type RecordatorioParaHoy = {
  id: string
  lead_id: string
  fecha_hora: string
  nota: string
  lead: { nombre: string } | null
}

/**
 * Cola «Para hoy» del inicio: recordatorios pendientes que vencen hasta el
 * fin del día calendario de Monterrey — los ya vencidos incluidos (un
 * recordatorio de ayer sin atender sigue siendo trabajo de hoy, no
 * desaparece). Más urgente primero.
 */
export async function recordatoriosParaHoy(
  supabase: SupabaseClient,
  asesorId: string,
  ahora: Date
): Promise<RecordatorioParaHoy[]> {
  const finDeHoy = new Date(inicioDeHoyMonterrey(ahora).getTime() + DIA_MS)

  const { data, error } = await supabase
    .from('recordatorios')
    .select('id, lead_id, fecha_hora, nota, lead:leads(nombre)')
    .eq('asesor_id', asesorId)
    .eq('estado', 'pendiente')
    .lt('fecha_hora', finDeHoy.toISOString())
    .order('fecha_hora', { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los recordatorios: ${error.message}`)
  }
  return (data ?? []) as unknown as RecordatorioParaHoy[]
}

export type RecordatorioPendiente = {
  id: string
  lead_id: string
  fecha_hora: string
  nota: string
}

/**
 * Próximo recordatorio pendiente por lead (para la lista de leads y la
 * ficha): el de fecha más cercana por cada uno.
 */
export async function proximoRecordatorioPorLead(
  supabase: SupabaseClient,
  asesorId: string,
  leadIds: string[]
): Promise<Map<string, RecordatorioPendiente>> {
  const proximo = new Map<string, RecordatorioPendiente>()
  if (leadIds.length === 0) return proximo

  const { data } = await supabase
    .from('recordatorios')
    .select('id, lead_id, fecha_hora, nota')
    .eq('asesor_id', asesorId)
    .eq('estado', 'pendiente')
    .in('lead_id', leadIds)
    .order('fecha_hora', { ascending: true })

  for (const r of data ?? []) {
    if (!proximo.has(r.lead_id)) proximo.set(r.lead_id, r)
  }
  return proximo
}
