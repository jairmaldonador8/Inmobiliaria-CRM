// @vitest-environment node
/**
 * Regla de la lista «Sin respuesta». Pura: recibe leads y contactos ya
 * consultados y decide cuáles se listan.
 *
 * Lo que se prueba es el NO: que un lead que ya contestó salga, aunque
 * arrastre un «no me contestó» viejo.
 */
import { describe, expect, it } from 'vitest'

import { leadsSinRespuesta } from '@/lib/contactos/consultas'

const LEADS = [
  { id: 'l1', nombre: 'Ana', clasificacion_eb: null },
  { id: 'l2', nombre: 'Beto', clasificacion_eb: 'cliente_directo' },
  { id: 'l3', nombre: 'Caro', clasificacion_eb: 'saliente' },
]

describe('leadsSinRespuesta', () => {
  it('lista un lead cuyo contacto más reciente está pendiente', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toEqual(['l1'])
  })

  it('NO lista un lead que ya contestó, aunque tenga un no_contesto viejo', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'no_contesto', creado_en: '2026-08-03T10:00:00Z' },
      { lead_id: 'l1', resultado: 'contesto', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })

  it('sí lista si el más reciente es pendiente aunque el viejo esté contestado', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'contesto', creado_en: '2026-08-03T10:00:00Z' },
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toEqual(['l1'])
  })

  it('conserva los leads con clasificacion_eb null: no se penaliza por falta de dato', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida.map((l) => l.id)).toContain('l1')
  })

  it('excluye los «saliente»: no son leads, son gestion nuestra', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l3', resultado: 'pendiente', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })

  it('un lead sin contactos no aparece', () => {
    expect(leadsSinRespuesta(LEADS, [])).toEqual([])
  })

  it('no depende del orden de entrada: el contacto más reciente puede venir primero', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'contesto', creado_en: '2026-08-07T10:00:00Z' },
      { lead_id: 'l1', resultado: 'no_contesto', creado_en: '2026-08-03T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })

  it('NO lista si el contacto más reciente es sin_reporte', () => {
    const salida = leadsSinRespuesta(LEADS, [
      { lead_id: 'l1', resultado: 'no_contesto', creado_en: '2026-08-03T10:00:00Z' },
      { lead_id: 'l1', resultado: 'sin_reporte', creado_en: '2026-08-07T10:00:00Z' },
    ])
    expect(salida).toEqual([])
  })
})
