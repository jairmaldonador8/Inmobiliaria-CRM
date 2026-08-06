/**
 * Formateo de presentación para la lista de visitas de un lead
 * (`ListaVisitasLead`): fecha/hora legible, duración legible y etiqueta +
 * clase de color del estado. Funciones PURAS, sin 'use client'.
 *
 * Vive en `src/lib/visitas/` (no en `src/components/visitas/`, donde vivía
 * antes): es lógica pura sin JSX, igual que `acciones.ts`/`validacion.ts`.
 *
 * La fecha/hora reutiliza `formatearFechaHoraMonterrey` (fuente única en
 * `src/lib/fechas/monterrey.ts`) — antes de este módulo, este archivo tenía
 * su propia copia byte a byte de la misma función.
 */

import { formatearFechaHoraMonterrey } from '@/lib/fechas/monterrey'

/** Fecha/hora legible en español, en la zona horaria del negocio. */
export const formatearFechaVisita = formatearFechaHoraMonterrey

/** Duración legible: minutos si es menor a una hora, si no horas (+ minutos si sobran). */
export function formatearDuracionVisita(duracionMin: number): string {
  if (duracionMin < 60) return `${duracionMin} min`

  const horas = Math.floor(duracionMin / 60)
  const minutos = duracionMin % 60
  const textoHoras = `${horas} ${horas === 1 ? 'hora' : 'horas'}`
  return minutos === 0 ? textoHoras : `${textoHoras} ${minutos} min`
}

export type EstadoVisita = 'agendada' | 'realizada' | 'cancelada'

const ETIQUETAS_ESTADO: Record<EstadoVisita, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
}

/** Etiqueta en español del estado. Tolerante a valores desconocidos. */
export function etiquetaEstadoVisita(estado: string): string {
  return ETIQUETAS_ESTADO[estado as EstadoVisita] ?? estado
}

const CLASES_ESTADO: Record<EstadoVisita, string> = {
  agendada: 'bg-sky-100 text-sky-700',
  realizada: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-slate-100 text-slate-500',
}

/** Clase de color del badge de estado. Tolerante a valores desconocidos. */
export function claseBadgeEstadoVisita(estado: string): string {
  return CLASES_ESTADO[estado as EstadoVisita] ?? 'bg-slate-100 text-slate-600'
}
