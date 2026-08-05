import 'server-only'
import webpush, { WebPushError } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

import { vapidPublicKey } from '@/lib/env'
import { vapidPrivateKey, vapidSubject } from '@/lib/env-server'

export interface DatosPush {
  titulo: string
  cuerpo: string
  url?: string | null
}

/**
 * Envía Web Push a todas las suscripciones del destinatario. Best-effort:
 * NUNCA lanza (el push es un empujón; la campanita es la fuente de verdad).
 * Igual que crearNotificacion, recibe el cliente por DI (el cron pasa el
 * admin client). Poda suscripciones muertas (404/410) al vuelo.
 * SIEMPRE await: en Vercel un envío sin await muere al responder la función.
 *
 * El contrato "nunca lanza" cubre TODO el cuerpo, no solo sendNotification:
 * un try/catch exterior atrapa fallas de setup (VAPID/env/consulta) y
 * degrada a { enviados: 0 }; la poda de suscripciones muertas tiene su
 * propio try/catch interior para que un delete fallido no descarte el
 * conteo de envíos ya exitosos.
 */
export async function enviarPush(
  supabase: SupabaseClient,
  destinatarioId: string,
  { titulo, cuerpo, url }: DatosPush
): Promise<{ enviados: number }> {
  try {
    webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey())

    const { data: subs, error } = await supabase
      .from('push_suscripciones')
      .select('id, endpoint, p256dh, auth')
      .eq('usuario_id', destinatarioId)
    if (error) {
      console.error('enviarPush: fallo la consulta de suscripciones', error)
      return { enviados: 0 }
    }
    if (!subs || subs.length === 0) return { enviados: 0 }

    // iOS revoca la suscripción tras ~3 pushes sin notificación visible: el
    // SW SIEMPRE muestra showNotification con este payload.
    const payload = JSON.stringify({ title: titulo, body: cuerpo, data: { url: url ?? '/' } })

    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { urgency: 'high' }
        )
      )
    )

    const muertas = subs.filter((_, i) => {
      const r = resultados[i]
      return (
        r.status === 'rejected' &&
        r.reason instanceof WebPushError &&
        (r.reason.statusCode === 404 || r.reason.statusCode === 410)
      )
    })
    if (muertas.length > 0) {
      try {
        await supabase
          .from('push_suscripciones')
          .delete()
          .in('id', muertas.map((s) => s.id))
      } catch (err) {
        // Best-effort: si la poda falla no perdemos el conteo de envíos ya
        // exitosos. La siguiente corrida vuelve a intentar borrar la fila.
        console.error('enviarPush: no se pudo podar suscripciones muertas', err)
      }
    }

    return { enviados: resultados.filter((r) => r.status === 'fulfilled').length }
  } catch (err) {
    // Falla de setup (VAPID/env faltante, consulta que lanzó, etc.): el push
    // es un empujón, no la fuente de verdad — nunca debe tumbar al caller.
    console.error('enviarPush: fallo inesperado, se omite el envío', err)
    return { enviados: 0 }
  }
}
