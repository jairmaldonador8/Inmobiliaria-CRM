/**
 * Route de cron: dispara sincronizarEasyBroker() (propiedades + leads).
 *
 * Auth fail-closed: exige `Authorization: Bearer <CRON_SECRET>`. Si la env
 * var no esta configurada, se rechaza (no hay bypass silencioso). El proxy
 * (src/proxy.ts) excluye explicitamente `api/cron` de su matcher — Vercel
 * Cron no sigue redirects, asi que esta ruta NUNCA debe depender del proxy
 * para su seguridad; la valida este handler.
 *
 * IMPORTANTE (primer corrida en un ambiente nuevo): sincronizarEasyBroker
 * usa cursores por pagina (propiedades) y un lease de ejecucion unica de 5
 * min (ver src/lib/easybroker/sync.ts). Un catalogo grande puede no caber en
 * una sola invocacion de 300s: la corrida se corta, el cursor conserva el
 * progreso, y la proxima invocacion del cron continua donde se quedo. Por
 * eso la primera sincronizacion completa normalmente converge en 2-3
 * invocaciones (cada 15 min) antes de que sync_estado.ultimo_ok quede
 * poblado para 'propiedades' y 'leads' — un ultimo_ok ausente o viejo en las
 * primeras corridas NO es un error, es esperado.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEasyBroker } from '@/lib/easybroker/sync'

export const maxDuration = 300

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 })
  }

  // ?fase=leads = poll rapido (job pg_cron de cada minuto): solo contact
  // requests, sin propiedades ni estatus. Sin query string = sync completo
  // (job de cada 15 min), igual que siempre.
  const soloLeads = new URL(request.url).searchParams.get('fase') === 'leads'

  const supabase = createAdminClient()
  const resultado = await sincronizarEasyBroker(supabase, {}, { soloLeads })

  console.log('[cron/easybroker-sync]', JSON.stringify({ soloLeads, ...resultado }))

  return Response.json(
    { ok: resultado.errores.length === 0, ...resultado },
    { status: 200 }
  )
}
