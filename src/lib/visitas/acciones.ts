'use server'

/**
 * Server Actions de visitas: agendar, reagendar y cancelar.
 *
 * Igual que `seguimientos/acciones.ts`, se usa el cliente de SESIÓN
 * (createClient), nunca service-role: RLS es la frontera de seguridad. Las
 * policies de `visitas` (migración 0002) son owner-or-admin para
 * select/insert/update, así que la MISMA action sirve para asesor y admin —
 * 0 filas afectadas en un update es la señal de "no es tuya" (o ya no
 * aplica), sin necesidad de verificar ownership a mano.
 *
 * Caso especial de `agendarVisita`: la policy de `visitas` NO valida que el
 * lead sea del asesor, solo que `asesor_id` (de la VISITA) sea el usuario
 * actual o admin. Por eso aquí se lee primero el lead con el cliente de
 * sesión — si RLS no devuelve fila, el lead no es del usuario — y la visita
 * se crea con `asesor_id = lead.asesor_id` (el dueño del lead, no quien la
 * agenda), para que un admin pueda agendar en nombre del asesor asignado.
 *
 * `duracion_min` y las columnas `gcal_*` quedan fuera del alcance de
 * `authenticated` salvo `duracion_min` en UPDATE (ver migración 0009): el
 * espejo con Google Calendar (Task 8) es responsabilidad exclusiva del
 * servidor.
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { validarDatosVisita } from '@/lib/visitas/validacion'
import { formatearFechaHoraMonterrey } from '@/lib/fechas/monterrey'

export type ResultadoVisita = { ok: true } | { error: string }
export type ResultadoAgendarVisita = { ok: true; visitaId: string } | { error: string }

export type DatosAgendarVisita = {
  leadId: string
  propiedadId?: string | null
  fecha: string
  duracionMin: number
}

export type DatosReagendarVisita = {
  fecha: string
  duracionMin: number
}

/** Revalida las rutas donde una visita puede mostrarse (ambos roles). */
function revalidarRutasVisita(leadId: string) {
  revalidatePath(`/asesor/leads/${leadId}`)
  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath('/asesor')
  revalidatePath('/admin')
}

/**
 * Agenda una visita sobre un lead. El lead debe pertenecer al usuario
 * actual (o el usuario debe ser admin) — lo garantiza RLS en el select de
 * `leads`. La visita queda asignada al asesor DUEÑO DEL LEAD, no a quien la
 * agenda: así un admin puede agendar en nombre de un asesor.
 */
export async function agendarVisita(
  datos: DatosAgendarVisita
): Promise<ResultadoAgendarVisita> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const validacion = validarDatosVisita({ fecha: datos.fecha, duracionMin: datos.duracionMin })
  if ('error' in validacion) return validacion

  const supabase = await createClient()

  // RLS: si el lead no es del usuario (ni es admin), esto no devuelve fila.
  const { data: lead, error: errorLead } = await supabase
    .from('leads')
    .select('id, asesor_id, nombre, telefono')
    .eq('id', datos.leadId)
    .eq('archivado', false)
    .maybeSingle()

  if (errorLead || !lead) {
    return { error: 'El lead no existe' }
  }
  if (!lead.asesor_id) {
    return { error: 'Asigna el lead a un asesor antes de agendar una visita' }
  }

  const { data: visita, error: errorVisita } = await supabase
    .from('visitas')
    .insert({
      lead_id: lead.id,
      propiedad_id: datos.propiedadId || null,
      asesor_id: lead.asesor_id,
      fecha: datos.fecha,
      duracion_min: datos.duracionMin,
      estado: 'agendada',
    })
    .select('id')
    .single()

  if (errorVisita || !visita) {
    return { error: 'No se pudo agendar la visita' }
  }

  // Seguimiento de sistema, best-effort: si falla, NO revertimos la visita
  // que ya se agendó con éxito (mismo patrón que `cambiarEtapa`).
  const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
    lead_id: lead.id,
    autor_id: usuario.user_id,
    tipo: 'sistema',
    nota: `Visita agendada para ${formatearFechaHoraMonterrey(datos.fecha)}`,
  })
  if (errorSeguimiento) {
    console.error('No se pudo registrar el seguimiento de la visita:', errorSeguimiento.message)
  }

  revalidarRutasVisita(lead.id)
  return { ok: true, visitaId: visita.id }
}

/**
 * Reagenda una visita (fecha y/o duración) SOLO si sigue en estado
 * 'agendada'. 0 filas afectadas = la visita no es del usuario, no existe, o
 * ya no está agendada (realizada/cancelada) — mismo mensaje en todos los
 * casos para no revelar cuál de las tres aplica.
 */
export async function reagendarVisita(
  visitaId: string,
  datos: DatosReagendarVisita
): Promise<ResultadoVisita> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const validacion = validarDatosVisita(datos)
  if ('error' in validacion) return validacion

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('visitas')
    .update({ fecha: datos.fecha, duracion_min: datos.duracionMin })
    .eq('id', visitaId)
    .eq('estado', 'agendada')
    .select('id, lead_id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo reagendar la visita' }
  }

  revalidarRutasVisita(data[0].lead_id)
  return { ok: true }
}

/**
 * Cancela una visita SOLO si sigue en estado 'agendada'. Misma guarda que
 * `reagendarVisita`: 0 filas afectadas = no es tuya, no existe, o ya no
 * aplica.
 */
export async function cancelarVisita(visitaId: string): Promise<ResultadoVisita> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('visitas')
    .update({ estado: 'cancelada' })
    .eq('id', visitaId)
    .eq('estado', 'agendada')
    .select('id, lead_id')

  if (error || !data || data.length === 0) {
    return { error: 'No se pudo cancelar la visita' }
  }

  revalidarRutasVisita(data[0].lead_id)
  return { ok: true }
}
