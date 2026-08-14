/**
 * Mapeo puro (sin I/O) de payloads de EasyBroker a filas de nuestro esquema.
 * Formas verificadas contra el sandbox de staging (ver
 * src/test/fixtures/easybroker/*.json y .claude/skills/easybroker-api).
 */

// ---------------------------------------------------------------------------
// Tipos de payloads de EasyBroker (solo los campos que usamos)
// ---------------------------------------------------------------------------

export interface OperacionEB {
  type: 'sale' | 'rental' | string
  amount: number | null
  currency: string | null
}

/** Item del listado GET /v1/properties (location es STRING aquí). */
export interface PropiedadListaEB {
  public_id: string
  title: string
  title_image_full: string | null
  title_image_thumb?: string | null
  location: string
  operations: OperacionEB[]
  bedrooms: number | null
  bathrooms: number | null
  parking_spaces: number | null
  property_type: string | null
  lot_size: number | null
  construction_size: number | null
  updated_at: string
}

export interface UbicacionDetalleEB {
  name: string
  latitude: number | null
  longitude: number | null
  street?: string | null
  postal_code?: string | null
}

/** Detalle GET /v1/properties/{public_id} (location es OBJETO aquí). */
export interface PropiedadDetalleEB {
  public_id: string
  description: string | null
  location: UbicacionDetalleEB
  public_url: string | null
  /** Usar images[]; property_images está deprecado. */
  images: Array<{ title: string | null; url: string }>
}

/** Item de GET /v1/contact_requests. */
export interface ContactRequestEB {
  id: number
  name: string | null
  phone: string | null
  email: string | null
  contact_id?: number | null
  property_id: string | null
  message: string | null
  source: string | null
  happened_at: string
}

/**
 * Item de GET /v1/listing_statuses. GET /v1/properties NO trae `status`; esta
 * es la unica fuente confiable del estatus real (ver skill easybroker-api).
 * Estatus posibles: published | not_published | reserved | sold | rented |
 * suspended.
 */
export interface ListingStatusEB {
  public_id: string
  status: string
  updated_at: string
}

/**
 * Item de GET /v1/contacts/{contact_id} (solo los campos que usamos). Trae
 * ademas `probability`, `private_description`, `agent` — ninguno sirve para
 * clasificar (ver skill easybroker-api: `agent` es asignacion automatica por
 * origen, NO indica atencion ni corretaje).
 */
export interface ContactoEB {
  id: number
  tags?: string[] | null
}

// ---------------------------------------------------------------------------
// Filas resultantes (subconjuntos de las tablas propiedades / leads)
// ---------------------------------------------------------------------------

export interface FilaPropiedadLista {
  easybroker_id: string
  titulo: string
  tipo: string | null
  operacion: string | null
  precio: number | null
  moneda: string
  ubicacion: string | null
  superficie_construccion: number | null
  superficie_terreno: number | null
  recamaras: number | null
  banos: number | null
  estacionamientos: number | null
  actualizada_eb: string
  fotos: string[]
}

export interface FilaPropiedadDetalle {
  descripcion: string | null
  colonia: string | null
  ciudad: string | null
  lat: number | null
  lng: number | null
  url_publica: string | null
  fotos: string[]
}

