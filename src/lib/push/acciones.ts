'use server'

/**
 * Server actions de suscripción push: guardan/borran la fila de
 * `push_suscripciones` del usuario de la sesión actual. Siempre operan
 * "propio usuario" — RLS (migraciones 0002/0007) exige `usuario_id =
 * auth.uid()` también en la base, esto es defensa en profundidad, no la
 * única barrera.
 */

import { usuarioActual } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'

export interface SuscripcionPush {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Guarda (o actualiza) la suscripción push del usuario actual. Upsert por
 * `endpoint` (UNIQUE en la tabla): el mismo dispositivo que reabre la app
 * y ya tenía suscripción no crea una fila duplicada, solo refresca dueño
 * y user_agent.
 */
export async function guardarSuscripcion(sub: SuscripcionPush, userAgent?: string) {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Sin sesión' }

  const supabase = await createClient()
  const { error } = await supabase.from('push_suscripciones').upsert(
    {
      usuario_id: usuario.user_id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: 'endpoint' }
  )

  return error ? { error: 'No se pudo guardar la suscripción' } : {}
}

/** Borra la suscripción push del usuario actual por endpoint. */
export async function eliminarSuscripcion(endpoint: string) {
  const usuario = await usuarioActual()
  if (!usuario) return { error: 'Sin sesión' }

  const supabase = await createClient()
  await supabase.from('push_suscripciones').delete().eq('endpoint', endpoint)

  return {}
}
