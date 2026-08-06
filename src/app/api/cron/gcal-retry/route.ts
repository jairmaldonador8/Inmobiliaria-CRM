/**
 * Route de cron: reintenta las visitas cuyo espejo a Google Calendar quedó
 * `pendiente` (Task 10 — cierra la garantía de la Task 8: una visita nunca
 * se pierde por un hipo de Google).
 *
 * Auth fail-closed: mismo bloque que `src/app/api/cron/easybroker-sync/route.ts`
 * — exige `Authorization: Bearer <CRON_SECRET>`; si la env var no está
 * configurada, se rechaza (sin bypass silencioso). `src/proxy.ts` excluye
 * `api/cron` de su matcher, así que esta ruta NUNCA depende del proxy para
 * su seguridad; la valida este handler.
 *
 * Responde SIEMPRE 200 (los errores del lote van en el body) para que
 * pg_net no registre la corrida como fallida por fallos parciales de un
 * lote — el detalle vive en `gcal_ultimo_error` por visita y en el log.
 *
 * IMPORTANTE: el job de pg_cron que llama a esta ruta se crea por SQL desde
 * el SQL editor de Supabase, NUNCA desde su UI de "Cron Jobs" (ese UI capa
 * `timeout_milliseconds` a 5000, insuficiente si el lote tarda más). Ver
 * README.md, sección "Cron de sincronización", para el SQL exacto.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { procesarPendientes } from '@/lib/google/retry'

export const maxDuration = 60

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 })
  }

  const supabase = createAdminClient()
  const resultado = await procesarPendientes(supabase)

  console.log('[cron/gcal-retry]', JSON.stringify(resultado))

  return Response.json({ ok: true, ...resultado }, { status: 200 })
}
