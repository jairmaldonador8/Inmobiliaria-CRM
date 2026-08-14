/**
 * Armado del payload para POST /v1/properties de EasyBroker (beta) a partir
 * de una captación aprobada. Función pura, sin I/O — el POST vive en
 * acciones.ts. Referencia: dev.easybroker.com/reference/post_properties
 * (research 2026-08-14).
 *
 * Convención Montana: la descripción termina con las INICIALES del asesor
 * dueño de la captación, en línea propia (así identifican de quién es cada
 * propiedad dentro de EasyBroker).
 *
 * Límites duros de la API que se aplican aquí: máximo 50 imágenes, título de
 * imagen ≤60 caracteres. La cuenta/agent es la principal de Montana
 * (decisión 2026-08-14), así que `agent` NO se manda: EB usa el dueño de la
 * API key.
 */

export interface CaptacionParaEB {
  titulo: string
  descripcion: string
  tipo: string
  operacion: 'sale' | 'rental'
  precio: number
  moneda: string
  colonia: string
  ciudad: string
  estado: string
  calle: string | null
  numero_exterior: string | null
  codigo_postal: string | null
  lat: number | null
  lng: number | null
  mostrar_ubicacion_exacta: boolean
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  estacionamientos: number | null
  /** Años de antigüedad; 0 = nueva construcción. */
  antiguedad: number | null
  m2_construccion: number | null
  m2_terreno: number | null
  video_url: string | null
  tour_url: string | null
  /** URLs públicas (Storage) en el orden elegido por el asesor. */
  fotos: string[]
}

const MAX_IMAGENES_EB = 50

/** «Jair Maldonado» → «JM». Toma la primera letra de las dos primeras palabras. */
export function inicialesDeNombre(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-záéíóúüñ]/i.test(p))
  return palabras
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

/**
 * La descripción que viaja a EasyBroker: la del asesor + sus iniciales al
 * final en línea propia (convención del equipo). Idempotente: si ya termina
 * con esas iniciales no las duplica.
 */
export function descripcionConIniciales(descripcion: string, iniciales: string): string {
  const limpia = descripcion.trimEnd()
  if (!iniciales) return limpia
  if (limpia.endsWith(`\n${iniciales}`) || limpia === iniciales) return limpia
  return `${limpia}\n\n${iniciales}`
}

/**
 * Payload del POST /v1/properties. `publicar` decide el estatus inicial:
 * true → 'published' (se sindica a los portales activos del App Directory),
 * false → 'not_published' (llega a EB apagada). `nombreUbicacion` permite
 * inyectar el full_name EXACTO resuelto contra /v1/locations (la API
 * rechaza nombres que no estén en su catálogo — verificado en sandbox).
 */
export function armarPayloadEB(
  captacion: CaptacionParaEB,
  iniciales: string,
  publicar: boolean,
  anioActual: number,
  nombreUbicacion?: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: captacion.titulo.trim(),
    description: descripcionConIniciales(captacion.descripcion, iniciales),
    property_type: captacion.tipo,
    status: publicar ? 'published' : 'not_published',
    location: {
      name: nombreUbicacion ?? `${captacion.colonia}, ${captacion.ciudad}, ${captacion.estado}`,
      ...(captacion.calle && { street: captacion.calle }),
      ...(captacion.numero_exterior && { exterior_number: captacion.numero_exterior }),
      ...(captacion.codigo_postal && { postal_code: captacion.codigo_postal }),
      ...(captacion.lat !== null && { latitude: captacion.lat }),
      ...(captacion.lng !== null && { longitude: captacion.lng }),
    },
    operations: [
      {
        type: captacion.operacion,
        active: true,
        amount: captacion.precio,
        currency: captacion.moneda || 'MXN',
        unit: 'total',
      },
    ],
    show_exact_location: captacion.mostrar_ubicacion_exacta,
    images: captacion.fotos.slice(0, MAX_IMAGENES_EB).map((url) => ({ url })),
  }

  if (captacion.recamaras !== null) payload.bedrooms = captacion.recamaras
  if (captacion.banos !== null) payload.bathrooms = captacion.banos
  if (captacion.medios_banos !== null) payload.half_bathrooms = captacion.medios_banos
  if (captacion.estacionamientos !== null) payload.parking_spaces = captacion.estacionamientos
  if (captacion.m2_construccion !== null) payload.construction_size = captacion.m2_construccion
  if (captacion.m2_terreno !== null) payload.lot_size = captacion.m2_terreno
  if (captacion.antiguedad !== null) {
    // EB acepta año de construcción o 'new_construction' (research 2026-08-14).
    payload.age = captacion.antiguedad === 0 ? 'new_construction' : anioActual - captacion.antiguedad
  }
  if (captacion.video_url) payload.videos = [{ url: captacion.video_url }]
  if (captacion.tour_url) payload.virtual_tour = captacion.tour_url

  return payload
}
