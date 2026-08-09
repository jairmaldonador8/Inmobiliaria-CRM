/**
 * Sync idempotente EasyBroker -> Supabase (propiedades + leads con dedup).
 *
 * Diseno:
 *  - Recibe el SupabaseClient por PARAMETRO (inyeccion de dependencias): el
 *    cron route pasa el admin client (service-role); los tests pasan el suyo.
 *    Asi este modulo no importa 'server-only' y es testeable con vitest.
 *  - El fetching de EasyBroker tambien es inyectable (DepsSync) para que los
 *    tests de integracion usen fixtures sin tocar la red.
 *  - Lease de ejecucion unica: sync_estado (fila recurso='lock', columna
 *    lock_until) actua como lock con expiracion de 5 min. Una invocacion
 *    concurrente (Vercel Cron puede duplicar invocaciones) no corre: regresa
 *    de inmediato con omitido=true.
 *  - Cursores en sync_estado (recurso 'propiedades' / 'leads'):
 *      * propiedades: search[updated_after] + sort updated_at-asc. El cursor
 *        avanza DESPUES de cada pagina procesada con exito (una falla en la
 *        pagina N conserva el progreso de 1..N-1; seguro porque el orden es
 *        ascendente por updated_at).
 *      * leads: happened_after. El API no garantiza orden, asi que el cursor
 *        avanza SOLO al final de una corrida completamente exitosa (avanzarlo
 *        a la mitad podria saltarse contact requests de paginas no procesadas).
 *  - Tercera fase, 'estatus' (recurso propio en sync_estado, SIN cursor): el
 *    listado de propiedades no trae `status` y EasyBroker no manda eventos de
 *    borrado, asi que la unica forma confiable de saber si una propiedad
 *    sigue publicada -o si desaparecio del catalogo alla- es una pasada
 *    COMPLETA de /v1/listing_statuses (paginado, limit 100) cruzada contra
 *    `propiedades`. Cadencia: CADA corrida del sync (no una cadencia
 *    separada) porque es barata -para el catalogo real (~177 propiedades) son
 *    ~2 paginas, y hasta para el catalogo de staging (~1,474) son ~15- muy
 *    por debajo del rate limit (20 req/s) y del maxDuration=300s del cron. Si
 *    el catalogo creciera al punto de que esto pesara, desacoplar la cadencia
 *    (ultimo_ok de 'estatus' con antiguedad minima) seria el siguiente paso;
 *    hoy no se justifica la complejidad extra. Ver reconciliarEstatusPropiedades.
 *  - Idempotencia: upsert por easybroker_id en propiedades. En leads, dedup
 *    por easybroker_id tanto en `leads` como en `seguimientos` (un reingreso
 *    ya registrado no se repite), y por telefono/email (consulta repetida ->
 *    seguimiento 'sistema' + notificacion, sin crear lead nuevo). Las
 *    violaciones de unicidad 23505 (carrera entre corridas traslapadas) se
 *    tratan como duplicado y se saltan sin notificar.
 *  - Invariante de producto (decision de review): la BANDEJA es la fuente
 *    autoritativa de leads nuevos; las notificaciones son best-effort. Si una
 *    notificacion falla o se pierde, el lead sigue visible en /admin/bandeja
 *    — no hay trigger ni transaccion que las garantice, a proposito.
 *  - sincronizarEasyBroker nunca lanza: acumula en errores[] y registra
 *    ultimo_error / ultimo_ok en sync_estado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ebFetch, pausa, PAUSA_ENTRE_PAGINAS_MS, type PaginaEB, type ParamsEB } from '@/lib/easybroker/cliente'
import {
  clasificarContactRequest,
  estatusEsActivo,
  mapearContactRequest,
  mapearPropiedadDetalle,
  mapearPropiedadLista,
  type ClasificacionLeadEB,
  type ContactoEB,
  type ContactRequestEB,
  type ListingStatusEB,
  type PropiedadDetalleEB,
  type PropiedadListaEB,
} from '@/lib/easybroker/mapeo'
import { crearNotificacion, notificarAdmins } from '@/lib/notificaciones/crear'
import { enviarPush } from '@/lib/push/enviar'
import { resolverAsignacion, type DecisionAsignacion } from '@/lib/guardias/resolutor'

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

/** Contadores de clasificacion de leads NUEVOS (ver mapeo.clasificarContactRequest). */
export interface ContadoresClasificacionEB {
  clienteDirecto: number
  coBroke: number
  saliente: number
  /** No se pudo determinar: llamada a /v1/contacts fallo, o sin property_id/contact_id. */
  sinClasificar: number
}

