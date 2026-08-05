/**
 * Umbral compartido entre la urgencia de escritorio (`urgencia()` en
 * src/app/(admin)/admin/bandeja/page.tsx) y la binaria de móvil
 * (`esUrgente` abajo): una hora en milisegundos.
 */
export const HORA_MS = 60 * 60 * 1000

/**
 * Urgencia binaria de un lead en la bandeja (móvil): true si lleva 24h o
 * más esperando asignación.
 *
 * Frontera INCLUSIVA en 24h a propósito, para coincidir con el desktop: su
 * `urgencia()` usa `horas < 24` para el tramo ámbar y cae al tramo rojo en
 * `horas === 24` — es decir, el desktop también considera urgente desde
 * las 24h exactas, no solo después.
 *
 * Acepta `ahora` (epoch ms) para pruebas deterministas; por defecto usa el
 * reloj real.
 */
export function esUrgente(creadoEn: string, ahora: number = Date.now()): boolean {
  return ahora - new Date(creadoEn).getTime() >= 24 * HORA_MS
}
