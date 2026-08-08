/**
 * Aplica el avance automático de etapa (la regla vive en `avance-etapa.ts`)
 * sobre la base, y deja rastro en el timeline del lead. Sirve a CUALQUIER
 * evento que empuje el pipeline hacia adelante (visita agendada/realizada,
 * WhatsApp enviado, …) — cada caller decide el `destino` y el `motivo`.
 *
 * BEST-EFFORT POR DISEÑO: esta función NUNCA lanza ni devuelve error. Es un
 * efecto secundario del evento que la dispara, y ese evento ya se guardó con
 * éxito cuando llegamos aquí — si el pipeline no se mueve, lo peor que pasa
 * es que el asesor arrastre la tarjeta a mano. Mismo criterio que el
 * seguimiento de sistema de `agendarVisita` y el espejo de Google Calendar.
 *
 * Se usa el cliente de SESIÓN que le pasa quien llama, nunca service-role:
 * si RLS no deja tocar el lead, el update afecta 0 filas y no pasa nada.
 *
 * El seguimiento que registra es DELIBERADAMENTE distinto de `NOTA_CIERRE`:
 * el dashboard cuenta «cerrados ganados del mes» comparando esa nota con
 * texto exacto (ver `dashboard/consultas.ts`), así que ninguna nota nueva
 * puede parecerse a esa o inflaría la métrica.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { etapaTrasEvento } from '@/lib/leads/avance-etapa'
import { etiquetaEtapa, type EtapaKanban } from '@/lib/leads/formato'

export type MotivoAvance = 'visita_agendada' | 'visita_realizada' | 'whatsapp_enviado'

const TEXTO_MOTIVO: Record<MotivoAvance, string> = {
  visita_agendada: 'al agendar una visita',
  visita_realizada: 'al marcar la visita como realizada',
  whatsapp_enviado: 'al enviar un WhatsApp',
}

/**
 * Mueve el lead a `destino` solo si la regla lo permite. Devuelve la etapa
 * a la que se movió, o `null` si no hubo movimiento (que es lo normal en la
 * mayoría de los casos: lead ya avanzado, cerrado, o etapa desconocida).
 */
export async function avanzarEtapaPorEvento(
  supabase: SupabaseClient,
  parametros: {
    leadId: string
    etapaActual: string
    destino: EtapaKanban
    autorId: string
    motivo: MotivoAvance
  }
): Promise<EtapaKanban | null> {
  const { leadId, etapaActual, destino, autorId, motivo } = parametros

  const nueva = etapaTrasEvento(etapaActual, destino)
  if (!nueva) return null

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ etapa: nueva })
      .eq('id', leadId)
      .eq('archivado', false)
      // Guarda contra carreras: si entre la lectura y este update alguien
      // más movió el lead (lo cerró, por ejemplo), el filtro por la etapa
      // que creíamos vigente hace que no afecte ninguna fila en vez de
      // pisar el cambio ajeno.
      .eq('etapa', etapaActual)
      .select('id')

    if (error || !data || data.length === 0) return null

    const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
      lead_id: leadId,
      autor_id: autorId,
      tipo: 'sistema',
      nota: `Etapa movida a «${etiquetaEtapa(nueva)}» ${TEXTO_MOTIVO[motivo]}`,
    })
    if (errorSeguimiento) {
      console.error('No se pudo registrar el avance de etapa:', errorSeguimiento.message)
    }

    return nueva
  } catch (error) {
    console.error('No se pudo avanzar la etapa del lead:', error)
    return null
  }
}
