/**
 * Route de cron: dispara procesarRecordatorios() (follow-ups vencidos).
 *
 * pg_cron lo invoca cada 5 minutos (job recordatorios-5min; precisión ±5 min
 * aceptada — un recordatorio es una cita contigo mismo, no una alarma).
 * Auth fail-closed: exige `Authorization: Bearer <CRON_SECRET_RECORDATORIOS>`
 * (secret PROPIO, patrón del cron de escalamiento). Si la env var no está
 * configurada, se rechaza — no hay bypass silencioso.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { procesarRecordatorios } from '@/lib/recordatorios/cron'

export const maxDuration = 300

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET_RECORDATORIOS
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 })
  }

  const supabase = createAdminClient()
  const resultado = await procesarRecordatorios(supabase, new Date())

  console.log('[cron/recordatorios]', JSON.stringify(resultado))

  return Response.json({ ok: resultado.errores.length === 0, ...resultado }, { status: 200 })
}
