'use server'

/**
 * Server Actions sobre las notificaciones del usuario en sesión.
 *
 * Cliente de SESIÓN, nunca service-role: RLS + column grant («solo se
 * puede marcar leida», ver 0002_rls.sql) son quienes garantizan que un
 * usuario solo pueda tocar sus propias notificaciones. Compartidas por
 * admin y asesor — no dependen de un rol específico.
 */

import { revalidatePath } from 'next/cache'

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'

export type ResultadoAccionNotificacion = { ok: true } | { error: string }

function revalidarPantallasNotificaciones() {
  revalidatePath('/asesor', 'layout')
  revalidatePath('/admin', 'layout')
}

/** Marca una notificación propia como leída. */
export async function marcarLeida(id: string): Promise<ResultadoAccionNotificacion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'No autorizado' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', id)
    .eq('leida', false)

  if (error) return { error: 'No se pudo marcar como leída' }

  revalidarPantallasNotificaciones()
  return { ok: true }
}

/** Marca TODAS las notificaciones propias como leídas. */
export async function marcarTodasLeidas(): Promise<ResultadoAccionNotificacion> {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'No autorizado' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('leida', false)

  if (error) return { error: 'No se pudieron marcar como leídas' }

  revalidarPantallasNotificaciones()
  return { ok: true }
}