function contadoresClasificacionVacios(): ContadoresClasificacionEB {
  return { clienteDirecto: 0, coBroke: 0, saliente: 0, sinClasificar: 0 }
}

export interface ResultadoSync {
  propiedades: { procesadas: number; nuevas: number; actualizadas: number }
  leads: {
    procesados: number
    nuevos: number
    duplicados: number
    porClasificacion: ContadoresClasificacionEB
  }
  estatus: {
    procesadas: number
    cambiosEstatus: number
    desactivadas: number
    reactivadas: number
    ausentes: number
    /** false si la pasada de listing_statuses se corto (maxPaginas/error): no se evaluaron bajas. */
    catalogoCompleto: boolean
  }
  errores: string[]
  /** true si la corrida no se ejecuto (otra invocacion tiene el lease). */
  omitido: boolean
}

/** Dependencias inyectables (tests usan fixtures; el cron usa los defaults). */
export interface DepsSync {
  obtenerPagina?: (path: string, params?: ParamsEB) => Promise<PaginaEB<unknown>>
  obtenerDetalle?: (publicId: string) => Promise<PropiedadDetalleEB>
  /** GET /v1/contacts/{contact_id} — usado solo para clasificar leads nuevos. */
  obtenerContacto?: (contactId: number) => Promise<ContactoEB>
  maxPaginas?: number
}

export interface CtxPropiedades {
  agenciaId: string
  obtenerDetalle: (publicId: string) => Promise<PropiedadDetalleEB>
}

