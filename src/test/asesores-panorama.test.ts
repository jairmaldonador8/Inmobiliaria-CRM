// @vitest-environment node
/**
 * Tests de `construirPanorama` (src/lib/asesores/panorama.ts) — el panorama
 * de asesores que pidió Jair.
 *
 * Se prueba la función PURA, no las consultas: aquí es donde viven las
 * definiciones que la dirección va a leer como verdad, y equivocarse en
 * ellas es peor que un bug de pintado.
 *
 *  1. «Sin contactar» = etapa nuevo SIN actividad humana. Si contara
 *     cualquier lead nuevo, un asesor que ya llamó aparecería en rojo; si
 *     contara las notas de sistema, una asignación automática bastaría para
 *     dar por atendido a un cliente al que nadie le habló.
 *  2. El «nivel de vida» se mide desde la ÚLTIMA SEÑAL, no desde que el lead
 *     entró: un lead viejo con actividad de ayer está vivo, y uno que entró
 *     hace 10 días sin que nadie lo toque está frío.
 *  3. El orden: primero quien más cola tiene, inactivos hasta el final. Es
 *     lo que hace que la primera tarjeta sea siempre la que hay que mirar.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { construirPanorama, type EntradaPanorama } from '@/lib/asesores/panorama'

const AHORA = new Date('2026-08-19T18:00:00.000Z')
const DIA = 24 * 60 * 60 * 1000

/** ISO de hace N días respecto a AHORA. */
function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * DIA).toISOString()
}

function asesor(user_id: string, extra: Partial<EntradaPanorama['asesores'][number]> = {}) {
  return {
    user_id,
    nombre: user_id,
    telefono: null,
    rol: 'asesor',
    activo: true,
    ...extra,
  }
}

function lead(
  id: string,
  asesor_id: string,
  etapa: string,
  creado_en: string = haceDias(0)
) {
  return { id, asesor_id, etapa, creado_en }
}

function entrada(parcial: Partial<EntradaPanorama> = {}): EntradaPanorama {
  return {
    asesores: [],
    leads: [],
    ultimaActividadPorLead: new Map(),
    ultimaActividadPorAsesor: new Map(),
    ganadosDelMes: new Set(),
    recordatoriosVencidos: new Map(),
    idsConPush: new Set(),
    emailPorId: new Map(),
    ahora: AHORA,
    ...parcial,
  }
}

describe('sin contactar', () => {
  it('cuenta los leads nuevos que nadie ha tocado', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [lead('l1', 'ana', 'nuevo'), lead('l2', 'ana', 'nuevo')],
      })
    )

    expect(filas[0].sinContactar).toBe(2)
  })

  it('NO cuenta un lead nuevo que ya tiene actividad humana', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [lead('l1', 'ana', 'nuevo')],
        ultimaActividadPorLead: new Map([['l1', haceDias(0)]]),
      })
    )

    expect(filas[0].sinContactar).toBe(0)
  })

  it('NO cuenta leads que ya avanzaron de etapa aunque no tengan actividad', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [lead('l1', 'ana', 'contactado')],
      })
    )

    expect(filas[0].sinContactar).toBe(0)
  })
})

describe('nivel de vida', () => {
  it('mide desde la última actividad, no desde que entró el lead', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [lead('viejo-vivo', 'ana', 'negociacion', haceDias(60))],
        ultimaActividadPorLead: new Map([['viejo-vivo', haceDias(1)]]),
      })
    )

    expect(filas[0].vida).toEqual({ frescos: 1, tibios: 0, frios: 0 })
  })

  it('sin actividad, la señal de vida es la llegada del lead', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [
          lead('recien', 'ana', 'nuevo', haceDias(1)),
          lead('tibio', 'ana', 'nuevo', haceDias(4)),
          lead('frio', 'ana', 'nuevo', haceDias(10)),
        ],
      })
    )

    expect(filas[0].vida).toEqual({ frescos: 1, tibios: 1, frios: 1 })
    expect(filas[0].frios).toBe(1)
  })

  it('los leads cerrados no entran al nivel de vida ni a los activos', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [
          lead('ganado', 'ana', 'cerrado_ganado', haceDias(30)),
          lead('perdido', 'ana', 'cerrado_perdido', haceDias(30)),
          lead('vivo', 'ana', 'contactado', haceDias(1)),
        ],
      })
    )

    expect(filas[0].activos).toBe(1)
    expect(filas[0].vida).toEqual({ frescos: 1, tibios: 0, frios: 0 })
  })
})

