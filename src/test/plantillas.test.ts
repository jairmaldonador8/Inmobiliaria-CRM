import { describe, expect, it } from 'vitest'

import { rellenarPlantilla } from '@/lib/plantillas/rellenar'

// Textos REALES de las plantillas seed (scripts/seed.ts) — si cambian allá,
// estos tests deben cambiar con ellas.
const PRIMER_CONTACTO =
  'Hola {nombre}, soy {asesor} de Montana Realty. Recibimos tu interés, ¿te gustaría agendar una visita?'
const COMPARTIR_PROPIEDAD =
  'Hola {nombre}, te comparto: {propiedad} en {zona} — {precio}. ¿Te interesa verla?'

describe('rellenarPlantilla', () => {
  it('sustituye todas las variables con contexto completo', () => {
    const resultado = rellenarPlantilla(COMPARTIR_PROPIEDAD, {
      nombre: 'Roberto',
      propiedad: 'Casa en Cumbres Elite',
      zona: 'Cumbres, Monterrey',
      precio: '$4,500,000',
      asesor: 'Asesor Uno',
    })
    expect(resultado).toBe(
      'Hola Roberto, te comparto: Casa en Cumbres Elite en Cumbres, Monterrey — $4,500,000. ¿Te interesa verla?'
    )
  })

  it('sustituye nombre y asesor en la plantilla de primer contacto', () => {
    const resultado = rellenarPlantilla(PRIMER_CONTACTO, {
      nombre: 'Roberto',
      asesor: 'Asesor Uno',
    })
    expect(resultado).toBe(
      'Hola Roberto, soy Asesor Uno de Montana Realty. Recibimos tu interés, ¿te gustaría agendar una visita?'
    )
  })

  it('con contexto parcial (solo nombre) omite el resto sin dejar huecos', () => {
    const resultado = rellenarPlantilla(PRIMER_CONTACTO, { nombre: 'Roberto' })
    expect(resultado).toBe(
      'Hola Roberto, soy de Montana Realty. Recibimos tu interés, ¿te gustaría agendar una visita?'
    )
  })

  it('limpia separadores huérfanos («en», «—») cuando faltan zona y precio', () => {
    // Caso del spec: solo propiedad → sin «en — .» colgando.
    const resultado = rellenarPlantilla(COMPARTIR_PROPIEDAD, {
      nombre: 'Roberto',
      propiedad: 'Casa Bonita',
    })
    expect(resultado).toBe('Hola Roberto, te comparto: Casa Bonita. ¿Te interesa verla?')
  })

  it('con contexto vacío elimina variables y espacios antes de puntuación', () => {
    const resultado = rellenarPlantilla('Hola {nombre}, ¿cómo estás?', {})
    expect(resultado).toBe('Hola, ¿cómo estás?')
  })

  it('con contexto vacío la plantilla de primer contacto sigue legible', () => {
    const resultado = rellenarPlantilla(PRIMER_CONTACTO, {})
    expect(resultado).toBe(
      'Hola, soy de Montana Realty. Recibimos tu interés, ¿te gustaría agendar una visita?'
    )
  })

  it('trata cadenas vacías o de espacios como variable faltante', () => {
    const resultado = rellenarPlantilla('Hola {nombre}, saludos.', { nombre: '   ' })
    expect(resultado).toBe('Hola, saludos.')
  })

  it('deja intacto un texto sin variables', () => {
    const texto = 'Buen día, ¿sigue interesado en la propiedad?'
    expect(rellenarPlantilla(texto, { nombre: 'Roberto' })).toBe(texto)
  })

  it('sustituye la misma variable repetida más de una vez', () => {
    const resultado = rellenarPlantilla('{nombre}, confirmo, {nombre}.', { nombre: 'Ana' })
    expect(resultado).toBe('Ana, confirmo, Ana.')
  })

  it('no toca variables desconocidas', () => {
    const resultado = rellenarPlantilla('Hola {nombre} {desconocida}', { nombre: 'Ana' })
    expect(resultado).toBe('Hola Ana {desconocida}')
  })
})
