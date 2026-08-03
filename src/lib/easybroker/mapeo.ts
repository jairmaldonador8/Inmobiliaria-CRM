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
  easybroker_id: string
  nombre: string
  telefono: string | null
  email: string | null
  fuente: 'portal'
  fuente_detalle: string | null
  /** public_id de EasyBroker; el sync lo resuelve a propiedad_id (uuid). */
  propiedad_eb_id: string | null
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
    mensaje_original: cr.message ?? null,
    creado_en: aUtcIso(cr.happened_at),
  }
}
