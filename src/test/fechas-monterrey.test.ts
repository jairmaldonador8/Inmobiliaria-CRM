// @vitest-environment node
/**
 * Tests para src/lib/fechas/monterrey.ts — fuente única de verdad de todo lo
 * relacionado con fechas/horas en America/Monterrey. Consolida tests que
 * antes vivían repartidos en:
 *  - src/test/dashboard-consultas.test.ts (diaMonterrey, inicioDeHoyMonterrey,
 *    inicioDeMesMonterrey — antes exportadas desde src/lib/dashboard/consultas.ts)
 *  - src/test/visitas-confirmacion-whatsapp.test.ts (convertirFechaHoraMonterreyAIso,
 *    fechaHoyMonterrey — antes exportadas desde
 *    src/components/visitas/zona-horaria-monterrey.ts)
 *
 * America/Monterrey es UTC-6 fijo (México eliminó el horario de verano en
 * 2022 para la mayor parte del país) — verificado en vivo con Intl antes de
 * escribir estas fechas de prueba.
 */
import { describe, expect, it } from 'vitest'

import {
  convertirFechaHoraMonterreyAIso,
  descomponerFechaIsoMonterrey,
  diaMonterrey,
  fechaHoyMonterrey,
  formatearFechaHoraMonterrey,
  inicioDeHoyMonterrey,
  inicioDeMesMonterrey,
} from '@/lib/fechas/monterrey'

const AHORA = new Date('2026-03-15T12:00:00.000Z') // 2026-03-15 06:00 Monterrey

describe('diaMonterrey / inicioDeHoyMonterrey / inicioDeMesMonterrey', () => {
  it('un instante a medianoche UTC cae en el día calendario ANTERIOR en Monterrey', () => {
    expect(diaMonterrey(new Date('2026-03-15T00:00:00.000Z'))).toBe('2026-03-14')
  })

  it('un instante a las 06:00 UTC ya cae en el día calendario correspondiente en Monterrey', () => {
    expect(diaMonterrey(new Date('2026-03-15T06:00:00.000Z'))).toBe('2026-03-15')
  })

  it('inicioDeHoyMonterrey devuelve las 06:00 UTC (00:00 Monterrey) del día de `ahora`', () => {
    expect(inicioDeHoyMonterrey(AHORA).toISOString()).toBe('2026-03-15T06:00:00.000Z')
  })

  it('inicioDeMesMonterrey devuelve las 06:00 UTC del día 1 del mes de `ahora`', () => {
    expect(inicioDeMesMonterrey(AHORA).toISOString()).toBe('2026-03-01T06:00:00.000Z')
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

describe('descomponerFechaIsoMonterrey', () => {
  it('es la inversa de convertirFechaHoraMonterreyAIso', () => {
    expect(descomponerFechaIsoMonterrey('2026-09-15T20:30:00.000Z')).toEqual({
      fecha: '2026-09-15',
      hora: '14:30',
    })
  })

  it('no depende de la zona horaria del proceso que ejecuta el código', () => {
    const zonaOriginal = process.env.TZ
    try {
      process.env.TZ = 'Pacific/Auckland'
      expect(descomponerFechaIsoMonterrey('2026-09-15T20:30:00.000Z')).toEqual({
        fecha: '2026-09-15',
        hora: '14:30',
      })
    } finally {
      process.env.TZ = zonaOriginal
    }
  })
})

describe('fechaHoyMonterrey', () => {
  it('devuelve una fecha en formato YYYY-MM-DD', () => {
    expect(fechaHoyMonterrey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatearFechaHoraMonterrey', () => {
  it('formatea la fecha en es-MX y zona America/Monterrey (no en UTC)', () => {
    // 18:30 UTC es 12:30 en America/Monterrey (UTC-6, sin horario de verano
    // desde 2022).
    const texto = formatearFechaHoraMonterrey('2026-09-15T18:30:00.000Z')

    expect(texto).toContain('15 de septiembre de 2026')
    expect(texto).toContain('12:30')
    expect(texto).not.toContain('18:30')
  })
})
