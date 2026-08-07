// @vitest-environment node
/**
 * Tests TDD para src/lib/dashboard/pipeline.ts (Task FM6): agrupa leads
 * activos por etapa, en el orden canónico de ETAPAS_KANBAN (las 5 columnas
 * activas del kanban), para el "pipeline de cápsulas" del dashboard móvil.
 * Función pura, sin I/O.
 */
import { describe, expect, it } from 'vitest'

import { agruparPorEtapa } from '@/lib/dashboard/pipeline'

describe('agruparPorEtapa', () => {
  it('cuenta los leads por etapa y respeta el orden canónico de ETAPAS_KANBAN', () => {
    const leads = [
      { etapa: 'negociacion' },
      { etapa: 'nuevo' },
      { etapa: 'nuevo' },
      { etapa: 'contactado' },
    ]

    const segmentos = agruparPorEtapa(leads)

    expect(segmentos.map((s) => s.etapa)).toEqual(['nuevo', 'contactado', 'negociacion'])
    expect(segmentos.map((s) => s.cantidad)).toEqual([2, 1, 1])
  })

  it('incluye la etiqueta en español de cada etapa', () => {
    const segmentos = agruparPorEtapa([{ etapa: 'cita_agendada' }])

    expect(segmentos).toEqual([{ etapa: 'cita_agendada', etiqueta: 'Cita agendada', cantidad: 1 }])
  })

  it('descarta etapas sin leads (no rellena con ceros)', () => {
    const segmentos = agruparPorEtapa([{ etapa: 'negociacion' }])

    expect(segmentos).toHaveLength(1)
    expect(segmentos[0].etapa).toBe('negociacion')
  })

  it('ignora las etapas cerradas aunque vengan en la entrada', () => {
    const segmentos = agruparPorEtapa([
      { etapa: 'cerrado_ganado' },
      { etapa: 'cerrado_perdido' },
      { etapa: 'nuevo' },
    ])

    expect(segmentos).toEqual([{ etapa: 'nuevo', etiqueta: 'Nuevo', cantidad: 1 }])
  })

  it('ignora "apartado" (fusionado con "negociacion", ya no es columna del kanban)', () => {
    const segmentos = agruparPorEtapa([{ etapa: 'apartado' }, { etapa: 'negociacion' }])

    expect(segmentos).toEqual([{ etapa: 'negociacion', etiqueta: 'Negociación', cantidad: 1 }])
  })

  it('con una lista vacía devuelve un arreglo vacío', () => {
    expect(agruparPorEtapa([])).toEqual([])
  })

  it('tolera etapas desconocidas en la entrada (las ignora, no truena)', () => {
    const segmentos = agruparPorEtapa([{ etapa: 'algo_raro' }, { etapa: 'nuevo' }])

    expect(segmentos).toEqual([{ etapa: 'nuevo', etiqueta: 'Nuevo', cantidad: 1 }])
  })
})