export interface CtxLeads {
  agenciaId: string
  obtenerContacto: (contactId: number) => Promise<ContactoEB>
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
  /** Solo cuenta clasificacion de leads NUEVOS (duplicados/consultas repetidas no se re-clasifican). */
  porClasificacion: ContadoresClasificacionEB
  /** Max happened_at (UTC ISO) de los items procesados con exito; null si ninguno. */
  maxHappenedAt: string | null
  errores: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pausa entre fetches de detalle (N+1) para respetar el rate limit de EB. */
const PAUSA_ENTRE_DETALLES_MS = 75

/** Codigo Postgres de violacion de unicidad. */
const UNIQUE_VIOLATION = '23505'

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
// Lease de ejecucion unica (fila recurso='lock' en sync_estado)
// ---------------------------------------------------------------------------

const RECURSO_LOCK = 'lock'
const LEASE_MS = 5 * 60_000

/**
 * Intenta adquirir el lease con un UPDATE condicional atomico: solo gana la
 * invocacion cuyo WHERE (lock libre o expirado) siga cumpliendose al tomar el
 * row lock en Postgres. Devuelve true si se adquirio.
 */
async function adquirirLease(supabase: SupabaseClient): Promise<boolean> {
  // Asegurar que la fila 'lock' exista (ignoreDuplicates: no pisa lock_until).
  const { error: upsertError } = await supabase
    .from('sync_estado')
    .upsert({ recurso: RECURSO_LOCK }, { onConflict: 'recurso', ignoreDuplicates: true })
  if (upsertError) throw new Error(`No se pudo asegurar la fila de lock: ${upsertError.message}`)

  const ahora = new Date().toISOString()
  const { data, error } = await supabase
    .from('sync_estado')
    .update({
      lock_until: new Date(Date.now() + LEASE_MS).toISOString(),
      actualizado_en: ahora,
    })
    .eq('recurso', RECURSO_LOCK)
    .or(`lock_until.is.null,lock_until.lt.${ahora}`)
    .select('recurso')
  if (error) throw new Error(`No se pudo adquirir el lease de sync: ${error.message}`)
  return (data ?? []).length > 0
}

async function liberarLease(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from('sync_estado')
    .update({ lock_until: null, actualizado_en: new Date().toISOString() })
    .eq('recurso', RECURSO_LOCK)
  if (error) throw new Error(`No se pudo liberar el lease de sync: ${error.message}`)
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
        // Rate limit: el detalle es un request extra por item nuevo.
        await pausa(PAUSA_ENTRE_DETALLES_MS)
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
// Estatus (reconciliacion completa contra /v1/listing_statuses)
// ---------------------------------------------------------------------------

export interface PropiedadEstatusActual {
  id: string
  easybroker_id: string
  estatus: string
  activa: boolean
}

export interface ResultadoReconciliacionEstatus {
  procesadas: number
  cambiosEstatus: number
  desactivadas: number
  reactivadas: number
  ausentes: number
  errores: string[]
}

/**
 * Reconcilia estatus/activa de un lote de propiedades YA cargado contra el
 * mapa easybroker_id -> status de /v1/listing_statuses.
 *
 * `catalogoCompleto` indica si `estatusPorId` viene de una pasada COMPLETA
 * (sin cortes por maxPaginas ni errores). Si es false, las propiedades NO
 * encontradas en el mapa se dejan intactas a proposito: con una pasada
 * parcial no hay forma de distinguir "todavia no llegamos a su pagina" de
 * "ya no existe en EB", y desactivar por error seria peor que el bug
 * original. Las SI encontradas en el mapa se actualizan siempre — su estatus
 * es cierto sin importar cuantas paginas mas falten.
 *
 * Nunca borra filas: una propiedad ausente del catalogo de EB puede seguir
 * referenciada por leads y por seguimientos (append-only), asi que solo se
 * le apaga `activa`.
 */
export async function reconciliarEstatusPropiedades(
  supabase: SupabaseClient,
  propiedades: PropiedadEstatusActual[],
  estatusPorId: Map<string, string>,
  catalogoCompleto: boolean
): Promise<ResultadoReconciliacionEstatus> {
  const resultado: ResultadoReconciliacionEstatus = {
    procesadas: 0,
    cambiosEstatus: 0,
    desactivadas: 0,
    reactivadas: 0,
    ausentes: 0,
    errores: [],
  }

  for (const fila of propiedades) {
    try {
      const statusEb = estatusPorId.get(fila.easybroker_id)

      if (statusEb === undefined) {
        if (catalogoCompleto) {
          resultado.ausentes += 1
          if (fila.activa) {
            const { error } = await supabase
              .from('propiedades')
              .update({ activa: false })
              .eq('id', fila.id)
            if (error) throw new Error(error.message)
            resultado.desactivadas += 1
          }
          resultado.procesadas += 1
        }
        // catalogo incompleto: no se toca esta propiedad en esta corrida.
        continue
      }

      const nuevaActiva = estatusEsActivo(statusEb)
      if (statusEb !== fila.estatus || nuevaActiva !== fila.activa) {
        const { error } = await supabase
          .from('propiedades')
          .update({ estatus: statusEb, activa: nuevaActiva })
          .eq('id', fila.id)
        if (error) throw new Error(error.message)
        if (statusEb !== fila.estatus) resultado.cambiosEstatus += 1
        if (fila.activa && !nuevaActiva) resultado.desactivadas += 1
        if (!fila.activa && nuevaActiva) resultado.reactivadas += 1
      }
      resultado.procesadas += 1
    } catch (error) {
      resultado.errores.push(`propiedad ${fila.easybroker_id}: ${mensajeDe(error)}`)
    }
  }

  return resultado
}

/**
 * Trae TODO /v1/listing_statuses paginado (limit 100). `completo` exige DOS
 * cosas: (a) se llego a next_page=null de forma natural (no por agotar
 * maxPaginas ni por un error), y (b) el mapa no quedo vacio. (b) es una
 * salvaguarda a proposito: una respuesta vacia con next_page=null (API rota,
 * catalogo real vacio, o un fetcher de test que no conoce este endpoint) NO
 * debe interpretarse como "EasyBroker ya no tiene ninguna propiedad" —
 * desactivar TODO el catalogo por una respuesta asi seria mucho peor que el
 * bug que esto corrige. Solo con `completo=true` reconciliarEstatusPropiedades
 * marca bajas (`activa=false` por ausencia).
 */
async function obtenerMapaEstatusEB(
  obtenerPagina: (path: string, params?: ParamsEB) => Promise<PaginaEB<unknown>>,
  maxPaginas: number
): Promise<{ estatusPorId: Map<string, string>; completo: boolean }> {
  const estatusPorId = new Map<string, string>()

  let pagina = (await obtenerPagina('/v1/listing_statuses', { limit: 100 })) as PaginaEB<ListingStatusEB>
  let paginasLeidas = 1
  for (const item of pagina.content) estatusPorId.set(item.public_id, item.status)

  while (pagina.pagination.next_page && paginasLeidas < maxPaginas) {
    await pausa(PAUSA_ENTRE_PAGINAS_MS)
    pagina = (await obtenerPagina(pagina.pagination.next_page)) as PaginaEB<ListingStatusEB>
    paginasLeidas += 1
    for (const item of pagina.content) estatusPorId.set(item.public_id, item.status)
  }

  return { estatusPorId, completo: !pagina.pagination.next_page && estatusPorId.size > 0 }
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
  creado_en: string
}

/**
 * ¿Este contact request ya se registro antes? Se checa contra leads (creo un
 * lead nuevo) Y contra seguimientos (registro una consulta repetida).
 */
async function contactRequestYaVisto(
  supabase: SupabaseClient,
  easybrokerId: string
): Promise<boolean> {
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('easybroker_id', easybrokerId)
    .maybeSingle()
  if (leadError) throw new Error(leadError.message)
  if (lead) return true

  const { data: seguimiento, error: seguimientoError } = await supabase
    .from('seguimientos')
    .select('id')
    .eq('easybroker_id', easybrokerId)
    .maybeSingle()
  if (seguimientoError) throw new Error(seguimientoError.message)
  return seguimiento !== null
}

/**
 * Busca un lead NO archivado con el mismo telefono o el mismo email, con DOS
 * queries indexadas separadas (nunca .or(): un email con comas/parentesis
 * romperia la sintaxis de filtros de PostgREST). Gana el match mas reciente.
 */
async function buscarLeadExistente(
  supabase: SupabaseClient,
  telefono: string | null,
  email: string | null
): Promise<LeadExistente | null> {
  const candidatos: LeadExistente[] = []

  if (telefono) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, nombre, asesor_id, creado_en')
      .eq('archivado', false)
      .eq('telefono', telefono)
      .order('creado_en', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    if (data?.[0]) candidatos.push(data[0])
  }

  if (email) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, nombre, asesor_id, creado_en')
      .eq('archivado', false)
      .eq('email', email)
      .order('creado_en', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    if (data?.[0] && !candidatos.some((c) => c.id === data[0].id)) candidatos.push(data[0])
  }

  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
  return candidatos[0]
}

/**
 * Clasifica un lead NUEVO (ver mapeo.clasificarContactRequest):
 *  - propiedad ajena (no encontrada en catalogo local) -> 'saliente', SIN
 *    pedir el contacto (ya se sabe la respuesta, se ahorra un request).
 *  - sin property_id en el contact request -> null (sin clasificar): no hay
 *    suficiente informacion para aplicar ninguna de las 3 reglas.
 *  - propiedad nuestra -> requiere el tag del contacto: GET /v1/contacts/{id}.
 *    Sin contact_id, o si esa llamada falla, se deja sin clasificar (null) y
 *    NO se propaga el error (no debe tumbar el sync ni la pagina completa).
 */
async function clasificarLeadNuevo(
  ctx: CtxLeads,
  fila: ReturnType<typeof mapearContactRequest>,
  propiedad: PropiedadResuelta | null
): Promise<ClasificacionLeadEB | null> {
  if (!fila.propiedad_eb_id) return null
  if (!propiedad) return clasificarContactRequest(false, null) // 'saliente'
  if (!fila.contacto_eb_id) return null

  await pausa(PAUSA_ENTRE_DETALLES_MS) // rate limit: 1 request extra por lead nuevo
  try {
    const contacto = await ctx.obtenerContacto(fila.contacto_eb_id)
    return clasificarContactRequest(true, contacto.tags ?? [])
  } catch {
    return null // GET /v1/contacts fallo: el lead se guarda sin clasificar.
  }
}

function acumularClasificacion(
  contadores: ContadoresClasificacionEB,
  clasificacion: ClasificacionLeadEB | null
): void {
  if (clasificacion === 'cliente_directo') contadores.clienteDirecto += 1
  else if (clasificacion === 'co_broke') contadores.coBroke += 1
  else if (clasificacion === 'saliente') contadores.saliente += 1
  else contadores.sinClasificar += 1
}

/**
 * Procesa un lote de contact requests con dedup:
 *  1. easybroker_id ya visto (en leads O en seguimientos) -> skip (duplicado).
 *  2. mismo telefono o email en un lead NO archivado -> consulta repetida:
 *     seguimiento 'sistema' (marcado con el easybroker_id del contact request)
 *     + notificacion (asesor asignado, o admins si esta en bandeja); no se
 *     crea lead (y no se clasifica: la clasificacion es del lead nuevo).
 *  3. si no -> se clasifica (clasificarLeadNuevo) y se crea lead nuevo en
 *     bandeja (asesor null) + notificacion a admins.
 * En 2 y 3, una violacion de unicidad 23505 (carrera con una corrida
 * traslapada) cuenta como duplicado y NO notifica.
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
    porClasificacion: contadoresClasificacionVacios(),
    maxHappenedAt: null,
    errores: [],
  }

  for (const cr of crs) {
    try {
      const fila = mapearContactRequest(cr)
      let esNuevo = false
      let clasificacion: ClasificacionLeadEB | null = null

      if (!(await contactRequestYaVisto(supabase, fila.easybroker_id))) {
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

        const existente = await buscarLeadExistente(supabase, fila.telefono, fila.email)
        if (existente) {
          await registrarConsultaRepetida(supabase, existente, fila, propiedad)
          // esNuevo queda false: la consulta repetida cuenta como duplicado.
        } else {
          clasificacion = await clasificarLeadNuevo(ctx, fila, propiedad)
          esNuevo = await crearLeadNuevo(supabase, ctx.agenciaId, fila, propiedad, clasificacion)
        }
      }

      if (esNuevo) {
        resultado.nuevos += 1
        acumularClasificacion(resultado.porClasificacion, clasificacion)
      } else {
        resultado.duplicados += 1
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
  fila: ReturnType<typeof mapearContactRequest>,
  propiedad: PropiedadResuelta | null
): Promise<void> {
  const referencia = propiedad?.titulo ?? fila.propiedad_eb_id
  const via = fila.fuente_detalle ?? 'portal'
  const nota = referencia
    ? `El lead volvió a preguntar por la propiedad ${referencia} vía ${via}`
    : `El lead volvió a preguntar vía ${via}`

  const { error } = await supabase.from('seguimientos').insert({
    lead_id: existente.id,
    autor_id: null, // generado por el sistema
    tipo: 'sistema',
    propiedad_id: propiedad?.id ?? null,
    nota,
    easybroker_id: fila.easybroker_id, // unique: hace idempotente el reingreso
  })
  if (error) {
    // Otra corrida ya registro este contact request: duplicado, no notificar.
    if (error.code === UNIQUE_VIOLATION) return
    throw new Error(`seguimiento de consulta repetida: ${error.message}`)
  }

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

/**
 * Crea el lead nuevo aplicando el resolutor de guardias (Fase B): VIP →
 * dueño, guardia activa → asesor de guardia, fuera de horario → siguiente
 * guardia con reloj diferido, sin rol → bandeja como siempre.
 *
 * Si el resolutor LANZA por cualquier razón, el lead cae a bandeja y se
 * alerta a admins — el sync jamás pierde un lead por las guardias.
 *
 * Devuelve true si el lead se creo; false si otra corrida gano la carrera
 * (23505). Exportada para tests unitarios (guardias-sync.test.ts).
 */
export async function crearLeadNuevo(
  supabase: SupabaseClient,
  agenciaId: string,
  fila: ReturnType<typeof mapearContactRequest>,
  propiedad: PropiedadResuelta | null,
  clasificacionEb: ClasificacionLeadEB | null,
  ahora: Date = new Date()
): Promise<boolean> {
  let decision: DecisionAsignacion = { tipo: 'bandeja' }
  let falloResolutor: string | null = null
  try {
    ;({ decision } = await resolverAsignacion(supabase, propiedad?.id ?? null, ahora))
  } catch (error) {
    falloResolutor = mensajeDe(error)
  }

  const asignado = decision.tipo !== 'bandeja'
  const { data: creado, error } = await supabase
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: fila.nombre,
      telefono: fila.telefono,
      email: fila.email,
      fuente: fila.fuente,
      fuente_detalle: fila.fuente_detalle,
      propiedad_id: propiedad?.id ?? null,
      asesor_id: asignado ? decision.asesorId : null,
      asignado_en: asignado ? ahora.toISOString() : null,
      escalamiento_desde: asignado ? decision.escalamientoDesde : null,
      zona_interes: propiedad ? (propiedad.colonia ?? propiedad.ciudad) : null,
      easybroker_id: fila.easybroker_id,
      mensaje_original: fila.mensaje_original,
      creado_en: fila.creado_en, // happened_at real del contact request (UTC)
      clasificacion_eb: clasificacionEb,
    })
    .select('id')
    .single()
  if (error) {
    // Otra corrida traslapada ya creo este lead: duplicado, no notificar.
    if (error.code === UNIQUE_VIOLATION) return false
    throw new Error(`insert de lead nuevo: ${error.message}`)
  }

