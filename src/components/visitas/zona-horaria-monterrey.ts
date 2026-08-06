/**
 * Interpretación de fecha/hora tecleadas por el usuario en la zona horaria
 * del negocio (America/Monterrey) — NUNCA en la zona del dispositivo.
 *
 * Toda la app MUESTRA fechas en America/Monterrey (seguimientos, mensaje de
 * confirmación de WhatsApp, dashboard — ver `formatearFechaVisita` en
 * `src/lib/visitas/acciones.ts` y `src/lib/dashboard/consultas.ts`). Por
 * simetría, lo que el asesor TECLEA en la hoja de agendar visita también
 * debe significar hora de Monterrey, sin importar en qué zona esté su
 * teléfono: viaje, municipios fronterizos que sí observan horario de
 * verano de EE. UU. (Cd. Juárez, Matamoros), o un equipo simplemente mal
 * configurado. La versión anterior de este código hacía
 * `new Date('YYYY-MM-DDTHH:mm')` (forma fecha+hora sin sufijo de zona), que
 * el motor de JS interpreta como hora LOCAL DEL DISPOSITIVO — correcto solo
 * si el asesor está físicamente en Monterrey. Este archivo reemplaza eso.
 *
 * Funciones PURAS, sin 'use client': se usan desde `hoja-agendar-visita.tsx`
 * y se prueban directo en `src/test/visitas-confirmacion-whatsapp.test.ts`.
 */

const ZONA_HORARIA = 'America/Monterrey'

/**
 * Offset UTC (en minutos, p. ej. -360 para UTC-6) vigente en
 * America/Monterrey en el instante `fecha`. Se deriva en vivo con Intl en
 * vez de asumir un valor fijo: México eliminó el horario de verano en la
 * mayor parte del país en 2022, pero calcularlo por fecha mantiene la
 * solución correcta si la regla cambia. Mismo truco que
 * `offsetMinutosMonterrey` en `src/lib/dashboard/consultas.ts`.
 */
function offsetMinutosMonterrey(fecha: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    timeZoneName: 'longOffset',
  }).formatToParts(fecha)
  const texto = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-06:00'
  const coincidencia = texto.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!coincidencia) return -360
  const signo = coincidencia[1] === '-' ? -1 : 1
  return signo * (Number(coincidencia[2]) * 60 + Number(coincidencia[3]))
}

/**
 * Convierte `fecha` (YYYY-MM-DD) + `hora` (HH:mm) — tal cual salen de los
 * inputs nativos `type="date"`/`type="time"` de la hoja de agendar visita —
 * a un instante ISO 8601 en UTC, interpretándolos SIEMPRE como hora de
 * America/Monterrey (nunca la zona del dispositivo que ejecuta el código).
 *
 * Devuelve `null` si la combinación no forma una fecha/hora válida.
 */
export function convertirFechaHoraMonterreyAIso(fecha: string, hora: string): string | null {
  // Candidato: se interpreta como si fuera UTC solo para tener un instante
  // aproximado con el que consultar el offset vigente ESE día (el offset no
  // cambia por unas horas de diferencia dentro del mismo día calendario).
  const candidato = new Date(`${fecha}T${hora}:00Z`)
  if (Number.isNaN(candidato.getTime())) return null

  const offsetMin = offsetMinutosMonterrey(candidato)
  // El instante real es el candidato MENOS el offset: si Monterrey está en
  // UTC-6 (offsetMin = -360), "14:30 de Monterrey" son las 20:30 UTC —
  // candidato (que asumió 14:30 UTC) menos (-360 min) = +360 min = 20:30.
  return new Date(candidato.getTime() - offsetMin * 60_000).toISOString()
}

/**
 * Fecha de hoy (YYYY-MM-DD) en America/Monterrey — para el `min` del input
 * de fecha de la hoja (conveniencia de UI; el servidor sigue validando que
 * la fecha sea futura).
 */
export function fechaHoyMonterrey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date())
}

/**
 * Inversa de `convertirFechaHoraMonterreyAIso`: descompone un instante ISO
 * (con offset UTC) en la fecha (YYYY-MM-DD) y hora (HH:mm) "de pared" que
 * un asesor en America/Monterrey leería en su reloj — para precargar los
 * inputs `date`/`time` de la hoja de REAGENDAR con la fecha/hora actual de
 * la visita (nunca la zona horaria del dispositivo que renderiza).
 */
export function descomponerFechaIsoMonterrey(fechaIso: string): { fecha: string; hora: string } {
  const instante = new Date(fechaIso)
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(instante)
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instante)
  return { fecha, hora }
}