describe('cierres del mes', () => {
  it('cuenta solo los leads con cierre ganado registrado en el mes', () => {
    const { filas, totales } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        leads: [
          lead('g1', 'ana', 'cerrado_ganado', haceDias(5)),
          lead('g2', 'ana', 'cerrado_ganado', haceDias(200)),
        ],
        ganadosDelMes: new Set(['g1']),
      })
    )

    expect(filas[0].ganadosMes).toBe(1)
    expect(totales.ganadosMes).toBe(1)
  })
})

describe('orden de atención', () => {
  it('pone arriba a quien más cola tiene', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('tranquila'), asesor('saturado')],
        leads: [
          lead('l1', 'tranquila', 'contactado', haceDias(0)),
          lead('l2', 'saturado', 'nuevo', haceDias(0)),
          lead('l3', 'saturado', 'contactado', haceDias(20)),
        ],
        recordatoriosVencidos: new Map([['saturado', 2]]),
      })
    )

    expect(filas.map((f) => f.userId)).toEqual(['saturado', 'tranquila'])
    // 1 sin contactar + 1 frío + 2 recordatorios vencidos.
    expect(filas[0].atencion).toBe(4)
    expect(filas[1].atencion).toBe(0)
  })

  it('manda los inactivos al final aunque tengan cola', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('salido', { activo: false }), asesor('activa')],
        leads: [lead('l1', 'salido', 'nuevo', haceDias(30))],
      })
    )

    expect(filas.map((f) => f.userId)).toEqual(['activa', 'salido'])
  })

  it('a igualdad de cola, ordena por carga y luego por nombre', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('zoe'), asesor('beto'), asesor('cargado')],
        leads: [
          lead('l1', 'cargado', 'contactado', haceDias(0)),
          lead('l2', 'cargado', 'negociacion', haceDias(0)),
        ],
      })
    )

    expect(filas.map((f) => f.userId)).toEqual(['cargado', 'beto', 'zoe'])
  })
})

describe('totales', () => {
  it('suman solo lo de los asesores activos', () => {
    const { totales } = construirPanorama(
      entrada({
        asesores: [asesor('activa'), asesor('salido', { activo: false })],
        leads: [
          lead('l1', 'activa', 'nuevo', haceDias(0)),
          lead('l2', 'salido', 'nuevo', haceDias(30)),
        ],
        recordatoriosVencidos: new Map([
          ['activa', 1],
          ['salido', 5],
        ]),
      })
    )

    expect(totales.asesoresActivos).toBe(1)
    expect(totales.activos).toBe(1)
    expect(totales.sinContactar).toBe(1)
    expect(totales.frios).toBe(0)
    expect(totales.recordatoriosVencidos).toBe(1)
    expect(totales.vida).toEqual({ frescos: 1, tibios: 0, frios: 0 })
  })
})

describe('datos del asesor', () => {
  it('arrastra correo, push y última actividad', () => {
    const { filas } = construirPanorama(
      entrada({
        asesores: [asesor('ana')],
        emailPorId: new Map([['ana', 'ana@montana.test']]),
        idsConPush: new Set(['ana']),
        ultimaActividadPorAsesor: new Map([['ana', haceDias(2)]]),
      })
    )

    expect(filas[0].email).toBe('ana@montana.test')
    expect(filas[0].tienePush).toBe(true)
    expect(filas[0].ultimaActividad).toBe(haceDias(2))
  })

  it('un asesor sin leads no rompe nada', () => {
    const { filas } = construirPanorama(entrada({ asesores: [asesor('nuevo')] }))

    expect(filas[0].activos).toBe(0)
    expect(filas[0].pipeline).toEqual([])
    expect(filas[0].vida).toEqual({ frescos: 0, tibios: 0, frios: 0 })
    expect(filas[0].email).toBe('—')
  })
})
