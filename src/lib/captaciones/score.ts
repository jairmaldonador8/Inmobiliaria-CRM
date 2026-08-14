/**
 * Motor de score de calidad de una captación (estilo «Panoramix» de
 * Inmuebles24): evalúa la captación contra las reglas que los portales
 * mexicanos premian, y devuelve un porcentaje + el checklist regla por regla.
 *
 * Dos niveles:
 *  - BLOQUEANTES: sin esto EasyBroker rechaza el POST o el anuncio nace
 *    muerto (sin precio, sin fotos mínimas...). No suman puntos: apagan el
 *    botón de aprobar.
 *  - PONDERADAS: suman el porcentaje (pesos = 100 en total). Vienen del
 *    research 2026-08-14: fotos ≥10 (ideal 15+), título 30–65 sin mayúsculas
 *    sostenidas ni teléfonos, descripción ≥300 (ideal 800+) sin datos de
 *    contacto (los portales lo penalizan o rechazan), datos duros completos,
 *    geolocalización, video y tour virtual.
 *
 * Función pura, sin I/O: la usan el formulario del asesor (score en vivo,
 * en el navegador) y el dashboard del admin (server). Los límites duros de
 * la API de EB (50 fotos máx, títulos de imagen ≤60...) viven en cargar-eb.
 */

export interface DatosScoreCaptacion {
  titulo: string
  descripcion: string
  /** Symbol de property_types de EasyBroker (p. ej. 'house', 'apartment', 'land'). */
  tipo: string | null
  operacion: 'sale' | 'rental' | null
  precio: number | null
  colonia: string | null
  ciudad: string | null
  calle: string | null
  lat: number | null
  lng: number | null
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  estacionamientos: number | null
  /** Años de antigüedad; 0 = nueva. null = sin dato. */
  antiguedad: number | null
  m2_construccion: number | null
  m2_terreno: number | null
  video_url: string | null
  tour_url: string | null
  /** Cuántas fotos trae la captación. */
  fotos: number
  /** Si se mostrará la ubicación exacta (la API exige calle en ese caso). */
  mostrar_ubicacion_exacta?: boolean
}

export interface ReglaEvaluada {
  clave: string
  etiqueta: string
  cumple: boolean
  bloqueante: boolean
  /** Peso en el porcentaje (0 para bloqueantes y reglas que no aplican). */
  peso: number
  /** Qué falta, o por qué está bien. Siempre accionable. */
  detalle: string
}

export interface ScoreCaptacion {
  /** 0–100, solo con las reglas ponderadas que aplican al tipo de propiedad. */
  porcentaje: number
  /** true si no hay ningún bloqueante pendiente. */
  publicable: boolean
  bloqueantes: ReglaEvaluada[]
  reglas: ReglaEvaluada[]
}

/** Mínimo duro de fotos para aprobar; los portales ven con malos ojos menos que esto. */
export const FOTOS_MINIMAS = 6
/** La meta que pinta el score alto (regla principal de calidad de I24). */
export const FOTOS_META = 10

// ---------------------------------------------------------------------------
// Detectores (exportados para tests)
// ---------------------------------------------------------------------------

/**
 * ¿El texto trae un teléfono? 10+ dígitos corridos tras quitar separadores
 * típicos. Se quitan ANTES los montos con símbolo/comas de dinero para no
 * confundir "$12,500,000" con un teléfono.
 */
export function contieneTelefono(texto: string): boolean {
  const sinMontos = texto.replace(/\$\s?[\d.,]+/g, ' ').replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, ' ')
  const compacto = sinMontos.replace(/[\s\-.()·]/g, '')
  return /\d{10,}/.test(compacto)
}

/** ¿Trae email, URL o mención de WhatsApp? Los portales penalizan datos de contacto. */
export function contieneContacto(texto: string): boolean {
  const t = texto.toLowerCase()
  return (
    /\S+@\S+\.\S+/.test(t) ||
    /https?:\/\/|www\.|wa\.me/.test(t) ||
    /whats\s?app/.test(t) ||
    contieneTelefono(texto)
  )
}

/**
 * ¿Está escrito A GRITOS? Mayúsculas sostenidas: más del 40% de las letras en
 * mayúscula (con al menos 20 letras — títulos cortos con siglas no cuentan).
 */
export function esGritado(texto: string): boolean {
  const letras = texto.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, '')
  if (letras.length < 20) return false
  const mayusculas = letras.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')
  return mayusculas.length / letras.length > 0.4
}

