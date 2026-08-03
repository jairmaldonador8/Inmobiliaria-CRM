/**
 * Sync idempotente EasyBroker -> Supabase (propiedades + leads con dedup).
 *
 * Diseno:
 *  - Recibe el SupabaseClient por PARAMETRO (inyeccion de dependencias): el
 *    cron route pasa el admin client (service-role); los tests pasan el suyo.
 *    Asi este modulo no importa 'server-only' y es testeable con vitest.
 *  - El fetching de EasyBroker tambien es inyectable (DepsSync) para que los
 *    tests de integracion usen fixtures sin tocar la red.
 *  - Cursores en sync_estado (recurso 'propiedades' / 'leads'):
 *      * propiedades: search[updated_after] + sort updated_at-asc. El cursor
 *        avanza DESPUES de cada pagina procesada con exito (una falla en la
 *        pagina N conserva el progreso de 1..N-1; seguro porque el orden es
 *        ascendente por updated_at).
 *      * leads: happened_after. El API no garantiza orden, asi que el cursor
 *        avanza SOLO al final de una corrida completamente exitosa (avanzarlo
 *        a la mitad podria saltarse contact requests de paginas no procesadas).
 *  - Idempotencia: upsert por easybroker_id en propiedades; en leads, dedup
 *    por easybroker_id (skip) y por telefono/email (consulta repetida ->
 *    seguimiento 'sistema' + notificacion, sin crear lead nuevo).
 *  - sincronizarEasyBroker nunca lanza: acumula en errores[] y registra
 *    ultimo_error / ultimo_ok en sync_estado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ebFetch, type PaginaEB, type ParamsEB } from '@/lib/easybroker/cliente'
import {
  mapearContactRequest,
  mapearPropiedadDetalle,
  mapearPropiedadLista,
  type ContactRequestEB,
  type PropiedadDetalleEB,
  type PropiedadListaEB,
} from '@/lib/easybroker/mapeo'
import { crearNotificacion, notificarAdmins } from '@/lib/notificaciones/crear'

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface ResultadoSync {
  propiedades: { procesadas: number; nuevas: number; actualizadas: number }
  leads: { procesados: number; nuevos: number; duplicados: number }
  errores: string[]
}

/** Dependencias inyectables (tests usan fixtures; el cron usa los defaults). */
export interface DepsSync {
  obtenerPagina?: (path: string, params?: ParamsEB) => Promise<PaginaEB<unknown>>
  obtenerDetalle?: (publicId: string) => Promise<PropiedadDetalleEB>
  maxPaginas?: number
}

export interface CtxPropiedades {
  agenciaId: string
  obtenerDetalle: (publicId: string) => Promise<PropiedadDetalleEB>
}

export interface CtxLeads {
  agenciaId: string
}

export interface ResultadoPaginaPropiedades {
  procesadas: number
  nuevas: number
  actualizadas: number
  /** Max updated_at (UTC ISO) de los items procesados con exito; null si ninguno. */
  maxActualizadaEb: string | null
  errores: string[]
}

