import { describe, expect, it } from 'vitest'

import {
  armarMensajeConfirmacionVisita,
  armarUrlConfirmacionVisita,
} from '@/components/visitas/confirmacion-whatsapp'
import {
  convertirFechaHoraMonterreyAIso,
  fechaHoyMonterrey,
} from '@/components/visitas/zona-horaria-monterrey'

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

describe('convertirFechaHoraMonterreyAIso', () => {
  it('interpreta la fecha/hora tecleada como America/Monterrey (UTC-6), no la zona del dispositivo', () => {
    // 15 de septiembre de 2026, 14:30 EN MONTERREY → 20:30 UTC (UTC-6, sin
    // horario de verano desde 2022). Literal fijo — NO recalculado con la
    // misma fórmula de la implementación — para que un regreso a "hora
    // local del dispositivo" sí reviente este test.
    expect(convertirFechaHoraMonterreyAIso('2026-09-15', '14:30')).toBe('2026-09-15T20:30:00.000Z')
  })

  it('mismo offset en otra fecha del año (México no observa horario de verano desde 2022)', () => {
    expect(convertirFechaHoraMonterreyAIso('2026-01-01', '08:00')).toBe('2026-01-01T14:00:00.000Z')
  })

  it('el resultado NO depende de la zona horaria del proceso que ejecuta el código', () => {
    // Si el helper leyera (aunque fuera indirectamente) la zona del
    // dispositivo/proceso en vez de fijar 'America/Monterrey' en el
    // Intl.DateTimeFormat, este resultado cambiaría al cambiar TZ.
    const zonaOriginal = process.env.TZ
    try {
      process.env.TZ = 'Pacific/Auckland'
      expect(convertirFechaHoraMonterreyAIso('2026-09-15', '14:30')).toBe(
        '2026-09-15T20:30:00.000Z'
      )
    } finally {
      process.env.TZ = zonaOriginal
    }
  })

  it('devuelve null si la fecha/hora no forma un instante válido', () => {
    expect(convertirFechaHoraMonterreyAIso('no-es-fecha', '14:30')).toBeNull()
  })
})

describe('fechaHoyMonterrey', () => {
  it('devuelve una fecha en formato YYYY-MM-DD', () => {
    expect(fechaHoyMonterrey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
