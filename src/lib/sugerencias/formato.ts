/**
 * Vocabulario de presentación del estado de una sugerencia.
 *
 * Sin 'server-only': se usa igual en Server Components (la página admin) y
 * en el Select de cliente que cambia el estado.
 */

export const ESTADOS_SUGERENCIA = ['nueva', 'revisada', 'implementada'] as const

export type EstadoSugerencia = (typeof ESTADOS_SUGERENCIA)[number]

const ETIQUETAS_ESTADO: Record<EstadoSugerencia, string> = {
  nueva: 'Nueva',
  revisada: 'Revisada',
  implementada: 'Implementada',
}

/** Etiqueta en español del estado. Tolerante a valores desconocidos. */
export function etiquetaEstadoSugerencia(estado: string): string {
  return ETIQUETAS_ESTADO[estado as EstadoSugerencia] ?? estado
}

const CLASES_ESTADO: Record<EstadoSugerencia, string> = {
  nueva: 'bg-blue-100 text-blue-700',
  revisada: 'bg-amber-100 text-amber-700',
  implementada: 'bg-emerald-100 text-emerald-700',
}

/** Clases de color del badge por estado (fondo suave + texto). */
export function claseBadgeEstadoSugerencia(estado: string): string {
  return CLASES_ESTADO[estado as EstadoSugerencia] ?? 'bg-slate-100 text-slate-600'
}
