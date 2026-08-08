// @vitest-environment node
/**
 * Vocabulario de contactos de WhatsApp. Funciones puras, sin I/O.
 *
 * El valor está en `esSinRespuesta`: es la regla que decide si un lead
 * aparece en la lista «Sin respuesta», y equivocarla o deja leads invisibles
 * o hace que la lista crezca para siempre.
 */
import { describe, expect, it } from 'vitest'

import { esSinRespuesta, etiquetaResultado } from '@/lib/contactos/formato'

describe('esSinRespuesta', () => {
  it('un contacto pendiente cuenta como sin respuesta', () => {
    expect(esSinRespuesta('pendiente')).toBe(true)
  })

  it('«no me contestó» tambien cuenta: nadie respondio todavia', () => {
    expect(esSinRespuesta('no_contesto')).toBe(true)
  })

  it('«me contestó» NO cuenta', () => {
    expect(esSinRespuesta('contesto')).toBe(false)
  })

  it('cita y no_interesa NO cuentan: el lead ya avanzo o se cerro', () => {
    expect(esSinRespuesta('cita')).toBe(false)
    expect(esSinRespuesta('no_interesa')).toBe(false)
  })

  it('sin_reporte NO cuenta: fue reemplazado por un contacto posterior', () => {
    expect(esSinRespuesta('sin_reporte')).toBe(false)
  })

  it('tolera un valor desconocido sin reventar', () => {
    expect(esSinRespuesta('lo_que_sea')).toBe(false)
  })
})

describe('etiquetaResultado', () => {
  it('traduce al español del asesor', () => {
    expect(etiquetaResultado('no_contesto')).toBe('No me contestó')
  })
})
