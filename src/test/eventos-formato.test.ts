// @vitest-environment node
/**
 * Tests TDD para src/lib/eventos/formato.ts: etiquetas en español de cada
 * tipo de evento de lead_eventos + mapa de iconos. Cubre los fallbacks
 * críticos: reasignación a null (devolución a bandeja), nombres que no
 * resolvieron (RLS del asesor solo deja leer su propia fila de usuarios) y
 * tipos desconocidos.
 */
import { describe, expect, it } from 'vitest'

import { ICONOS_EVENTO, etiquetaEvento, iconoEvento } from '@/lib/eventos/formato'

const NOMBRES = new Map<string, string>([
  ['uid-ana', 'Ana Pérez'],
  ['uid-luis', 'Luis Garza'],
])

describe('etiquetaEvento', () => {
  it('lead_creado con fuente portal + detalle muestra el portal concreto', () => {
    expect(
      etiquetaEvento('lead_creado', { fuente: 'portal', fuente_detalle: 'inmuebles24' }, NOMBRES)
    ).toBe('Llegó desde inmuebles24')
  })

  it('lead_creado con fuente sin detalle usa la etiqueta de la fuente', () => {
    expect(etiquetaEvento('lead_creado', { fuente: 'referido' }, NOMBRES)).toBe(
      'Llegó desde Referido'
    )
  })

  it('lead_creado sin fuente en el payload cae a un texto genérico', () => {
    expect(etiquetaEvento('lead_creado', {}, NOMBRES)).toBe('Se creó el lead')
  })

  it('lead_asignado resuelve el nombre del asesor destino', () => {
    expect(etiquetaEvento('lead_asignado', { de: null, a: 'uid-ana' }, NOMBRES)).toBe(
      'Se asignó a Ana Pérez'
    )
  })

  it('lead_asignado sin nombre resuelto no muestra "undefined"', () => {
    expect(etiquetaEvento('lead_asignado', { a: 'uid-desconocido' }, NOMBRES)).toBe(
      'Se asignó a un asesor'
    )
  })

  it('lead_reasignado con destino resuelve el nombre', () => {
    expect(etiquetaEvento('lead_reasignado', { de: 'uid-ana', a: 'uid-luis' }, NOMBRES)).toBe(
      'Se reasignó a Luis Garza'
    )
  })

  it('lead_reasignado con a=null es una devolución a la bandeja (nunca "undefined")', () => {
    const etiqueta = etiquetaEvento('lead_reasignado', { de: 'uid-ana', a: null }, NOMBRES)
    expect(etiqueta).toBe('Se devolvió a la bandeja')
    expect(etiqueta).not.toContain('undefined')
  })

  it('etapa_cambiada usa la etiqueta de etapa de la casa', () => {
    expect(etiquetaEvento('etapa_cambiada', { de: 'nuevo', a: 'cita_agendada' }, NOMBRES)).toBe(
      'Pasó a Cita agendada'
    )
  })

  it('lead_archivado y lead_desarchivado tienen etiqueta propia', () => {
    expect(etiquetaEvento('lead_archivado', {}, NOMBRES)).toBe('Se archivó el lead')
    expect(etiquetaEvento('lead_desarchivado', {}, NOMBRES)).toBe('Se reactivó el lead')
  })

  it('seguimiento_registrado incluye el tipo de seguimiento en español', () => {
    expect(etiquetaEvento('seguimiento_registrado', { tipo: 'llamada' }, NOMBRES)).toBe(
      'Seguimiento registrado: Llamada'
    )
  })

  it('seguimiento_registrado sin tipo cae al texto genérico', () => {
    expect(etiquetaEvento('seguimiento_registrado', {}, NOMBRES)).toBe('Seguimiento registrado')
  })

  it('whatsapp_enviado y whatsapp_desenlace', () => {
    expect(etiquetaEvento('whatsapp_enviado', { contacto_id: 'c1' }, NOMBRES)).toBe(
      'Se le envió WhatsApp'
    )
    expect(
      etiquetaEvento('whatsapp_desenlace', { contacto_id: 'c1', desenlace: 'cita' }, NOMBRES)
    ).toBe('WhatsApp: Agendé una cita')
  })

  it('whatsapp_desenlace sin desenlace cae al texto genérico', () => {
    expect(etiquetaEvento('whatsapp_desenlace', {}, NOMBRES)).toBe(
      'Se registró el desenlace del WhatsApp'
    )
  })

  it('visitas: agendada, reagendada, realizada y cancelada', () => {
    expect(etiquetaEvento('visita_agendada', { visita_id: 'v1' }, NOMBRES)).toBe('Visita agendada')
    expect(etiquetaEvento('visita_agendada', { visita_id: 'v1', reagendada: true }, NOMBRES)).toBe(
      'Visita reagendada'
    )
    expect(etiquetaEvento('visita_realizada', {}, NOMBRES)).toBe('Visita realizada')
    expect(etiquetaEvento('visita_cancelada', {}, NOMBRES)).toBe('Visita cancelada')
  })

  it('tomado_de_bandeja', () => {
    expect(etiquetaEvento('tomado_de_bandeja', {}, NOMBRES)).toBe('Tomó el lead de la bandeja')
  })

  it('supervisión: escalamiento_paso traduce el paso a prosa y push_recordatorio es fijo', () => {
    expect(etiquetaEvento('escalamiento_paso', { paso: 'recordatorio_r1' }, NOMBRES)).toBe(
      'Escalamiento: recordatorio al asesor (ronda 1)'
    )
    expect(etiquetaEvento('escalamiento_paso', { paso: 'abierto_r2' }, NOMBRES)).toBe(
      'Escalamiento: abierto a todos (ronda 2)'
    )
    expect(etiquetaEvento('escalamiento_paso', { paso: 'dueno_120' }, NOMBRES)).toBe(
      'Escalamiento: aviso al dueño'
    )
    expect(etiquetaEvento('escalamiento_paso', { paso: 'recordatorio_vip' }, NOMBRES)).toBe(
      'Escalamiento: recordatorio VIP'
    )
    // Un paso desconocido se muestra tal cual (tolerante, sin inventar prosa).
    expect(etiquetaEvento('escalamiento_paso', { paso: 'paso_nuevo' }, NOMBRES)).toBe(
      'Escalamiento: paso_nuevo'
    )
    expect(etiquetaEvento('escalamiento_paso', {}, NOMBRES)).toBe('Escalamiento')
    expect(etiquetaEvento('push_recordatorio', { paso: 'recordatorio_vip' }, NOMBRES)).toBe(
      'Recordatorio enviado'
    )
  })

  it('tipo desconocido cae al propio tipo (tolerante)', () => {
    expect(etiquetaEvento('tipo_inventado', {}, NOMBRES)).toBe('tipo_inventado')
  })

  it('el payload de backfill trae backfill como STRING "true" y no afecta la etiqueta', () => {
    expect(
      etiquetaEvento('lead_creado', { fuente: 'portal', backfill: 'true' }, NOMBRES)
    ).toBe('Llegó desde Portal')
  })
})

describe('iconoEvento', () => {
  it('todos los tipos del vocabulario tienen icono propio', () => {
    const tipos = [
      'lead_creado',
      'lead_asignado',
      'lead_reasignado',
      'etapa_cambiada',
      'lead_archivado',
      'lead_desarchivado',
      'seguimiento_registrado',
      'whatsapp_enviado',
      'whatsapp_desenlace',
      'visita_agendada',
      'visita_realizada',
      'visita_cancelada',
      'tomado_de_bandeja',
      'escalamiento_paso',
      'push_recordatorio',
    ]
    for (const tipo of tipos) {
      expect(ICONOS_EVENTO[tipo], `falta icono para ${tipo}`).toBeDefined()
    }
  })

  it('tipo desconocido cae a un icono por defecto sin reventar', () => {
    expect(iconoEvento('tipo_inventado')).toBeDefined()
  })
})
