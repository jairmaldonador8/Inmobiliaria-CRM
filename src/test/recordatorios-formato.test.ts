import { describe, expect, it } from 'vitest'

import {
  estaVencido,
  etiquetaFechaRecordatorio,
  opcionesRapidas,
} from '@/lib/recordatorios/formato'

// Monterrey es UTC-6 (sin horario de verano desde 2022): 10:00 de pared en
// Monterrey son las 16:00Z del mismo día.
const MANANA_MTY = new Date('2026-08-18T16:00:00Z') // 10:00 am en Monterrey
const NOCHE_MTY = new Date('2026-08-19T02:00:00Z') // 8:00 pm del 18 en Monterrey

describe('opcionesRapidas', () => {
  it('en la mañana ofrece las 4 opciones, empezando por hoy en la tarde (16:00 MTY)', () => {
    const opciones = opcionesRapidas(MANANA_MTY)
    expect(opciones.map((o) => o.etiqueta)).toEqual([
      'Hoy en la tarde',
      'Mañana 9:00',
      'En 3 días',
      'Próxima semana',
    ])
    // 16:00 de Monterrey del 2026-08-18 = 22:00Z.
    expect(opciones[0].fechaIso).toBe('2026-08-18T22:00:00.000Z')
    // Mañana 9:00 de Monterrey = 15:00Z del día siguiente.
    expect(opciones[1].fechaIso).toBe('2026-08-19T15:00:00.000Z')
    expect(opciones[2].fechaIso).toBe('2026-08-21T15:00:00.000Z')
    expect(opciones[3].fechaIso).toBe('2026-08-25T15:00:00.000Z')
  })

  it('después de las 15:00 de Monterrey ya no ofrece «hoy en la tarde»', () => {
    const opciones = opcionesRapidas(NOCHE_MTY)
    expect(opciones.map((o) => o.etiqueta)).toEqual([
      'Mañana 9:00',
      'En 3 días',
      'Próxima semana',
    ])
    // «Mañana» es relativo al día calendario de MONTERREY (aún 18 de agosto
    // a las 8 pm, aunque en UTC ya sea 19): mañana = 19 a las 9:00 = 15:00Z.
    expect(opciones[0].fechaIso).toBe('2026-08-19T15:00:00.000Z')
  })

  it('todas las opciones quedan a futuro respecto de ahora', () => {
    for (const ahora of [MANANA_MTY, NOCHE_MTY]) {
      for (const opcion of opcionesRapidas(ahora)) {
        expect(new Date(opcion.fechaIso).getTime()).toBeGreaterThan(ahora.getTime())
      }
    }
  })
})

describe('estaVencido', () => {
  it('vencido cuando la fecha ya pasó (o es exactamente ahora)', () => {
    expect(estaVencido('2026-08-18T15:59:00Z', MANANA_MTY)).toBe(true)
    expect(estaVencido('2026-08-18T16:00:00Z', MANANA_MTY)).toBe(true)
    expect(estaVencido('2026-08-18T16:01:00Z', MANANA_MTY)).toBe(false)
  })
})

describe('etiquetaFechaRecordatorio', () => {
  it('el mismo día de Monterrey se lee como «hoy»', () => {
    expect(etiquetaFechaRecordatorio('2026-08-18T22:00:00Z', MANANA_MTY)).toBe('hoy 4:00 pm')
  })

  it('el día siguiente de Monterrey se lee como «mañana»', () => {
    expect(etiquetaFechaRecordatorio('2026-08-19T15:00:00Z', MANANA_MTY)).toBe('mañana 9:00 am')
  })

  it('más lejos trae día y fecha cortos', () => {
    const etiqueta = etiquetaFechaRecordatorio('2026-08-21T15:00:00Z', MANANA_MTY)
    expect(etiqueta).toContain('21')
    expect(etiqueta).toContain('9:00 am')
  })
})
