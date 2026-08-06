/**
 * Fuente única de verdad para todo lo relacionado con fechas/horas en la
 * zona horaria del negocio (America/Monterrey).
 *
 * Antes de este módulo, la misma lógica vivía duplicada en varios lugares:
 * `offsetMinutosMonterrey` en `src/lib/dashboard/consultas.ts` y en
 * `src/components/visitas/zona-horaria-monterrey.ts`; el formateo de
 * fecha/hora (`formatearFechaVisita`) triplicado en
 * `src/lib/visitas/acciones.ts`, `src/components/visitas/confirmacion-whatsapp.ts`
 * y `src/app/(asesor)/asesor/page.tsx`; y la clave de día calendario
 * (`diaMonterrey`/`fechaHoyMonterrey`) repetida en `consultas.ts` y en
 * `zona-horaria-monterrey.ts`. Con Google Calendar (espejo de visitas y
 * consulta de disponibilidad) por delante, esas copias iban a seguir
 * creciendo — de ahí este módulo.
 *
 * Sin `server-only` y sin `'use client'`: se consume desde server actions,
 * Server Components y Client Components por igual (mismo criterio que
 * `src/lib/visitas/validacion.ts`).
 *
 * El repo NO tiene `@date-fns/tz` instalado (ver package.json) — todo se
 * deriva con `Intl.DateTimeFormat`, sin asumir un offset fijo: México
 * eliminó el horario de verano en la mayor parte del país en 2022, pero
 * calcularlo en vivo evita depender de esa regla.
 */

export const ZONA_HORARIA = 'America/Monterrey'

/** Clave de día calendario (`YYYY-MM-DD`) de `fecha` en America/Monterrey. */
export function diaMonterrey(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(fecha)
}

/**
 * Offset UTC (en minutos, p. ej. -360 para UTC-6) vigente en
 * America/Monterrey en el instante `fecha`. Se calcula en vivo con Intl en
 * vez de asumir un valor fijo: México eliminó el horario de verano en la
 * mayor parte del país en 2022, pero calcularlo evita depender de esa regla.
 */
export function offsetMinutosMonterrey(fecha: Date): number {
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

/** Instante UTC de las 00:00:00 del día calendario `claveDia` (`YYYY-MM-DD`) en America/Monterrey. */
export function inicioDeDiaMonterrey(claveDia: string): Date {
  // `claveDia` interpretada como UTC es solo un candidato: se ajusta con el
  // offset real vigente ese día para llegar al instante UTC correcto.
  const candidato = new Date(`${claveDia}T00:00:00Z`)
  const offset = offsetMinutosMonterrey(candidato)
  return new Date(candidato.getTime() - offset * 60_000)
}

/** Instante UTC del inicio del día de hoy (según `ahora`) en America/Monterrey. */
export function inicioDeHoyMonterrey(ahora: Date): Date {
  return inicioDeDiaMonterrey(diaMonterrey(ahora))
}

/** Instante UTC del inicio del mes actual (según `ahora`) en America/Monterrey. */
export function inicioDeMesMonterrey(ahora: Date): Date {
  const claveDia = diaMonterrey(ahora)
  const primerDiaDelMes = `${claveDia.slice(0, 7)}-01`
  return inicioDeDiaMonterrey(primerDiaDelMes)
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

/**
 * Fecha de hoy (YYYY-MM-DD) en America/Monterrey — para el `min` del input
 * de fecha de la hoja (conveniencia de UI; el servidor sigue validando que
 * la fecha sea futura).
 */
export function fechaHoyMonterrey(): string {
  return diaMonterrey(new Date())
}

/** Fecha/hora legible en español, en la zona horaria del negocio. */
export function formatearFechaHoraMonterrey(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(fecha))
}