  await notificarLeadNuevo(supabase, creado.id, fila, propiedad, decision, falloResolutor)
  return true
}

async function nombreDeUsuario(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.nombre ?? 'el asesor de guardia'
}

/**
 * Side effects post-insert del lead nuevo (el insert ya es autoritativo; esto
 * es best-effort dentro del catch por-CR del caller). Push + campanita al
 * responsable, seguimiento de sistema si hubo asignación automática, y los
 * avisos del spec: dueño cuando el lead entró fuera de horario, «Lead VIP»
 * al dueño, alerta a admins si el resolutor falló o no hay rol cargado.
 */
async function notificarLeadNuevo(
  supabase: SupabaseClient,
  leadId: string,
  fila: ReturnType<typeof mapearContactRequest>,
  propiedad: PropiedadResuelta | null,
  decision: DecisionAsignacion,
  falloResolutor: string | null
): Promise<void> {
  const referencia = propiedad?.titulo ?? fila.propiedad_eb_id
  const detalle = referencia ? `${fila.nombre} — ${referencia}` : `${fila.nombre} — ${fila.fuente_detalle ?? 'portal'}`

  if (decision.tipo === 'bandeja') {
    const motivo = falloResolutor
      ? `Nuevo lead en bandeja (falló la asignación por guardia): ${detalle}`
      : `Nuevo lead: ${detalle} — no hay guardias programadas`
    await notificarAdmins(supabase, { tipo: 'lead_nuevo', texto: motivo, url: '/admin/bandeja' })
    return
  }

  const nombreAsesor = await nombreDeUsuario(supabase, decision.asesorId)

  const nota =
    decision.tipo === 'vip'
      ? `Lead VIP asignado en automático al dueño (${nombreAsesor})`
      : `Asignado en automático a ${nombreAsesor} por guardia`
  const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
    lead_id: leadId,
    autor_id: null, // generado por el sistema
    tipo: 'sistema',
    propiedad_id: propiedad?.id ?? null,
    nota,
  })
  if (errorSeguimiento) {
    throw new Error(`seguimiento de asignación automática: ${errorSeguimiento.message}`)
  }

  if (decision.tipo === 'vip') {
    const urlDueno = `/admin/leads/${leadId}`
    const texto = `Lead VIP: ${detalle} — decide quién lo atiende`
    await crearNotificacion(supabase, {
      destinatarioId: decision.asesorId,
      tipo: 'lead_asignado',
      texto,
      url: urlDueno,
    })
    await enviarPush(supabase, decision.asesorId, {
      titulo: 'Lead VIP',
      cuerpo: `${detalle} — decide quién lo atiende`,
      url: urlDueno,
    })
    return
  }

  const urlAsesor = `/asesor/leads/${leadId}`
  await crearNotificacion(supabase, {
    destinatarioId: decision.asesorId,
    tipo: 'lead_asignado',
    texto: `Nuevo lead asignado por guardia: ${detalle}`,
    url: urlAsesor,
  })
  await enviarPush(supabase, decision.asesorId, {
    titulo: 'Nuevo lead asignado',
    cuerpo: detalle,
    url: urlAsesor,
  })

  if (decision.tipo === 'guardia_futura') {
    // Lead fuera de horario: se avisa a admins (incluye al dueño) que quedó
    // asignado a la siguiente guardia con el reloj diferido.
    await notificarAdmins(supabase, {
      tipo: 'lead_nuevo',
      texto: `Lead fuera de horario: ${detalle} → asignado a ${nombreAsesor} (siguiente guardia)`,
      url: `/admin/leads/${leadId}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

/**
 * Corre el sync completo (propiedades y luego leads) bajo un lease de
 * ejecucion unica. Nunca lanza: los errores quedan en el resultado y en
 * sync_estado.ultimo_error; si otra invocacion tiene el lease, regresa con
 * omitido=true sin hacer nada.
 */
export async function sincronizarEasyBroker(
  supabase: SupabaseClient,
  deps: DepsSync = {}
): Promise<ResultadoSync> {
  const obtenerPagina =
    deps.obtenerPagina ?? ((path: string, params?: ParamsEB) => ebFetch<PaginaEB<unknown>>(path, params))
  const obtenerDetalle =
    deps.obtenerDetalle ?? ((publicId: string) => ebFetch<PropiedadDetalleEB>(`/v1/properties/${publicId}`))
  const obtenerContacto =
    deps.obtenerContacto ?? ((contactId: number) => ebFetch<ContactoEB>(`/v1/contacts/${contactId}`))
  const maxPaginas = deps.maxPaginas ?? Infinity

  const resultado: ResultadoSync = {
    propiedades: { procesadas: 0, nuevas: 0, actualizadas: 0 },
    leads: { procesados: 0, nuevos: 0, duplicados: 0, porClasificacion: contadoresClasificacionVacios() },
    estatus: {
      procesadas: 0,
      cambiosEstatus: 0,
      desactivadas: 0,
      reactivadas: 0,
      ausentes: 0,
      catalogoCompleto: false,
    },
    errores: [],
    omitido: false,
  }

  try {
    if (!(await adquirirLease(supabase))) {
      resultado.omitido = true
      resultado.errores.push('sync ya en curso')
      return resultado
    }
  } catch (error) {
    resultado.omitido = true
    resultado.errores.push(`lease: ${mensajeDe(error)}`)
    return resultado
  }

  try {
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
        const r = await procesarContactRequests(supabase, pagina.content, { agenciaId, obtenerContacto })
        resultado.leads.procesados += r.procesados
        resultado.leads.nuevos += r.nuevos
        resultado.leads.duplicados += r.duplicados
        resultado.leads.porClasificacion.clienteDirecto += r.porClasificacion.clienteDirecto
        resultado.leads.porClasificacion.coBroke += r.porClasificacion.coBroke
        resultado.leads.porClasificacion.saliente += r.porClasificacion.saliente
        resultado.leads.porClasificacion.sinClasificar += r.porClasificacion.sinClasificar

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

    // --- Estatus: pasada completa de listing_statuses, SIN cursor (ver jsdoc arriba) ---
    try {
      const { estatusPorId, completo } = await obtenerMapaEstatusEB(obtenerPagina, maxPaginas)

      const propiedadesAgencia: PropiedadEstatusActual[] = []
      const TAM_PAGINA_PROPIEDADES = 1000
      for (let desde = 0; ; desde += TAM_PAGINA_PROPIEDADES) {
        const { data, error } = await supabase
          .from('propiedades')
          .select('id, easybroker_id, estatus, activa')
          .eq('agencia_id', agenciaId)
          .range(desde, desde + TAM_PAGINA_PROPIEDADES - 1)
        if (error) throw new Error(`consulta de propiedades para reconciliar estatus: ${error.message}`)
        propiedadesAgencia.push(...((data ?? []) as PropiedadEstatusActual[]))
        if (!data || data.length < TAM_PAGINA_PROPIEDADES) break
      }

      const r = await reconciliarEstatusPropiedades(supabase, propiedadesAgencia, estatusPorId, completo)
      resultado.estatus.procesadas += r.procesadas
      resultado.estatus.cambiosEstatus += r.cambiosEstatus
      resultado.estatus.desactivadas += r.desactivadas
      resultado.estatus.reactivadas += r.reactivadas
      resultado.estatus.ausentes += r.ausentes
      resultado.estatus.catalogoCompleto = completo

      if (r.errores.length > 0) {
        resultado.errores.push(...r.errores)
        await marcarError(supabase, 'estatus', r.errores.join('; '))
      } else {
        await marcarOk(supabase, 'estatus')
      }
    } catch (error) {
      const mensaje = `sync estatus: ${mensajeDe(error)}`
      resultado.errores.push(mensaje)
      await marcarError(supabase, 'estatus', mensaje).catch(() => {})
    }

    return resultado
  } finally {
    await liberarLease(supabase).catch(() => {})
  }
}