export interface FilaLead {
  /**
   * Id del evento externo que origino el lead. Para EasyBroker es el id del
   * contact request; la captura del sitio oficial (lib/leads/captura) guarda
   * `sitio:<solicitud_id>` — el unique de la columna hace idempotente el
   * reintento en ambos canales.
   */
  easybroker_id: string
  nombre: string
  telefono: string | null
  email: string | null
  /** 'portal' = entro por el sync de EasyBroker; 'sitio' = formulario del sitio oficial. */
  fuente: 'portal' | 'sitio'
  fuente_detalle: string | null
  /** public_id de EasyBroker; el sync lo resuelve a propiedad_id (uuid). */
  propiedad_eb_id: string | null
  /** contact_id de EasyBroker; el sync lo usa SOLO para clasificar (GET /v1/contacts/{id}), no se persiste. */
  contacto_eb_id: number | null
  mensaje_original: string | null
  creado_en: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timestamps de EB llegan con offset -06:00; se normalizan a UTC ISO. */
function aUtcIso(timestamp: string): string {
  return new Date(timestamp).toISOString()
}

/**
 * Normaliza un teléfono al formato 52XXXXXXXXXX: quita todo lo que no sea
 * dígito, conserva los últimos 10 y antepone '52'. Null-safe.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  const digitos = telefono.replace(/\D/g, '')
  if (!digitos) return null
  return `52${digitos.slice(-10)}`
}

/**
 * location.name del detalle viene como "Colonia, Ciudad, Estado".
 * Con solo 2 partes se asume "Ciudad, Estado" (sin colonia).
 */
function parsearUbicacion(nombre: string | null | undefined): {
  colonia: string | null
  ciudad: string | null
} {
  const partes = (nombre ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (partes.length >= 3) return { colonia: partes[0], ciudad: partes[1] }
  if (partes.length >= 1) return { colonia: null, ciudad: partes[0] }
  return { colonia: null, ciudad: null }
}

// ---------------------------------------------------------------------------
// Mapeos
// ---------------------------------------------------------------------------

/** Mapea un item del listado de propiedades a la fila base de `propiedades`. */
export function mapearPropiedadLista(item: PropiedadListaEB): FilaPropiedadLista {
  const operacion = item.operations?.[0] ?? null
  return {
    easybroker_id: item.public_id,
    titulo: item.title,
    tipo: item.property_type ?? null,
    operacion: operacion?.type ?? null,
    precio: operacion?.amount ?? null,
    moneda: operacion?.currency ?? 'MXN',
    ubicacion: item.location ?? null,
    superficie_construccion: item.construction_size ?? null,
    superficie_terreno: item.lot_size ?? null,
    recamaras: item.bedrooms ?? null,
    banos: item.bathrooms ?? null,
    estacionamientos: item.parking_spaces ?? null,
    actualizada_eb: aUtcIso(item.updated_at),
    fotos: item.title_image_full ? [item.title_image_full] : [],
  }
}

/**
 * Mapea el detalle de una propiedad a los campos ADICIONALES que el listado
 * no trae. Se mezcla por encima de la fila de mapearPropiedadLista.
 */
export function mapearPropiedadDetalle(detalle: PropiedadDetalleEB): FilaPropiedadDetalle {
  const { colonia, ciudad } = parsearUbicacion(detalle.location?.name)
  return {
    descripcion: detalle.description ?? null,
    colonia,
    ciudad,
    lat: detalle.location?.latitude ?? null,
    lng: detalle.location?.longitude ?? null,
    url_publica: detalle.public_url ?? null,
    fotos: (detalle.images ?? []).map((img) => img.url),
  }
}

/**
 * Estatus de EasyBroker que consideramos "disponible" (`activa=true`) en
 * nuestro catalogo.
 *
 * Decision de producto: SOLO 'published'. Se evaluo incluir 'reserved' (hay
 * apartado, pero la operacion no se ha cerrado), pero se descarto: reserved
 * significa que ya hay un cliente en proceso de cerrar esa propiedad, y
 * mostrarsela como disponible a OTRO asesor reproduce el mismo bug que se
 * esta corrigiendo (ofrecerle a un cliente algo que ya no esta realmente
 * disponible). 'not_published' | 'sold' | 'rented' | 'suspended' -> false.
 */
const ESTATUS_DISPONIBLES: ReadonlySet<string> = new Set(['published'])

/** ¿Este estatus de EasyBroker implica `propiedades.activa = true`? */
export function estatusEsActivo(estatus: string): boolean {
  return ESTATUS_DISPONIBLES.has(estatus)
}

/** Mapea un contact request de EasyBroker a la fila base de `leads`. */
export function mapearContactRequest(cr: ContactRequestEB): FilaLead {
  return {
    easybroker_id: String(cr.id),
    nombre: cr.name?.trim() || 'Sin nombre',
    telefono: normalizarTelefono(cr.phone),
    // Minusculas: el dedup por email del sync compara igualdad exacta.
    email: cr.email?.trim().toLowerCase() || null,
    fuente: 'portal',
    fuente_detalle: cr.source ?? null,
    propiedad_eb_id: cr.property_id ?? null,
    contacto_eb_id: cr.contact_id ?? null,
    mensaje_original: cr.message ?? null,
    creado_en: aUtcIso(cr.happened_at),
  }
}

// ---------------------------------------------------------------------------
// Clasificacion de contact requests (ver skill easybroker-api, "Tipos de
// contact request" — medido sobre 150 solicitudes reales, 2026-08-06)
// ---------------------------------------------------------------------------

export type ClasificacionLeadEB = 'cliente_directo' | 'co_broke' | 'saliente'

/**
 * Clasifica un contact request en una de las 3 categorias verificadas:
 *  - 'saliente': `property_id` NO esta en nuestro catalogo (`propiedades`) ->
 *    un asesor de Montana pregunto por una propiedad AJENA. No es un lead.
 *  - 'co_broke': la propiedad SI es nuestra y el contacto trae el tag
 *    "agente" -> corredor externo con un cliente interesado.
 *  - 'cliente_directo': la propiedad es nuestra y el contacto NO trae ese tag.
 *
 * Funcion pura: `propiedadEsNuestra` y `tagsContacto` ya los resuelve el sync
 * (consulta local a `propiedades.easybroker_id` + GET /v1/contacts/{id}).
 * `tagsContacto` es `null` cuando no se pudo determinar (la llamada al
 * contacto fallo, o no habia contact_id) — en ese caso NO se adivina: se
 * devuelve `null` (sin clasificar). No confundir con `[]` (contacto
 * consultado con exito, simplemente sin tags).
 */
export function clasificarContactRequest(
  propiedadEsNuestra: boolean,
  tagsContacto: string[] | null
): ClasificacionLeadEB | null {
  if (!propiedadEsNuestra) return 'saliente'
  if (tagsContacto === null) return null
  return tagsContacto.includes('agente') ? 'co_broke' : 'cliente_directo'
}
