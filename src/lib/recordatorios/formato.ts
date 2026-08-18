/**
 * Vocabulario y reglas puras de los recordatorios de follow-up (ronda 2).
 *
 * Sin 'server-only' y sin 'use client': lo consumen la hoja (cliente), las
 * consultas del inicio (servidor) y los tests. Toda la aritmética de fechas
 * pasa por src/lib/fechas/monterrey.ts — el "mañana 9:00" es de Monterrey,
 * nunca del dispositivo.
 */

import {
  ZONA_HORARIA,
  convertirFechaHoraMonterreyAIso,
  diaMonterrey,
  formatearHoraMonterrey,
} from '@/lib/fechas/monterrey'

export const MAX_NOTA_RECORDATORIO = 280

export const ESTADOS_RECORDATORIO = ['pendiente', 'hecho', 'cancelado'] as const
export type EstadoRecordatorio = (typeof ESTADOS_RECORDATORIO)[number]

export type OpcionRapida = { etiqueta: string; fechaIso: string }

/** Hora "de pared" (0–23) que marca el reloj de Monterrey en `ahora`. */
function horaMonterrey(ahora: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA_HORARIA,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(ahora)
  )
}

/**
 * Suma días calendario a una clave YYYY-MM-DD. Ancla a mediodía UTC para que
 * el resultado no dependa de offsets (México ya no tiene horario de verano,
 * pero la regla no debe asumirlo).
 */
function sumarDias(claveDia: string, dias: number): string {
  const base = new Date(`${claveDia}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

/**
 * Opciones de un toque de la hoja de follow-up. «Hoy en la tarde» (16:00)
 * solo se ofrece si aún no son las 15:00 en Monterrey — ofrecer un
 * recordatorio que nace vencido (o a minutos de vencer) es ruido.
 */
export function opcionesRapidas(ahora: Date): OpcionRapida[] {
  const hoy = diaMonterrey(ahora)
  const opciones: OpcionRapida[] = []

  if (horaMonterrey(ahora) < 15) {
    const iso = convertirFechaHoraMonterreyAIso(hoy, '16:00')
    if (iso) opciones.push({ etiqueta: 'Hoy en la tarde', fechaIso: iso })
  }

  const manana = convertirFechaHoraMonterreyAIso(sumarDias(hoy, 1), '09:00')
  if (manana) opciones.push({ etiqueta: 'Mañana 9:00', fechaIso: manana })

  const enTres = convertirFechaHoraMonterreyAIso(sumarDias(hoy, 3), '09:00')
  if (enTres) opciones.push({ etiqueta: 'En 3 días', fechaIso: enTres })

  const enSiete = convertirFechaHoraMonterreyAIso(sumarDias(hoy, 7), '09:00')
  if (enSiete) opciones.push({ etiqueta: 'Próxima semana', fechaIso: enSiete })

  return opciones
}

/** ¿El recordatorio ya venció respecto a `ahora`? */
export function estaVencido(fechaIso: string, ahora: Date): boolean {
  return new Date(fechaIso).getTime() <= ahora.getTime()
}

/**
 * Etiqueta corta de la fecha pactada, relativa al día de Monterrey:
 * «hoy 4:00 pm», «mañana 9:00 am», o «jue 21 ago, 9:00 am».
 */
export function etiquetaFechaRecordatorio(fechaIso: string, ahora: Date): string {
  const dia = diaMonterrey(new Date(fechaIso))
  const hora = formatearHoraMonterrey(fechaIso)
  const hoy = diaMonterrey(ahora)
  if (dia === hoy) return `hoy ${hora}`
  if (dia === sumarDias(hoy, 1)) return `mañana ${hora}`
  const fecha = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(fechaIso))
  return `${fecha}, ${hora}`
}
