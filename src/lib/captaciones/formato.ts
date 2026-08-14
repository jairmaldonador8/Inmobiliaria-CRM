/** Etiquetas y colores de los estados de una captación. */

export type EstadoCaptacion = 'borrador' | 'enviada' | 'regresada' | 'cargada'

export const ETIQUETA_ESTADO: Record<EstadoCaptacion, string> = {
  borrador: 'Borrador',
  enviada: 'En revisión',
  regresada: 'Regresada',
  cargada: 'En EasyBroker',
}

/** Clases del Badge por estado (mismo criterio de color que el resto del admin). */
export const CLASE_ESTADO: Record<EstadoCaptacion, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  enviada: 'bg-sky-100 text-sky-700',
  regresada: 'bg-amber-100 text-amber-700',
  cargada: 'bg-emerald-100 text-emerald-700',
}
