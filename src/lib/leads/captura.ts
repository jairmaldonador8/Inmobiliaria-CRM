/**
 * Captura de leads del sitio oficial de Montana (POST /api/leads/captura).
 *
 * Reutiliza la tuberia del sync de EasyBroker completa: dedup por evento y
 * por telefono/email, resolutor de guardias, seguimiento de sistema,
 * campanita + push. Un lead del sitio se comporta exactamente igual que uno
 * de portal; solo cambian la fuente ('sitio') y el origen del id de evento.
 *
 * Idempotencia: el sitio manda `solicitud_id` (unico por envio del
 * formulario). Se guarda como `easybroker_id = 'sitio:<solicitud_id>'` — esa
 * columna funciona como id del evento externo (ver FilaLead en mapeo.ts) y su
 * unique en la base hace inofensivo cualquier reintento del sitio: el mismo
 * envio dos veces regresa 'duplicado' sin crear nada.
 *
 * Recibe el SupabaseClient por parametro (mismo diseno que sync.ts): el route
 * pasa el admin client; los tests pasan el suyo. Sin 'server-only' aqui.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { normalizarTelefono, type FilaLead } from '@/lib/easybroker/mapeo'
import {
  buscarLeadExistente,
  contactRequestYaVisto,
  crearLeadNuevo,
  registrarConsultaRepetida,
} from '@/lib/easybroker/sync'

export interface SolicitudCapturaSitio {
  /** Id unico del envio (uuid generado por el sitio). Hace idempotente el reintento. */
  solicitud_id: string
  nombre: string
  telefono: string | null
  email: string | null
  mensaje: string | null
  /** public_id de EasyBroker de la propiedad consultada, si el formulario era de una ficha. */
  propiedad_easybroker_id: string | null
  /** Pagina o formulario de origen dentro del sitio (p. ej. "/propiedades/EB-123" o "contacto"). */
  pagina: string | null
}

/**
 * 'nuevo' = se creo el lead (con asignacion por guardia y notificaciones).
 * 'reingreso' = mismo telefono/email de un lead vivo: quedo como seguimiento.
 * 'duplicado' = este solicitud_id ya se habia procesado; no se hizo nada.
 */
export type ResultadoCapturaSitio = 'nuevo' | 'reingreso' | 'duplicado'

type Validacion =
  | { ok: true; solicitud: SolicitudCapturaSitio }
  | { ok: false; error: string }

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (!limpio) return null
  return limpio.slice(0, max)
}

/**
 * Valida y normaliza el payload crudo del sitio. Regla dura: sin telefono ni
 * email el lead seria incontactable — se rechaza para que el sitio marque el
 * error al visitante en vez de mandarnos un registro muerto.
 */
export function validarSolicitudCaptura(body: unknown): Validacion {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'el cuerpo debe ser un objeto JSON' }
  }
  const b = body as Record<string, unknown>

  const solicitudId = texto(b.solicitud_id, 120)
  if (!solicitudId) {
    return { ok: false, error: 'solicitud_id es requerido (id unico por envio, p. ej. un uuid)' }
  }

  const nombre = texto(b.nombre, 200)
  if (!nombre) {
    return { ok: false, error: 'nombre es requerido' }
  }

  const telefono = normalizarTelefono(typeof b.telefono === 'string' ? b.telefono : null)
  const email = texto(b.email, 200)?.toLowerCase() ?? null
  if (!telefono && !email) {
    return { ok: false, error: 'se requiere telefono o email para poder contactar al lead' }
  }

  return {
    ok: true,
    solicitud: {
      solicitud_id: solicitudId,
      nombre,
      telefono,
      email,
      mensaje: texto(b.mensaje, 5000),
      propiedad_easybroker_id: texto(b.propiedad_easybroker_id, 40),
      pagina: texto(b.pagina, 300),
    },
  }
}

/**
 * Procesa una solicitud YA validada, con el mismo orden que
 * procesarContactRequests: (1) ¿evento ya visto? -> duplicado; (2) ¿telefono/
 * email de un lead vivo? -> consulta repetida; (3) lead nuevo via
 * crearLeadNuevo (guardias + notificaciones incluidas). Lanza si la base
 * falla; el route lo traduce a 500.
 */
export async function capturarLeadSitio(
  supabase: SupabaseClient,
  solicitud: SolicitudCapturaSitio
): Promise<ResultadoCapturaSitio> {
  const eventoId = `sitio:${solicitud.solicitud_id}`
  if (await contactRequestYaVisto(supabase, eventoId)) return 'duplicado'

  let propiedad: { id: string; titulo: string; colonia: string | null; ciudad: string | null } | null =
    null
  if (solicitud.propiedad_easybroker_id) {
    const { data, error } = await supabase
      .from('propiedades')
      .select('id, titulo, colonia, ciudad')
      .eq('easybroker_id', solicitud.propiedad_easybroker_id)
      .maybeSingle()
    if (error) throw new Error(`consulta de propiedad: ${error.message}`)
    propiedad = data
  }

  const fila: FilaLead = {
    easybroker_id: eventoId,
    nombre: solicitud.nombre,
    telefono: solicitud.telefono,
    email: solicitud.email,
    fuente: 'sitio',
    fuente_detalle: solicitud.pagina ? `sitio Montana (${solicitud.pagina})` : 'sitio Montana',
    propiedad_eb_id: solicitud.propiedad_easybroker_id,
    contacto_eb_id: null,
    mensaje_original: solicitud.mensaje,
    creado_en: new Date().toISOString(),
  }

  const existente = await buscarLeadExistente(supabase, fila.telefono, fila.email)
  if (existente) {
    await registrarConsultaRepetida(supabase, existente, fila, propiedad)
    return 'reingreso'
  }

  const { data: agencia, error: agenciaError } = await supabase
    .from('agencias')
    .select('id')
    .limit(1)
    .single()
  if (agenciaError || !agencia) {
    throw new Error(`no se pudo resolver la agencia: ${agenciaError?.message ?? 'sin filas'}`)
  }

  // clasificacion_eb queda null a proposito: esa clasificacion (cliente
  // directo / co-broke / saliente) es semantica de EasyBroker; el canal ya
  // queda dicho por fuente='sitio'.
  const creado = await crearLeadNuevo(supabase, agencia.id, fila, propiedad, null)
  return creado ? 'nuevo' : 'duplicado'
}
