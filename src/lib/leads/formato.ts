/**
 * Vocabulario de presentación de leads (etapas y fuentes).
 *
 * Sin 'server-only': se usa igual en Server Components y en componentes
 * de cliente (filtros, dialogs).
 */

import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'

/**
 * Vocabulario COMPLETO del enum `etapa_lead` de Postgres. No se le quitan
 * valores aunque la interfaz deje de ofrecer alguno como destino (ver
 * ETAPAS_KANBAN / ETAPAS_SELECCIONABLES abajo) -- quitar un valor de un enum
 * es destructivo y hay historial que lo referencia. Sigue siendo la lista
 * de validacion para `cambiarEtapa`.
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
 * Columnas activas del kanban (Task «Reducir el pipeline a 5 etapas»): el
 * tablero deja de tener columna propia para 'apartado' (se fusiona en
 * 'negociacion', ver migracion 0012) y para las etapas cerradas (siguen
 * existiendo, pero un lead cerrado ya no es trabajo pendiente que deba
 * ocupar una columna permanente).
 */
export const ETAPAS_KANBAN = [
  'nuevo',
  'contactado',
  'cita_agendada',
  'visita_realizada',
  'negociacion',
] as const

/**
 * Etapas que la interfaz ofrece como destino explicito (selector de etapa de
 * la ficha, menu «Mover a…» de la tarjeta): las 5 columnas activas del
 * kanban + los dos cierres. 'apartado' queda fuera a proposito -- esta
 * fusionado con 'negociacion', no es un destino que un asesor deba poder
 * elegir de nuevo.
 */
export const ETAPAS_SELECCIONABLES = [...ETAPAS_KANBAN, ...ETAPAS_CERRADAS] as const

/** Una de las 5 columnas activas del tablero. */
export type EtapaKanban = (typeof ETAPAS_KANBAN)[number]

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
  // Etiqueta corta a proposito ('Visita realizada' no cabe en una columna
  // angosta del kanban) -- el VALOR del enum sigue siendo 'visita_realizada'.
  visita_realizada: 'Visitó',
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

// ---------------------------------------------------------------------------
// Clasificación de leads de EasyBroker (ver src/lib/easybroker/mapeo.ts:
// ClasificacionLeadEB — el tipo vive ahí, este módulo solo pone el
// vocabulario de negocio en español para el asesor).
// ---------------------------------------------------------------------------

/**
 * Textos de negocio, no los nombres técnicos del enum: un asesor no sabe
 * qué es "co_broke" o "saliente", pero sí entiende que uno es un corredor
 * externo y el otro es una gestión propia que no requiere seguimiento como
 * lead.
 */
const ETIQUETAS_CLASIFICACION_EB: Record<ClasificacionLeadEB, string> = {
  cliente_directo: 'Cliente directo',
  co_broke: 'Corredor externo',
  saliente: 'Gestión nuestra',
}

/** Etiqueta de negocio en español de la clasificación EB. */
export function etiquetaClasificacionEB(clasificacion: ClasificacionLeadEB): string {
  return ETIQUETAS_CLASIFICACION_EB[clasificacion]
}

/**
 * Clases de color por clasificación: cliente_directo en verde (es EL lead,
 * priorízalo), co_broke en azul (negociación entre colegas, tono neutro
 * distinto), saliente en gris (no es un lead, se despriorizar visualmente).
 */
const CLASES_CLASIFICACION_EB: Record<ClasificacionLeadEB, string> = {
  cliente_directo: 'bg-emerald-100 text-emerald-700',
  co_broke: 'bg-blue-100 text-blue-700',
  saliente: 'bg-slate-200 text-slate-600',
}

export function claseBadgeClasificacionEB(clasificacion: ClasificacionLeadEB): string {
  return CLASES_CLASIFICACION_EB[clasificacion]
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

/**
 * Compara el nombre escrito a mano contra el real, con la manga ancha justa:
 * sin acentos, sin mayúsculas y sin espacios de sobra. Se le pide a alguien
 * que confirme, no que transcriba con precisión de notario.
 *
 * Vive aquí y no en `leads/acciones.ts` porque ese módulo es 'use server'
 * (todo lo que exporta tiene que ser una Server Action async) y esto lo
 * necesitan los dos lados: el diálogo para habilitar el botón y el servidor
 * para decidir de verdad.
 */
export function nombreConfirmaAlLead(escrito: string | undefined, real: string): boolean {
  if (!escrito) return false
  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
  return normalizar(escrito) === normalizar(real)
}
