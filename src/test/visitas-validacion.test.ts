import { describe, expect, it } from 'vitest'

import { validarDatosVisita } from '@/lib/visitas/validacion'

describe('validarDatosVisita', () => {
  it('rechaza fecha en el pasado', () => {
    const r = validarDatosVisita({ fecha: '2020-01-01T10:00:00Z', duracionMin: 60 })
    expect(r).toEqual({ error: 'La fecha debe ser futura' })
  })

  it('rechaza duración fuera de rango (menor al mínimo)', () => {
    const r = validarDatosVisita({ fecha: futuraISO(), duracionMin: 10 })
    expect(r).toEqual({ error: 'La duración debe ser de 15 minutos a 8 horas' })
  })

  it('rechaza duración fuera de rango (mayor al máximo)', () => {
    const r = validarDatosVisita({ fecha: futuraISO(), duracionMin: 500 })
    expect(r).toEqual({ error: 'La duración debe ser de 15 minutos a 8 horas' })
  })

  it('acepta datos válidos', () => {
    expect(validarDatosVisita({ fecha: futuraISO(), duracionMin: 60 })).toEqual({ ok: true })
  })

  it('rechaza una fecha no parseable', () => {
    const r = validarDatosVisita({ fecha: 'no-es-una-fecha', duracionMin: 60 })
    expect(r).toEqual({ error: 'La fecha no es válida' })
  })

  it('rechaza cadena vacía como fecha', () => {
    const r = validarDatosVisita({ fecha: '', duracionMin: 60 })
    expect(r).toEqual({ error: 'La fecha no es válida' })
  })

  it('acepta los límites exactos del rango de duración', () => {
    expect(validarDatosVisita({ fecha: futuraISO(), duracionMin: 15 })).toEqual({ ok: true })
    expect(validarDatosVisita({ fecha: futuraISO(), duracionMin: 480 })).toEqual({ ok: true })
  })

  it('rechaza duración no entera', () => {
    const r = validarDatosVisita({ fecha: futuraISO(), duracionMin: 60.5 })
    expect(r).toEqual({ error: 'La duración debe ser de 15 minutos a 8 horas' })
  })
})

function futuraISO() {
  return new Date(Date.now() + 86_400_000).toISOString()
}