/** Tipos de EB donde recámaras/baños/estacionamientos y m² de construcción no aplican. */
const TIPOS_SIN_INTERIOR: ReadonlySet<string> = new Set([
  'land',
  'terreno',
  'lote',
  'commercial_land',
])

function esTerreno(tipo: string | null): boolean {
  if (!tipo) return false
  return TIPOS_SIN_INTERIOR.has(tipo.toLowerCase())
}

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

function regla(
  clave: string,
  etiqueta: string,
  cumple: boolean,
  peso: number,
  detalle: string,
  bloqueante = false
): ReglaEvaluada {
  return { clave, etiqueta, cumple, bloqueante, peso, detalle }
}

export function evaluarCaptacion(datos: DatosScoreCaptacion): ScoreCaptacion {
  const titulo = datos.titulo.trim()
  const descripcion = datos.descripcion.trim()
  const terreno = esTerreno(datos.tipo)

  // ── Bloqueantes: lo que EasyBroker exige o lo que hace nacer muerto el anuncio.
  const bloqueantes: ReglaEvaluada[] = [
    regla('tipo', 'Tipo de propiedad', !!datos.tipo, 0,
      datos.tipo ? `Tipo: ${datos.tipo}` : 'Elige el tipo de propiedad (obligatorio para EasyBroker).', true),
    regla('operacion', 'Operación', datos.operacion === 'sale' || datos.operacion === 'rental', 0,
      datos.operacion ? (datos.operacion === 'sale' ? 'Venta' : 'Renta') : 'Indica si es venta o renta.', true),
    regla('precio', 'Precio', (datos.precio ?? 0) > 0, 0,
      (datos.precio ?? 0) > 0 ? 'Precio capturado.' : 'Captura el precio (mayor a cero).', true),
    regla('ubicacion', 'Colonia y ciudad', !!datos.colonia && !!datos.ciudad, 0,
      datos.colonia && datos.ciudad
        ? `${datos.colonia}, ${datos.ciudad}`
        : 'Captura colonia y ciudad (deben existir en el catálogo de EasyBroker).', true),
    regla('titulo_presente', 'Título', titulo.length >= 10, 0,
      titulo.length >= 10 ? 'Título capturado.' : 'Escribe un título de al menos 10 caracteres.', true),
    regla('descripcion_presente', 'Descripción', descripcion.length >= 100, 0,
      descripcion.length >= 100
        ? 'Descripción capturada.'
        : `La descripción lleva ${descripcion.length} caracteres; el mínimo para aprobar es 100.`, true),
    regla('fotos_minimas', `Fotos (mínimo ${FOTOS_MINIMAS})`, datos.fotos >= FOTOS_MINIMAS, 0,
      datos.fotos >= FOTOS_MINIMAS
        ? `${datos.fotos} fotos.`
        : `Lleva ${datos.fotos} de ${FOTOS_MINIMAS} fotos mínimas.`, true),
    // La API de EB las exige (verificado contra el sandbox 2026-08-14:
    // «Latitud y longitud no pueden estar en blanco»).
    regla('geolocalizacion', 'Ubicación en el mapa', datos.lat !== null && datos.lng !== null, 0,
      datos.lat !== null && datos.lng !== null
        ? 'Con coordenadas.'
        : 'Marca latitud y longitud: EasyBroker las exige para crear la propiedad.', true),
  ]

  // Calle obligatoria SOLO si se va a mostrar la ubicación exacta (regla de
  // la API de EB, no aplica a terrenos).
  if (datos.mostrar_ubicacion_exacta && !terreno) {
    bloqueantes.push(
      regla('calle_exacta', 'Calle (por mostrar ubicación exacta)', !!datos.calle, 0,
        datos.calle
          ? datos.calle
          : 'Elegiste mostrar la ubicación exacta: EasyBroker exige la calle.', true)
    )
  }

  // ── Ponderadas. Los pesos de las que aplican se reescalan a 100.
  const reglas: ReglaEvaluada[] = []

  reglas.push(
    regla('fotos_meta', `${FOTOS_META} fotos o más`, datos.fotos >= FOTOS_META, 22,
      datos.fotos >= FOTOS_META
        ? `${datos.fotos} fotos — la regla de oro de Inmuebles24 cumplida.`
        : `Lleva ${datos.fotos}; faltan ${FOTOS_META - datos.fotos} para las ${FOTOS_META} que piden los portales.`),
    regla('fotos_ideal', '15 fotos o más', datos.fotos >= 15, 5,
      datos.fotos >= 15 ? 'Galería amplia.' : 'Con 15+ fotos el anuncio compite arriba.'),
    regla('titulo_longitud', 'Título de 30–65 caracteres', titulo.length >= 30 && titulo.length <= 65, 8,
      titulo.length < 30
        ? `El título tiene ${titulo.length} caracteres; llega a 30 con la fórmula tipo + operación + zona.`
        : titulo.length > 65
          ? `El título tiene ${titulo.length} caracteres; recórtalo a 65 o los portales lo truncan.`
          : 'Longitud ideal.'),
    regla('titulo_limpio', 'Título sin gritos ni contacto', !esGritado(titulo) && !contieneContacto(titulo), 7,
      esGritado(titulo)
        ? 'El título está en MAYÚSCULAS SOSTENIDAS; los portales lo penalizan.'
        : contieneContacto(titulo)
          ? 'Quita teléfonos/correos/enlaces del título.'
          : 'Título limpio.'),
    regla('descripcion_300', 'Descripción de 300+ caracteres', descripcion.length >= 300, 5,
      descripcion.length >= 300
        ? `${descripcion.length} caracteres.`
        : `Lleva ${descripcion.length}; desarrolla la propiedad hasta al menos 300.`),
    regla('descripcion_800', 'Descripción de 800+ caracteres', descripcion.length >= 800, 6,
      descripcion.length >= 800
        ? 'Descripción completa — nivel profesional.'
        : 'Con 800+ caracteres (amenidades, entorno, llamada a la acción) el anuncio posiciona mejor.'),
    regla('descripcion_limpia', 'Descripción sin datos de contacto', !contieneContacto(descripcion), 12,
      contieneContacto(descripcion)
        ? 'Quita teléfonos, correos o enlaces: los portales lo penalizan y pueden rechazar el anuncio.'
        : 'Sin datos de contacto.'),
    regla('antiguedad', 'Antigüedad', datos.antiguedad !== null, 4,
      datos.antiguedad !== null
        ? datos.antiguedad === 0 ? 'Construcción nueva.' : `${datos.antiguedad} años.`
        : 'Captura la antigüedad (0 si es nueva).'),
    regla('calle', 'Calle', !!datos.calle, 4,
      datos.calle ? datos.calle : 'Captura la calle (aunque se muestre solo la zona).'),
    regla('video', 'Video', !!datos.video_url, 6,
      datos.video_url ? 'Con video.' : 'Un video sube el anuncio de nivel en Inmuebles24.'),
    regla('tour', 'Tour virtual', !!datos.tour_url, 6,
      datos.tour_url ? 'Con tour virtual.' : 'El recorrido 360° es el extra que casi nadie tiene.')
  )

  if (terreno) {
    reglas.push(
      regla('m2_terreno', 'M² de terreno', (datos.m2_terreno ?? 0) > 0, 15,
        (datos.m2_terreno ?? 0) > 0 ? `${datos.m2_terreno} m².` : 'Captura los m² de terreno.')
    )
  } else {
    reglas.push(
      regla('recamaras', 'Recámaras', datos.recamaras !== null, 3,
        datos.recamaras !== null ? `${datos.recamaras} recámaras.` : 'Captura las recámaras.'),
      regla('banos', 'Baños', datos.banos !== null, 3,
        datos.banos !== null
          ? `${datos.banos} baños${datos.medios_banos ? ` y ${datos.medios_banos} medios` : ''}.`
          : 'Captura los baños.'),
      regla('estacionamientos', 'Estacionamientos', datos.estacionamientos !== null, 3,
        datos.estacionamientos !== null ? `${datos.estacionamientos} cajones.` : 'Captura los estacionamientos.'),
      regla('m2_construccion', 'M² de construcción', (datos.m2_construccion ?? 0) > 0, 3,
        (datos.m2_construccion ?? 0) > 0 ? `${datos.m2_construccion} m².` : 'Captura los m² de construcción.'),
      regla('m2_terreno', 'M² de terreno', (datos.m2_terreno ?? 0) > 0, 3,
        (datos.m2_terreno ?? 0) > 0 ? `${datos.m2_terreno} m².` : 'Captura los m² de terreno.')
    )
  }

  const pesoTotal = reglas.reduce((suma, r) => suma + r.peso, 0)
  const pesoCumplido = reglas.reduce((suma, r) => suma + (r.cumple ? r.peso : 0), 0)
  const porcentaje = pesoTotal === 0 ? 0 : Math.round((pesoCumplido / pesoTotal) * 100)

  return {
    porcentaje,
    publicable: bloqueantes.every((b) => b.cumple),
    bloqueantes,
    reglas,
  }
}
