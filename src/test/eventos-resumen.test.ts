// @vitest-environment node
/**
 * resumirHistoria: el resumen del historial de contacto cuenta
 * INTERACCIONES — los desenlaces no duplican y agendar una visita no es
 * contactar (Live test 2026-08-17).
 */
import { describe, expect, it } from 'vitest'

import type { EventoTimeline } from '@/lib/eventos/consultas'
import { resumirHistoria } from '@/lib/eventos/resumen'

function item(tipo: string): EventoTimeline {
  return { id: tipo + Math.random(), tipo, etiqueta: tipo, actor_nombre: null, ocurrido_en: '2026-08-17T12:00:00Z' }
}

describe('resumirHistoria', () => {
  it('cuenta llamadas, WhatsApp, visitas, correos y notas de ambas fuentes', () => {
    const historia = [
      item('llamada_iniciada'),
      item('seg:llamada'),
      item('whatsapp_enviado'),
      item('seg:whatsapp'),
      item('seg:whatsapp'),
      item('visita_realizada'),
      item('seg:correo'),
      item('seg:otro'),
    ]
    expect(resumirHistoria(historia)).toEqual({
      llamadas: 2,
      whatsapps: 3,
      visitas: 1,
      correos: 1,
      notas: 1,
      total: 8,
    })
  })

  it('NO cuenta desenlaces (misma interacción), visitas solo agendadas, ni eventos de sistema', () => {
    const historia = [
      item('llamada_desenlace'),
      item('whatsapp_desenlace'),
      item('visita_agendada'),
      item('visita_cancelada'),
      item('lead_creado'),
      item('etapa_cambiada'),
      item('lead_asignado'),
      item('escalamiento_paso'),
      item('seg:sistema'),
    ]
    expect(resumirHistoria(historia).total).toBe(0)
  })
})
