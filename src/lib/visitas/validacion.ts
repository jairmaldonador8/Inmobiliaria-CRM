/**
 * Validación pura de los datos de una visita (agendar/reagendar).
 *
 * Sin 'server-only': se reutiliza tal cual en la UI de la Task 3 para
 * validar antes de enviar (mejor UX) y aquí en las server actions como
 * frontera de verdad. El rango de duración DEBE coincidir con el check de
 * la base de datos (migración 0008: `duracion_min between 15 and 480`).
 */

/** Duración por default de una visita nueva, en minutos. */
export const DURACION_MIN_DEFAULT = 60

/** Duración mínima aceptada, en minutos. */
export const DURACION_MIN_MINIMO = 15

/** Duración máxima aceptada, en minutos (8 horas). */
export const DURACION_MIN_MAXIMO = 480

export type DatosVisita = {
  fecha: string
  duracionMin: number
}

export type ResultadoValidacion = { ok: true } | { error: string }

/**
 * Valida fecha (futura, parseable) y duración (entero en el rango
 * 15–480 minutos, igual que el check de la BD) de una visita.
 */
export function validarDatosVisita(datos: DatosVisita): ResultadoValidacion {
  const fecha = new Date(datos.fecha)
  if (!datos.fecha || Number.isNaN(fecha.getTime())) {
    return { error: 'La fecha no es válida' }
  }
  if (fecha.getTime() <= Date.now()) {
    return { error: 'La fecha debe ser futura' }
  }

  if (
    !Number.isInteger(datos.duracionMin) ||
    datos.duracionMin < DURACION_MIN_MINIMO ||
    datos.duracionMin > DURACION_MIN_MAXIMO
  ) {
    return { error: 'La duración debe ser de 15 minutos a 8 horas' }
  }

  return { ok: true }
}
