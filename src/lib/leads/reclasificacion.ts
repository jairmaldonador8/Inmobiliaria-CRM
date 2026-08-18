'use server'

/**
 * Server Actions del flujo «este lead es un corredor, no cliente» (ronda 2).
 *
 * El asesor REPORTA (cliente de sesión: la RLS de 0026 garantiza lead propio
 * y a nombre propio) y un admin RESUELVE por service role — igual que
 * asignarLead: leads.clasificacion_eb no es escribible por authenticated
 * (decisión de 0011) y la resolución tampoco.
 */

import { revalidatePath } from 'next/cache'

import { requireAdmin, usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearNotificacion, notificarAdmins } from '@/lib/notificaciones/crear'

export type ResultadoReclasificacion = { ok: true } | { error: string }

const MAX_MOTIVO = 280

function revalidarFichas(leadId: string) {
  revalidatePath(`/asesor/leads/${leadId}`)
  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath('/asesor/leads')
  revalidatePath('/admin/leads')
}

/** El asesor reporta: se abre la solicitud y suena la campanita de admins. */
export async function solicitarReclasificacion(
  leadId: string,
  motivo: string
): Promise<ResultadoReclasificacion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Tu sesión no es válida' }

  const motivoLimpio = motivo?.trim() ?? ''
  if (motivoLimpio.length > MAX_MOTIVO) {
    return { error: `El motivo no puede exceder ${MAX_MOTIVO} caracteres` }
  }

  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('nombre, clasificacion_eb')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { error: 'No se encontró el lead' }
  if (lead.clasificacion_eb === 'co_broke') {
    return { error: 'Este lead ya está marcado como corredor externo' }
  }

  const { error } = await supabase.from('lead_reclasificaciones').insert({
    lead_id: leadId,
    solicitante_id: usuario.user_id,
    motivo: motivoLimpio,
  })
  if (error) {
    // 23505 = ya hay una solicitud pendiente (índice único parcial de 0026).
    if (error.code === '23505') {
      return { error: 'Ya hay un reporte pendiente para este lead' }
    }
    return { error: 'No se pudo enviar el reporte' }
  }

  // La campanita de admins va por service role (notificaciones no tiene
  // policy de insert para authenticated). Best-effort: el reporte ya quedó.
  try {
    await notificarAdmins(createAdminClient(), {
      tipo: 'reclasificacion_solicitada',
      texto: `${usuario.nombre} reporta que ${lead.nombre} es un corredor, no cliente — revisa y aprueba`,
      url: `/admin/leads/${leadId}`,
    })
  } catch (e) {
    console.error('solicitarReclasificacion: fallo la notificación, se omite', e)
  }

  revalidarFichas(leadId)
  return { ok: true }
}

/**
 * Un admin resuelve la solicitud. Aprobar escribe
 * leads.clasificacion_eb = 'co_broke' y deja seguimiento de sistema (así el
 * timeline cuenta la historia); en ambos casos el solicitante recibe la
 * resolución. CAS sobre estado='pendiente': dos admins a la vez no se pisan.
 */
export async function resolverReclasificacion(
  solicitudId: string,
  decision: 'aprobada' | 'rechazada'
): Promise<ResultadoReclasificacion> {
  const admin = await requireAdmin()
  if (decision !== 'aprobada' && decision !== 'rechazada') {
    return { error: 'La decisión no es válida' }
  }

  const supabase = createAdminClient()

  const { data: resueltas, error } = await supabase
    .from('lead_reclasificaciones')
    .update({
      estado: decision,
      resuelta_por: admin.user_id,
      resuelta_en: new Date().toISOString(),
    })
    .eq('id', solicitudId)
    .eq('estado', 'pendiente')
    .select('lead_id, solicitante_id')

  if (error) return { error: 'No se pudo resolver el reporte' }
  const solicitud = resueltas?.[0]
  if (!solicitud) return { error: 'Este reporte ya fue resuelto' }

  const { data: lead } = await supabase
    .from('leads')
    .select('nombre')
    .eq('id', solicitud.lead_id)
    .maybeSingle()
  const nombreLead = lead?.nombre ?? 'el lead'

  if (decision === 'aprobada') {
    const { error: errorLead } = await supabase
      .from('leads')
      .update({ clasificacion_eb: 'co_broke' })
      .eq('id', solicitud.lead_id)
    if (errorLead) {
      return { error: `El reporte quedó aprobado pero no se pudo reclasificar: ${errorLead.message}` }
    }

    // Rastro en el timeline (autor null = sistema, patrón del sync).
    const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
      lead_id: solicitud.lead_id,
      autor_id: null,
      tipo: 'sistema',
      nota: `Reclasificado como corredor externo (aprobado por ${admin.nombre})`,
    })
    if (errorSeguimiento) {
      console.error('resolverReclasificacion: fallo el seguimiento, se omite', errorSeguimiento)
    }
  }

  // El solicitante se entera del desenlace (best-effort).
  try {
    await crearNotificacion(supabase, {
      destinatarioId: solicitud.solicitante_id,
      tipo: 'reclasificacion_resuelta',
      texto:
        decision === 'aprobada'
          ? `Aprobado: ${nombreLead} quedó marcado como corredor externo`
          : `Rechazado: ${nombreLead} sigue como cliente directo`,
      url: `/asesor/leads/${solicitud.lead_id}`,
    })
  } catch (e) {
    console.error('resolverReclasificacion: fallo la notificación, se omite', e)
  }

  revalidarFichas(solicitud.lead_id)
  return { ok: true }
}
