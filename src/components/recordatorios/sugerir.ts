/**
 * Puente mínimo entre hojas: cuando el asesor termina de reportar actividad
 * (desenlace de contacto, seguimiento manual), la hoja que lo atendió
 * SUGIERE pactar el siguiente follow-up. `CardRecordatorio` — montado por el
 * Server Component de la ficha — escucha el evento y abre su hoja.
 *
 * Es un CustomEvent del `window` a propósito: las hojas y la card son
 * subárboles de cliente HERMANOS bajo una página de servidor, así que un
 * contexto de React exigiría un wrapper de cliente alrededor de media ficha
 * solo para pasar un «ábrete». El evento cruza sin acoplar nada.
 */

export const EVENTO_SUGERIR_RECORDATORIO = 'kloser:sugerir-recordatorio'

export type DetalleSugerirRecordatorio = { leadId: string }

export function sugerirRecordatorio(leadId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DetalleSugerirRecordatorio>(EVENTO_SUGERIR_RECORDATORIO, {
      detail: { leadId },
    })
  )
}
