import { describe, expect, it } from 'vitest'

import {
  armarMensajeConfirmacionVisita,
  armarUrlConfirmacionVisita,
} from '@/lib/visitas/confirmacion-whatsapp'

// 18:30 UTC es 12:30 en America/Monterrey (UTC-6, sin horario de verano
// desde 2022) — fija el instante para no depender del reloj real.
const FECHA_ISO = '2026-09-15T18:30:00.000Z'

describe('armarMensajeConfirmacionVisita', () => {
  it('arma el mensaje con propiedad', () => {
    const mensaje = armarMensajeConfirmacionVisita({
      leadNombre: 'Ana',
      fecha: FECHA_ISO,
      duracionMin: 60,
      propiedadTitulo: 'Casa Bonita',
      asesorNombre: 'Luis',
    })

    expect(mensaje).toContain('Ana')
    expect(mensaje).toContain('Casa Bonita')
    expect(mensaje).toContain('Luis')
  })

  it('arma el mensaje SIN propiedad (la propiedad es opcional) y se lee bien', () => {
    const mensaje = armarMensajeConfirmacionVisita({
      leadNombre: 'Ana',
      fecha: FECHA_ISO,
      duracionMin: 60,
      propiedadTitulo: null,
      asesorNombre: 'Luis',
    })

    expect(mensaje).toContain('Ana')
    expect(mensaje).toContain('Luis')
    // Sin propiedad no debe quedar un hueco raro tipo "visita  el" (doble
    // espacio) ni un conector colgando ("visita para el").
    expect(mensaje).not.toMatch(/\s{2,}/)
    expect(mensaje).not.toMatch(/para el/)
  })

  it('formatea la fecha en es-MX y zona America/Monterrey (no en UTC)', () => {
    const mensaje = armarMensajeConfirmacionVisita({
      leadNombre: 'Ana',
      fecha: FECHA_ISO,
      duracionMin: 60,
      propiedadTitulo: null,
      asesorNombre: 'Luis',
    })

    // 15 de septiembre en es-MX; 12:30 (hora de Monterrey), no 18:30 (UTC).
    expect(mensaje).toContain('15 de septiembre de 2026')
    expect(mensaje).toContain('12:30')
    expect(mensaje).not.toContain('18:30')
  })

  it('muestra la duración en horas cuando es de 60 minutos o más', () => {
    const mensaje = armarMensajeConfirmacionVisita({
      leadNombre: 'Ana',
      fecha: FECHA_ISO,
      duracionMin: 90,
      propiedadTitulo: null,
      asesorNombre: 'Luis',
    })

    expect(mensaje).toMatch(/1 hora 30 min/)
  })

  it('muestra la duración en minutos cuando es menor a 60', () => {
    const mensaje = armarMensajeConfirmacionVisita({
      leadNombre: 'Ana',
      fecha: FECHA_ISO,
      duracionMin: 30,
      propiedadTitulo: null,
      asesorNombre: 'Luis',
    })

    expect(mensaje).toMatch(/30 min/)
  })
})

describe('armarUrlConfirmacionVisita', () => {
  it('arma la URL de wa.me con el mensaje codificado', () => {
    const url = armarUrlConfirmacionVisita('528100000000', 'Hola, ¿cómo estás?')
    expect(url).toBe(
      'https://wa.me/528100000000?text=' + encodeURIComponent('Hola, ¿cómo estás?')
    )
  })
})

// Los tests de `convertirFechaHoraMonterreyAIso` y `fechaHoyMonterrey` viven
// en `src/test/fechas-monterrey.test.ts` junto con el resto de las
// funciones puras de `src/lib/fechas/monterrey.ts` (fuente única de verdad).
