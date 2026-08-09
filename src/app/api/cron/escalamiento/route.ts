/**
 * Route de cron: dispara procesarEscalamientos() (leads sin contestar).
 *
 * pg_cron lo invoca cada 5 minutos (precisión ±5 min aceptada en el spec).
 * Auth fail-closed: exige `Authorization: Bearer <CRON_SECRET_ESCALAMIENTO>`
 * (secret PROPIO, distinto del de easybroker-sync). Si la env var no está
 * configurada, se rechaza — no hay bypass silencioso. Igual que el sync, el
 * proxy excluye `api/cron` de su matcher: esta ruta valida su propia
 * seguridad, nunca depende del proxy.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { procesarEscalamientos } from '@/lib/guardias/escalamiento'

export const maxDuration = 300

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET_ESCALAMIENTO
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 })
  }

  const supabase = createAdminClient()
  const resultado = await procesarEscalamientos(supabase, new Date())

  console.log('[cron/escalamiento]', JSON.stringify(resultado))

  return Response.json(
    { ok: resultado.errores.length === 0, ...resultado },
    { status: 200 }
  )
}
