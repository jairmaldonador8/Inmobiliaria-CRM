import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoEventoApp =
  | 'seguimiento_registrado' | 'whatsapp_enviado' | 'whatsapp_desenlace'
  | 'visita_agendada' | 'visita_realizada' | 'visita_cancelada'
  | 'tomado_de_bandeja' | 'escalamiento_paso' | 'push_recordatorio'

/**
 * Best-effort: la accion principal NUNCA falla por no poder anotar el evento
 * (misma semantica que los seguimientos-de-sistema de la casa).
 * actorId null = sistema (cron/service role).
 */
export async function registrarEvento(
  supabase: SupabaseClient, leadId: string, tipo: TipoEventoApp,
  payload: Record<string, unknown> = {}, actorId: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('lead_eventos')
    .insert({ lead_id: leadId, tipo, actor_id: actorId, payload })
  if (error) console.error(`registrarEvento(${tipo}) fallo:`, error.message)
}
