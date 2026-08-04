/**
 * Consultas de notificaciones del usuario en sesión.
 *
 * Cliente de SESIÓN en todo: RLS ya limita `notificaciones` a las filas
 * donde `destinatario_id = auth.uid()` — no hace falta filtrar a mano, y
 * funciona igual para admin que para asesor.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type NotificacionItem = {
  id: string
  tipo: string
  texto: string
  url: string | null
  leida: boolean
  creada_en: string
}

/** Últimas notificaciones del usuario en sesión, más recientes primero. */
export async function misNotificaciones(limite = 30): Promise<NotificacionItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, texto, url, leida, creada_en')
    .order('creada_en', { ascending: false })
    .limit(limite)

  if (error) throw new Error(`No se pudieron cargar las notificaciones: ${error.message}`)
  return data ?? []
}

/** Conteo de notificaciones sin leer del usuario en sesión (para la campana). */
export async function conteoNoLeidas(): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('leida', false)

  if (error) throw new Error(`No se pudo contar las notificaciones sin leer: ${error.message}`)
  return count ?? 0
}
