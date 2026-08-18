/**
 * Motor del cron de recordatorios (recordatorios-5min → /api/cron/recordatorios).
 *
 * Barre los recordatorios `pendiente` ya vencidos que aún no han mandado su
 * push (`notificado_en is null`), notifica al asesor dueño (campanita + Web
 * Push vía crearNotificacion) y estampa `notificado_en` — la estampa es la
 * idempotencia: si el cron se traslapa o reintenta, nadie recibe doble push.
 * El recordatorio sigue `pendiente` (visible en rojo en «Para hoy») hasta que
 * haya actividad real o el asesor lo resuelva.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { crearNotificacion } from '@/lib/notificaciones/crear'
import { formatearHoraMonterrey } from '@/lib/fechas/monterrey'

/** Tope por corrida: el cron pasa cada 5 min, el rezago se drena solo. */
const MAX_POR_CORRIDA = 100

export interface ResultadoCronRecordatorios {
  vencidos: number
  notificados: number
  errores: string[]
}

type RecordatorioVencido = {
  id: string
  lead_id: string
  asesor_id: string
  fecha_hora: string
  nota: string
  lead: { nombre: string } | null
}

export async function procesarRecordatorios(
  supabase: SupabaseClient,
  ahora: Date
): Promise<ResultadoCronRecordatorios> {
  const resultado: ResultadoCronRecordatorios = { vencidos: 0, notificados: 0, errores: [] }

  const { data, error } = await supabase
    .from('recordatorios')
    .select('id, lead_id, asesor_id, fecha_hora, nota, lead:leads(nombre)')
    .eq('estado', 'pendiente')
    .is('notificado_en', null)
    .lte('fecha_hora', ahora.toISOString())
    .order('fecha_hora', { ascending: true })
    .limit(MAX_POR_CORRIDA)

  if (error) {
    resultado.errores.push(`consulta de vencidos: ${error.message}`)
    return resultado
  }

  const vencidos = (data ?? []) as unknown as RecordatorioVencido[]
  resultado.vencidos = vencidos.length

  for (const recordatorio of vencidos) {
    try {
      // La estampa va ANTES del push (y condicionada a seguir null): si dos
      // corridas se traslapan, solo la que ganó el update notifica.
      const { data: estampados, error: errorEstampa } = await supabase
        .from('recordatorios')
        .update({ notificado_en: ahora.toISOString() })
        .eq('id', recordatorio.id)
        .is('notificado_en', null)
        .select('id')
      if (errorEstampa) throw new Error(errorEstampa.message)
      if (!estampados || estampados.length === 0) continue // otra corrida ganó

      const nombre = recordatorio.lead?.nombre ?? 'tu lead'
      const hora = formatearHoraMonterrey(recordatorio.fecha_hora)
      const texto = recordatorio.nota
        ? `Follow-up con ${nombre} (${hora}): ${recordatorio.nota}`
        : `Es hora del follow-up con ${nombre} (${hora})`

      await crearNotificacion(supabase, {
        destinatarioId: recordatorio.asesor_id,
        tipo: 'recordatorio_followup',
        texto,
        url: `/asesor/leads/${recordatorio.lead_id}`,
      })
      resultado.notificados += 1
    } catch (e) {
      resultado.errores.push(
        `recordatorio ${recordatorio.id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return resultado
}
