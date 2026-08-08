/**
 * Vocabulario de presentación de los contactos de WhatsApp.
 *
 * Sin 'server-only': se usa en Server Components y en la hoja de desenlace,
 * que es cliente. Mismo criterio que `leads/formato.ts`.
 */

export const RESULTADOS_CONTACTO = [
  'pendiente',
  'contesto',
  'no_contesto',
  'cita',
  'no_interesa',
  'sin_reporte',
] as const

export type ResultadoContacto = (typeof RESULTADOS_CONTACTO)[number]

/** Desenlaces que el asesor puede elegir en la hoja. `sin_reporte` NO: lo pone el sistema. */
export const DESENLACES_ELEGIBLES = ['cita', 'contesto', 'no_contesto', 'no_interesa'] as const

export type DesenlaceElegible = (typeof DESENLACES_ELEGIBLES)[number]

const ETIQUETAS: Record<ResultadoContacto, string> = {
  pendiente: 'Sin reportar',
  contesto: 'Me contestó',
  no_contesto: 'No me contestó',
  cita: 'Agendé una cita',
  no_interesa: 'No le interesa',
  sin_reporte: 'Nunca se reportó',
}

export function etiquetaResultado(resultado: string): string {
  return ETIQUETAS[resultado as ResultadoContacto] ?? resultado
}

/**
 * ¿Este resultado significa que el lead sigue esperando respuesta?
 *
 * `pendiente` (no reportó) y `no_contesto` (reportó que nadie respondió)
 * significan lo mismo para el asesor: nadie ha contestado. Unificarlos es lo
 * que evita que un lead quede 24 h invisible justo después de que el asesor
 * reportó, honestamente, que no le contestaron.
 *
 * Tolerante a valores desconocidos: ante la duda, NO lo listamos.
 */
export function esSinRespuesta(resultado: string): boolean {
  return resultado === 'pendiente' || resultado === 'no_contesto'
}
