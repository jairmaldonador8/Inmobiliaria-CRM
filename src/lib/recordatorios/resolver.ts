/**
 * Auto-resolución de recordatorios por actividad real.
 *
 * Cuando el asesor registra un contacto (WhatsApp/llamada) o un seguimiento
 * manual en el lead, sus recordatorios VENCIDOS dejan de tener sentido: ya
 * hizo el follow-up que se había pactado. Los futuros NO se tocan — «mandar
 * fotos mañana 4:00 pm» sigue vivo aunque hoy le haya escrito.
 *
 * Best-effort por diseño (mismo criterio que contactos/acciones.ts): esto
 * corre DESPUÉS de que la actividad quedó persistida; un fallo aquí jamás
 * debe convertir en error algo que ya ocurrió.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolverRecordatoriosVencidos(
  supabase: SupabaseClient,
  leadId: string,
  asesorId: string
): Promise<void> {
  const { error } = await supabase
    .from('recordatorios')
    .update({ estado: 'hecho' })
    .eq('lead_id', leadId)
    .eq('asesor_id', asesorId)
    .eq('estado', 'pendiente')
    .lte('fecha_hora', new Date().toISOString())

  if (error) {
    console.error('resolverRecordatoriosVencidos: se omite —', error.message)
  }
}
