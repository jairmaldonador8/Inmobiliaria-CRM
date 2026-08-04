/**
 * Vocabulario de presentación de leads (etapas y fuentes).
 *
 * Sin 'server-only': se usa igual en Server Components y en componentes
 * de cliente (filtros, dialogs).
 */

export const ETAPAS_LEAD = [
  'nuevo',
  'contactado',
  'cita_agendada',
  'visita_realizada',
  'negociacion',
  'apartado',
  'cerrado_ganado',
  'cerrado_perdido',
] as const

export type EtapaLead = (typeof ETAPAS_LEAD)[number]

export const FUENTES_LEAD = ['portal', 'whatsapp', 'referido', 'redes', 'walk_in', 'otro'] as const

export type FuenteLead = (typeof FUENTES_LEAD)[number]

/** Etapas que ya no cuentan como trabajo activo del asesor. */
export const ETAPAS_CERRADAS = ['cerrado_ganado', 'cerrado_perdido'] as const

/**
 * Texto exacto del seguimiento de sistema que registra `cambiarEtapa` al
 * mover un lead a un estado cerrado (Task 17). `leads` no tiene una columna
 * de fecha de cierre — este texto + `creado_en` del seguimiento es lo que
 * permite calcular "cerrados ganados del mes" en la cola del día sin
 * agregar una columna nueva.
 */
export const NOTA_CIERRE: Record<'cerrado_ganado' | 'cerrado_perdido', string> = {
  cerrado_ganado: 'Marcado como cerrado ganado',
  cerrado_perdido: 'Marcado como cerrado perdido',
}

const ETIQUETAS_ETAPA: Record<EtapaLead, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  cita_agendada: 'Cita agendada',
  visita_realizada: 'Visita realizada',
  negociacion: 'Negociación',
  apartado: 'Apartado',
  cerrado_ganado: 'Cerrado ganado',
  cerrado_perdido: 'Cerrado perdido',
}

/** Etiqueta en español de la etapa. Tolerante a valores desconocidos. */
export function etiquetaEtapa(etapa: string): string {
  return ETIQUETAS_ETAPA[etapa as EtapaLead] ?? etapa
}

/** Clases de color del badge por etapa (fondo suave + texto). */
const CLASES_ETAPA: Record<EtapaLead, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-sky-100 text-sky-700',
  cita_agendada: 'bg-violet-100 text-violet-700',
  visita_realizada: 'bg-indigo-100 text-indigo-700',
  negociacion: 'bg-amber-100 text-amber-700',
  apartado: 'bg-orange-100 text-orange-700',
  cerrado_ganado: 'bg-emerald-100 text-emerald-700',
  cerrado_perdido: 'bg-slate-200 text-slate-600',
}

export function claseBadgeEtapa(etapa: string): string {
  return CLASES_ETAPA[etapa as EtapaLead] ?? 'bg-slate-100 text-slate-600'
}

const ETIQUETAS_FUENTE: Record<FuenteLead, string> = {
  portal: 'Portal',
  whatsapp: 'WhatsApp',
  referido: 'Referido',
  redes: 'Redes',
  walk_in: 'Walk-in',
  otro: 'Otro',
}

/** Etiqueta en español de la fuente. Tolerante a valores desconocidos. */
export function etiquetaFuente(fuente: string): string {
  return ETIQUETAS_FUENTE[fuente as FuenteLead] ?? fuente
}

/**
 * Texto del badge de fuente: para 'portal' se muestra el detalle
 * (inmuebles24, vivanuncios, …) para saber DE QUÉ portal vino.
 */
export function etiquetaFuenteConDetalle(fuente: string, fuenteDetalle: string | null): string {
  if (fuente === 'portal' && fuenteDetalle) return fuenteDetalle
  return etiquetaFuente(fuente)
}

/** Presenta '528112345678' como '811 234 5678' (formato local legible). */
export function formatearTelefono(telefono: string | null): string {
  if (!telefono) return '—'
  const digitos = telefono.replace(/\D/g, '')
  if (digitos.length === 12 && digitos.startsWith('52')) {
    const local = digitos.slice(2)
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  if (digitos.length === 10) {
    return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`
  }
  return telefono
}
