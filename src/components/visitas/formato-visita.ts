/**
 * Formateo de presentación para la lista de visitas de un lead
 * (`ListaVisitasLead`): fecha/hora legible, duración legible y etiqueta +
 * clase de color del estado. Funciones PURAS, sin 'use client'.
 *
 * Mismo criterio de fecha/hora que `formatearFechaVisita` en
 * `src/lib/visitas/acciones.ts` y `src/components/visitas/confirmacion-whatsapp.ts`
 * — America/Monterrey, es-MX — pero vive aparte porque ninguno de esos dos
 * módulos se puede tocar en esta corrección.
 */

const ZONA_HORARIA = 'America/Monterrey'

/** Fecha/hora legible en español, en la zona horaria del negocio. */
export function formatearFechaVisita(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

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
