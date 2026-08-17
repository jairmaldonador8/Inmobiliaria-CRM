/**
 * Resumen en cifras del historial de contacto de un lead (pedido del Live
 * test 2026-08-17: el timeline vertical no deja ver de un vistazo cuánto
 * se le ha buscado — «tantas llamadas, tantos WhatsApp…»).
 *
 * Cuenta INTERACCIONES, no filas: los desenlaces (llamada_desenlace,
 * whatsapp_desenlace) son el cierre de la misma llamada/mensaje ya contado,
 * y una visita solo cuenta cuando se REALIZÓ (agendar no es contactar).
 * Opera sobre la historia ya fusionada (fusionarHistoria), que viene capada
 * a los últimos 50 items — el resumen hereda esa ventana.
 */
import type { EventoTimeline } from '@/lib/eventos/consultas'

export type ResumenHistoria = {
  llamadas: number
  whatsapps: number
  visitas: number
  correos: number
  notas: number
  total: number
}

export function resumirHistoria(historia: EventoTimeline[]): ResumenHistoria {
  const resumen: ResumenHistoria = {
    llamadas: 0,
    whatsapps: 0,
    visitas: 0,
    correos: 0,
    notas: 0,
    total: 0,
  }

  for (const item of historia) {
    switch (item.tipo) {
      case 'llamada_iniciada':
      case 'seg:llamada':
        resumen.llamadas += 1
        break
      case 'whatsapp_enviado':
      case 'seg:whatsapp':
        resumen.whatsapps += 1
        break
      case 'visita_realizada':
      case 'seg:visita':
        resumen.visitas += 1
        break
      case 'seg:correo':
        resumen.correos += 1
        break
      case 'seg:otro':
        resumen.notas += 1
        break
    }
  }

  resumen.total =
    resumen.llamadas + resumen.whatsapps + resumen.visitas + resumen.correos + resumen.notas
  return resumen
}
