/**
 * Vocabulario de presentación de seguimientos.
 *
 * Sin 'server-only': se usa igual en Server Components (timeline) y en
 * componentes de cliente (sheet de registro).
 */

/**
 * Tipos que un usuario puede REGISTRAR a mano. 'sistema' existe en el enum
 * de la BD pero está reservado para eventos automáticos (asignaciones,
 * sync) — nunca se ofrece en la UI ni se acepta en la action.
 */
export const TIPOS_SEGUIMIENTO = ['llamada', 'whatsapp', 'correo', 'visita', 'otro'] as const

export type TipoSeguimiento = (typeof TIPOS_SEGUIMIENTO)[number]

const ETIQUETAS_TIPO: Record<string, string> = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  visita: 'Visita',
  otro: 'Otro',
  sistema: 'Sistema',
}

/** Etiqueta en español del tipo. Tolerante a valores desconocidos. */
export function etiquetaTipoSeguimiento(tipo: string): string {
  return ETIQUETAS_TIPO[tipo] ?? tipo
}

/** Longitud máxima de la nota de un seguimiento. */
export const MAX_NOTA_SEGUIMIENTO = 1000
