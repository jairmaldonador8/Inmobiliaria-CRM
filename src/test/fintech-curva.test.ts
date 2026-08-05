/**
 * Tests TDD para `src/lib/fintech/curva.ts`: generación pura (sin React)
 * de paths SVG suaves (Catmull-Rom → Bézier cúbica) a partir de una serie
 * de puntos. Se prueban casos borde (0/1 puntos), un segmento único (2
 * puntos), los valores numéricos exactos de los puntos de control sobre
 * una entrada de 4 puntos conocida (para blindar la fórmula — en
 * particular que B2 RESTA, no suma), el clamp del eje Y de los controles
 * al rango del propio segmento, y el cierre del área hasta el baseline.
 */
import { describe, expect, it } from 'vitest'

import { dArea, dLinea } from '@/lib/fintech/curva'

describe('dLinea', () => {
  it('con 0 puntos devuelve cadena vacía', () => {
    expect(dLinea([])).toBe('')
  })

  it('con 1 punto devuelve cadena vacía', () => {
    expect(dLinea([{ x: 5, y: 5 }])).toBe('')
  })

  it('con 2 puntos devuelve un único segmento "M ... C ..."', () => {
    const d = dLinea([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])

    expect(d).toBe('M 0,0 C 1.67,1.67 8.33,8.33 10,10')
  })

  it('con 4 puntos calcula los puntos de control Catmull-Rom exactos (B2 resta)', () => {
    const d = dLinea([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
    ])

    expect(d).toBe(
      'M 0,0 ' +
        'C 1.67,3.33 6.67,20 10,20 ' +
        'C 13.33,20 16.67,0 20,0 ' +
        'C 23.33,0 28.33,16.67 30,20'
    )
  })

  it('clampea el eje Y de los puntos de control al rango del segmento (sin inventar picos)', () => {
    const d = dLinea([
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 100, y: 0 },
    ])

    // Extrae todas las coordenadas Y de los comandos M/C (cada par "x,y").
    const coordenadas = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) ?? []
    const ys = coordenadas.map((par) => Number(par.split(',')[1]))

    expect(ys.length).toBeGreaterThan(0)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(10)
    }
  })
})

describe('dArea', () => {
  it('con 0 o 1 puntos devuelve cadena vacía', () => {
    expect(dArea([], 72)).toBe('')
    expect(dArea([{ x: 5, y: 5 }], 72)).toBe('')
  })

  it('cierra la curva hasta el baseline: "<dLinea> L xN,baseline L x0,baseline Z"', () => {
    const puntos = [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 100, y: 0 },
    ]
    const linea = dLinea(puntos)

    expect(dArea(puntos, 72)).toBe(`${linea} L 100,72 L 0,72 Z`)
  })

  it('redondea el baseline a 2 decimales igual que el resto de coordenadas', () => {
    const puntos = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]

    expect(dArea(puntos, 71.999)).toContain('L 10,72 L 0,72 Z')
  })
})
