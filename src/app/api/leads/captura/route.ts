/**
 * Captura de leads del sitio oficial de Montana (server-to-server).
 *
 * Auth fail-closed: exige `Authorization: Bearer <LEADS_CAPTURA_SECRET>`; si
 * la env var no esta configurada, se rechaza todo (mismo contrato que los
 * crons). El proxy (src/proxy.ts) excluye `api/leads/captura` de su matcher:
 * el backend del sitio llama sin cookies de sesion y la puerta es este
 * handler. NUNCA llamar este endpoint desde el navegador del visitante — el
 * secreto viviria en el bundle publico; el formulario postea al backend del
 * sitio y ese backend nos llama.
 *
 * Respuestas: 201 nuevo, 200 reingreso/duplicado (reintentar el mismo
 * solicitud_id es seguro), 400 payload invalido, 401 sin secreto, 500 error
 * interno (el sitio puede reintentar: la idempotencia lo hace inofensivo).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { capturarLeadSitio, validarSolicitudCaptura } from '@/lib/leads/captura'

export async function POST(request: Request) {
  const secreto = process.env.LEADS_CAPTURA_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'el cuerpo debe ser JSON valido' }, { status: 400 })
  }

  const validacion = validarSolicitudCaptura(body)
  if (!validacion.ok) {
    return Response.json({ ok: false, error: validacion.error }, { status: 400 })
  }

  try {
    const resultado = await capturarLeadSitio(createAdminClient(), validacion.solicitud)
    console.log(
      '[api/leads/captura]',
      JSON.stringify({ resultado, solicitud_id: validacion.solicitud.solicitud_id })
    )
    return Response.json({ ok: true, resultado }, { status: resultado === 'nuevo' ? 201 : 200 })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error('[api/leads/captura]', mensaje)
    // Mensaje generico hacia afuera: los detalles quedan en los logs.
    return Response.json({ ok: false, error: 'error interno' }, { status: 500 })
  }
}