export interface ResultadoContactRequests {
  procesados: number
  nuevos: number
  duplicados: number
  /** Max happened_at (UTC ISO) de los items procesados con exito; null si ninguno. */
  maxHappenedAt: string | null
  errores: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAUSA_ENTRE_PAGINAS_MS = 100

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function leerCursor(supabase: SupabaseClient, recurso: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_estado')
    .select('sync_cursor')
    .eq('recurso', recurso)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer sync_estado(${recurso}): ${error.message}`)
  return data?.sync_cursor ?? null
}

/** Avanza el cursor de un recurso (upsert por recurso). */
export async function avanzarCursor(
  supabase: SupabaseClient,
  recurso: string,
  cursor: string
): Promise<void> {
  const { error } = await supabase
    .from('sync_estado')
    .upsert(
      { recurso, sync_cursor: cursor, actualizado_en: new Date().toISOString() },
      { onConflict: 'recurso' }
    )
  if (error) throw new Error(`No se pudo avanzar el cursor de ${recurso}: ${error.message}`)
}

async function marcarOk(supabase: SupabaseClient, recurso: string): Promise<void> {
  const ahora = new Date().toISOString()
  const { error } = await supabase
    .from('sync_estado')
    .upsert(
      { recurso, ultimo_ok: ahora, ultimo_error: null, actualizado_en: ahora },
      { onConflict: 'recurso' }
    )
  if (error) throw new Error(`No se pudo marcar ultimo_ok de ${recurso}: ${error.message}`)
}

async function marcarError(
  supabase: SupabaseClient,
  recurso: string,
  mensaje: string
): Promise<void> {
  const { error } = await supabase
    .from('sync_estado')
    .upsert(
      { recurso, ultimo_error: mensaje.slice(0, 1000), actualizado_en: new Date().toISOString() },
      { onConflict: 'recurso' }
    )
  if (error) throw new Error(`No se pudo marcar ultimo_error de ${recurso}: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

/**
 * Procesa UNA pagina del listado de propiedades. Propiedad nueva -> se pide
 * el detalle y se inserta completa; existente -> se actualizan solo los campos
 * del listado (sin `fotos`: el listado solo trae la portada y pisaria la
 * galeria completa que dio el detalle al crearla).
 */
export async function procesarPaginaPropiedades(
  supabase: SupabaseClient,
  items: PropiedadListaEB[],
  ctx: CtxPropiedades
): Promise<ResultadoPaginaPropiedades> {
  const resultado: ResultadoPaginaPropiedades = {
    procesadas: 0,
    nuevas: 0,
    actualizadas: 0,
    maxActualizadaEb: null,
    errores: [],
  }
  if (items.length === 0) return resultado

  const { data: existentes, error: existentesError } = await supabase
    .from('propiedades')
    .select('easybroker_id')
    .in(
      'easybroker_id',
      items.map((item) => item.public_id)
    )
  if (existentesError) {
    resultado.errores.push(`consulta de propiedades existentes: ${existentesError.message}`)
    return resultado
  }
  const idsExistentes = new Set((existentes ?? []).map((fila) => fila.easybroker_id))

  for (const item of items) {
    try {
      const base = mapearPropiedadLista(item)
      const ahora = new Date().toISOString()

      if (!idsExistentes.has(base.easybroker_id)) {
        const detalle = mapearPropiedadDetalle(await ctx.obtenerDetalle(base.easybroker_id))
        const fotos = detalle.fotos.length > 0 ? detalle.fotos : base.fotos
        const { error } = await supabase
          .from('propiedades')
          // upsert (no insert) por si dos invocaciones del cron se traslapan.
          .upsert(
            { agencia_id: ctx.agenciaId, ...base, ...detalle, fotos, ultima_sync: ahora },
            { onConflict: 'easybroker_id' }
          )
        if (error) throw new Error(error.message)
        resultado.nuevas += 1
      } else {
        const { fotos: _fotos, ...camposLista } = base
        void _fotos
        const { error } = await supabase
          .from('propiedades')
          .update({ ...camposLista, ultima_sync: ahora })
          .eq('easybroker_id', base.easybroker_id)
        if (error) throw new Error(error.message)
        resultado.actualizadas += 1
      }

      resultado.procesadas += 1
      if (!resultado.maxActualizadaEb || base.actualizada_eb > resultado.maxActualizadaEb) {
        resultado.maxActualizadaEb = base.actualizada_eb
      }
    } catch (error) {
      resultado.errores.push(`propiedad ${item.public_id}: ${mensajeDe(error)}`)
    }
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Leads (contact requests)
// ---------------------------------------------------------------------------

interface PropiedadResuelta {
  id: string
  titulo: string
  colonia: string | null
  ciudad: string | null
}

interface LeadExistente {
  id: string
  nombre: string
  asesor_id: string | null
}

/**
 * Procesa un lote de contact requests con dedup:
 *  1. easybroker_id ya visto -> skip (duplicado).
 *  2. mismo telefono o email en un lead NO archivado -> consulta repetida:
 *     seguimiento 'sistema' + notificacion (asesor asignado, o admins si esta
 *     en bandeja); no se crea lead.
 *  3. si no -> lead nuevo en bandeja (asesor null) + notificacion a admins.
 */
export async function procesarContactRequests(
  supabase: SupabaseClient,
  crs: ContactRequestEB[],
  ctx: CtxLeads
): Promise<ResultadoContactRequests> {
  const resultado: ResultadoContactRequests = {
    procesados: 0,
    nuevos: 0,
    duplicados: 0,
    maxHappenedAt: null,
    errores: [],
  }

  for (const cr of crs) {
    try {
      const fila = mapearContactRequest(cr)

      // 1. Dedup por easybroker_id (incluye leads archivados: reprocesar el
      // mismo contact request jamas debe crear nada).
      const { data: porEbId, error: porEbIdError } = await supabase
        .from('leads')
        .select('id')
        .eq('easybroker_id', fila.easybroker_id)
        .maybeSingle()
      if (porEbIdError) throw new Error(porEbIdError.message)

      if (porEbId) {
        resultado.duplicados += 1
      } else {
        // Resolver la propiedad referida (puede no existir en nuestro catalogo).
        let propiedad: PropiedadResuelta | null = null
        if (fila.propiedad_eb_id) {
          const { data, error } = await supabase
            .from('propiedades')
            .select('id, titulo, colonia, ciudad')
            .eq('easybroker_id', fila.propiedad_eb_id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          propiedad = data
        }

        // 2. Dedup por telefono / email entre leads no archivados.
        const condiciones: string[] = []
        if (fila.telefono) condiciones.push(`telefono.eq.${fila.telefono}`)
        if (fila.email) condiciones.push(`email.eq.${fila.email}`)

        let existente: LeadExistente | null = null
        if (condiciones.length > 0) {
          const { data, error } = await supabase
            .from('leads')
            .select('id, nombre, asesor_id')
            .eq('archivado', false)
            .or(condiciones.join(','))
            .order('creado_en', { ascending: false })
            .limit(1)
          if (error) throw new Error(error.message)
          existente = data?.[0] ?? null
        }

        if (existente) {
          await registrarConsultaRepetida(supabase, existente, fila.fuente_detalle, propiedad, fila.propiedad_eb_id)
          resultado.duplicados += 1
        } else {
          await crearLeadEnBandeja(supabase, ctx.agenciaId, fila, propiedad)
          resultado.nuevos += 1
        }
      }

      resultado.procesados += 1
      if (!resultado.maxHappenedAt || fila.creado_en > resultado.maxHappenedAt) {
        resultado.maxHappenedAt = fila.creado_en
      }
    } catch (error) {
      resultado.errores.push(`contact request ${cr.id}: ${mensajeDe(error)}`)
    }
  }
  return resultado
}

async function registrarConsultaRepetida(
  supabase: SupabaseClient,
  existente: LeadExistente,
  source: string | null,
  propiedad: PropiedadResuelta | null,
  propiedadEbId: string | null
): Promise<void> {
  const referencia = propiedad?.titulo ?? propiedadEbId
  const via = source ?? 'portal'
  const nota = referencia
    ? `El lead volvió a preguntar por la propiedad ${referencia} vía ${via}`
    : `El lead volvió a preguntar vía ${via}`

  const { error } = await supabase.from('seguimientos').insert({
    lead_id: existente.id,
    autor_id: null, // generado por el sistema
    tipo: 'sistema',
    propiedad_id: propiedad?.id ?? null,
    nota,
  })
  if (error) throw new Error(`seguimiento de consulta repetida: ${error.message}`)

  const sufijo = referencia ? ` por ${referencia}` : ''
  if (existente.asesor_id) {
    await crearNotificacion(supabase, {
      destinatarioId: existente.asesor_id,
      tipo: 'lead_reingreso',
      texto: `Tu lead ${existente.nombre} volvió a preguntar${sufijo} vía ${via}`,
      url: '/asesor/leads',
    })
  } else {
    await notificarAdmins(supabase, {
      tipo: 'lead_reingreso',
      texto: `El lead ${existente.nombre} (en bandeja) volvió a preguntar${sufijo} vía ${via}`,
      url: '/admin/bandeja',
    })
  }
}

async function crearLeadEnBandeja(
  supabase: SupabaseClient,
  agenciaId: string,
  fila: ReturnType<typeof mapearContactRequest>,
  propiedad: PropiedadResuelta | null
): Promise<void> {
  const { error } = await supabase.from('leads').insert({
    agencia_id: agenciaId,
    nombre: fila.nombre,
    telefono: fila.telefono,
    email: fila.email,
    fuente: fila.fuente,
    fuente_detalle: fila.fuente_detalle,
    propiedad_id: propiedad?.id ?? null,
    asesor_id: null, // bandeja: lo asigna un admin
    zona_interes: propiedad ? (propiedad.colonia ?? propiedad.ciudad) : null,
    easybroker_id: fila.easybroker_id,
    mensaje_original: fila.mensaje_original,
    creado_en: fila.creado_en, // happened_at real del contact request (UTC)
  })
  if (error) throw new Error(`insert de lead nuevo: ${error.message}`)

  await notificarAdmins(supabase, {
    tipo: 'lead_nuevo',
    texto: `Nuevo lead: ${fila.nombre} — ${fila.fuente_detalle ?? 'portal'}`,
    url: '/admin/bandeja',
  })
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

/**
 * Corre el sync completo (propiedades y luego leads). Nunca lanza: los
 * errores quedan en el resultado y en sync_estado.ultimo_error.
 */
export async function sincronizarEasyBroker(
  supabase: SupabaseClient,
  deps: DepsSync = {}
): Promise<ResultadoSync> {
  const obtenerPagina =
    deps.obtenerPagina ?? ((path: string, params?: ParamsEB) => ebFetch<PaginaEB<unknown>>(path, params))
  const obtenerDetalle =
    deps.obtenerDetalle ?? ((publicId: string) => ebFetch<PropiedadDetalleEB>(`/v1/properties/${publicId}`))
  const maxPaginas = deps.maxPaginas ?? Infinity

  const resultado: ResultadoSync = {
    propiedades: { procesadas: 0, nuevas: 0, actualizadas: 0 },
    leads: { procesados: 0, nuevos: 0, duplicados: 0 },
    errores: [],
  }

  const { data: agencia, error: agenciaError } = await supabase
    .from('agencias')
    .select('id')
    .limit(1)
    .single()
  if (agenciaError || !agencia) {
    resultado.errores.push(`no se pudo resolver la agencia: ${agenciaError?.message ?? 'sin filas'}`)
    return resultado
  }
  const agenciaId: string = agencia.id

  // --- Propiedades: cursor por pagina (orden updated_at-asc lo hace seguro) ---
  try {
    const cursor = await leerCursor(supabase, 'propiedades')
    const params: ParamsEB = { limit: 50, 'search[sort_by]': 'updated_at-asc' }
    if (cursor) params['search[updated_after]'] = cursor

    let pagina = (await obtenerPagina('/v1/properties', params)) as PaginaEB<PropiedadListaEB>
    let paginasLeidas = 1
    let falloEnPagina = false

    for (;;) {
      const r = await procesarPaginaPropiedades(supabase, pagina.content, { agenciaId, obtenerDetalle })
      resultado.propiedades.procesadas += r.procesadas
      resultado.propiedades.nuevas += r.nuevas
      resultado.propiedades.actualizadas += r.actualizadas

      if (r.errores.length > 0) {
        // No se avanza el cursor de una pagina con fallas: sus items se
        // reintentan en la proxima corrida.
        resultado.errores.push(...r.errores)
        falloEnPagina = true
        break
      }
      if (r.maxActualizadaEb) await avanzarCursor(supabase, 'propiedades', r.maxActualizadaEb)

      if (!pagina.pagination.next_page || paginasLeidas >= maxPaginas) break
      await pausa(PAUSA_ENTRE_PAGINAS_MS)
      pagina = (await obtenerPagina(pagina.pagination.next_page)) as PaginaEB<PropiedadListaEB>
      paginasLeidas += 1
    }

    if (falloEnPagina) {
      await marcarError(supabase, 'propiedades', resultado.errores.join('; '))
    } else {
      await marcarOk(supabase, 'propiedades')
    }
  } catch (error) {
    const mensaje = `sync propiedades: ${mensajeDe(error)}`
    resultado.errores.push(mensaje)
    await marcarError(supabase, 'propiedades', mensaje).catch(() => {})
  }

  // --- Leads: cursor solo al final (el orden de contact_requests no esta garantizado) ---
  try {
    const cursor = await leerCursor(supabase, 'leads')
    const params: ParamsEB = { limit: 50 }
    if (cursor) params.happened_after = cursor // filtro top-level, NO search[...]

    let pagina = (await obtenerPagina('/v1/contact_requests', params)) as PaginaEB<ContactRequestEB>
    let paginasLeidas = 1
    let maxHappenedAt: string | null = null
    let fallo = false

    for (;;) {
      const r = await procesarContactRequests(supabase, pagina.content, { agenciaId })
      resultado.leads.procesados += r.procesados
      resultado.leads.nuevos += r.nuevos
      resultado.leads.duplicados += r.duplicados

      if (r.errores.length > 0) {
        resultado.errores.push(...r.errores)
        fallo = true
        break
      }
      if (r.maxHappenedAt && (!maxHappenedAt || r.maxHappenedAt > maxHappenedAt)) {
        maxHappenedAt = r.maxHappenedAt
      }

      if (!pagina.pagination.next_page || paginasLeidas >= maxPaginas) break
      await pausa(PAUSA_ENTRE_PAGINAS_MS)
      pagina = (await obtenerPagina(pagina.pagination.next_page)) as PaginaEB<ContactRequestEB>
      paginasLeidas += 1
    }

    if (fallo) {
      await marcarError(supabase, 'leads', resultado.errores.join('; '))
    } else {
      if (maxHappenedAt) await avanzarCursor(supabase, 'leads', maxHappenedAt)
      await marcarOk(supabase, 'leads')
    }
  } catch (error) {
    const mensaje = `sync leads: ${mensajeDe(error)}`
    resultado.errores.push(mensaje)
    await marcarError(supabase, 'leads', mensaje).catch(() => {})
  }

  return resultado
}
