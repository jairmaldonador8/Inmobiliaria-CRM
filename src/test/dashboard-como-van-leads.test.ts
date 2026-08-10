// @vitest-environment node
/**
 * Tests TDD para las métricas «Cómo van los leads» del dashboard admin
 * (src/lib/dashboard/consultas.ts): embudoPorEtapa,
 * medianaPrimeraRespuesta7d, leadsPorFuente30d y actividadContacto7d.
 *
 * Mismo estilo que src/test/dashboard-consultas.test.ts: cliente por DI con
 * stub chainable, fechas SIEMPRE fijas vía `ahora` (America/Monterrey es
 * UTC-6 fijo; 06:00Z es el inicio del día calendario en Monterrey).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  actividadContacto7d,
  embudoPorEtapa,
  leadsPorFuente30d,
  medianaPrimeraRespuesta7d,
} from '@/lib/dashboard/consultas'

interface ErrorFake {
  message: string
}

const AHORA = new Date('2026-03-15T12:00:00.000Z') // 2026-03-15 06:00 Monterrey

/** Stub para embudo: from('leads').select().eq() resuelve al final. */
function crearSupabaseEmbudoFake(filas: { etapa: string }[], error: ErrorFake | null = null) {
  const eq = vi.fn().mockResolvedValue({ data: filas, error })
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq }
}

/** Stub para mediana/actividad: select().in().gte().order() ó select().in().gte(). */
function crearSupabaseEventosFake(
  filas: Record<string, unknown>[],
  error: ErrorFake | null = null
) {
  const order = vi.fn().mockResolvedValue({ data: filas, error })
  const gte = vi.fn(() => {
    const promesa = Promise.resolve({ data: filas, error }) as Promise<{
      data: Record<string, unknown>[] | null
      error: ErrorFake | null
    }> & { order: typeof order }
    promesa.order = order
    return promesa
  })
  const inTipos = vi.fn(() => ({ gte }))
  const select = vi.fn(() => ({ in: inTipos }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, inTipos, gte, order }
}

/** Stub para leadsPorFuente30d: select().eq().gte() resuelve al final. */
function crearSupabaseFuentesFake(
  filas: { payload: Record<string, unknown> }[],
  error: ErrorFake | null = null
) {
  const gte = vi.fn().mockResolvedValue({ data: filas, error })
  const eq = vi.fn(() => ({ gte }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq, gte }
}

describe('embudoPorEtapa', () => {
  it('cuenta leads activos por etapa en el orden canónico del pipeline', async () => {
    const { supabase } = crearSupabaseEmbudoFake([
      { etapa: 'negociacion' },
      { etapa: 'nuevo' },
      { etapa: 'nuevo' },
      { etapa: 'contactado' },
    ])

    const resultado = await embudoPorEtapa(supabase, AHORA)

    expect(resultado).toEqual([
      { etapa: 'nuevo', cuenta: 2 },
      { etapa: 'contactado', cuenta: 1 },
      { etapa: 'negociacion', cuenta: 1 },
    ])
  })

  it('sin leads devuelve lista vacía (las etapas en cero no se pintan)', async () => {
    const { supabase } = crearSupabaseEmbudoFake([])

    expect(await embudoPorEtapa(supabase, AHORA)).toEqual([])
  })

  it('consulta leads no archivados con select("etapa")', async () => {
    const { supabase, from, select, eq } = crearSupabaseEmbudoFake([])

    await embudoPorEtapa(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('leads')
    expect(select).toHaveBeenCalledWith('etapa')
    expect(eq).toHaveBeenCalledWith('archivado', false)
  })

  it('una etapa fuera del vocabulario canónico se anexa al final sin reventar', async () => {
    const { supabase } = crearSupabaseEmbudoFake([
      { etapa: 'nuevo' },
      { etapa: 'etapa_rara' },
    ])

    const resultado = await embudoPorEtapa(supabase, AHORA)

    expect(resultado).toEqual([
      { etapa: 'nuevo', cuenta: 1 },
      { etapa: 'etapa_rara', cuenta: 1 },
    ])
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseEmbudoFake([], { message: 'boom' })

    await expect(embudoPorEtapa(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('medianaPrimeraRespuesta7d', () => {
  function evento(lead: string, tipo: string, ocurrido: string) {
    return { lead_id: lead, tipo, ocurrido_en: ocurrido }
  }

  it('con nº IMPAR de deltas toma el del centro (en minutos)', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('a', 'lead_asignado', '2026-03-14T10:00:00.000Z'),
      evento('a', 'whatsapp_enviado', '2026-03-14T10:10:00.000Z'), // 10 min
      evento('b', 'lead_asignado', '2026-03-14T11:00:00.000Z'),
      evento('b', 'seguimiento_registrado', '2026-03-14T11:30:00.000Z'), // 30 min
      evento('c', 'lead_asignado', '2026-03-14T12:00:00.000Z'),
      evento('c', 'whatsapp_enviado', '2026-03-14T12:50:00.000Z'), // 50 min
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBe(30)
  })

  it('con nº PAR de deltas promedia los dos centrales', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('a', 'lead_asignado', '2026-03-14T10:00:00.000Z'),
      evento('a', 'whatsapp_enviado', '2026-03-14T10:10:00.000Z'), // 10
      evento('b', 'lead_asignado', '2026-03-14T11:00:00.000Z'),
      evento('b', 'whatsapp_enviado', '2026-03-14T11:20:00.000Z'), // 20
      evento('c', 'lead_asignado', '2026-03-14T12:00:00.000Z'),
      evento('c', 'seguimiento_registrado', '2026-03-14T12:40:00.000Z'), // 40
      evento('d', 'lead_asignado', '2026-03-14T13:00:00.000Z'),
      evento('d', 'whatsapp_enviado', '2026-03-14T14:40:00.000Z'), // 100
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBe(30) // (20+40)/2
  })

  it('solo cuenta el PRIMER contacto posterior a la asignación', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('a', 'lead_asignado', '2026-03-14T10:00:00.000Z'),
      evento('a', 'whatsapp_enviado', '2026-03-14T10:15:00.000Z'), // 15 min ← cuenta
      evento('a', 'seguimiento_registrado', '2026-03-14T18:00:00.000Z'), // ignorado
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBe(15)
  })

  it('un lead SIN contacto posterior se ignora (no aporta delta)', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('a', 'lead_asignado', '2026-03-14T10:00:00.000Z'),
      evento('a', 'whatsapp_enviado', '2026-03-14T10:10:00.000Z'), // 10 min
      evento('b', 'lead_asignado', '2026-03-14T11:00:00.000Z'), // sin contacto
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBe(10)
  })

  it('un contacto ANTERIOR a la asignación no cuenta', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('a', 'whatsapp_enviado', '2026-03-14T09:00:00.000Z'), // antes de asignar
      evento('a', 'lead_asignado', '2026-03-14T10:00:00.000Z'),
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBeNull()
  })

  it('un contacto de un lead sin lead_asignado en la ventana se ignora', async () => {
    const { supabase } = crearSupabaseEventosFake([
      evento('viejo', 'whatsapp_enviado', '2026-03-14T09:00:00.000Z'),
    ])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBeNull()
  })

  it('sin datos devuelve null', async () => {
    const { supabase } = crearSupabaseEventosFake([])

    expect(await medianaPrimeraRespuesta7d(supabase, AHORA)).toBeNull()
  })

  it('consulta lead_eventos por los 3 tipos, desde hace 7 días, en orden ascendente', async () => {
    const { supabase, from, select, inTipos, gte, order } = crearSupabaseEventosFake([])

    await medianaPrimeraRespuesta7d(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('lead_eventos')
    expect(select).toHaveBeenCalledWith('lead_id, tipo, ocurrido_en')
    expect(inTipos).toHaveBeenCalledWith('tipo', [
      'lead_asignado',
      'whatsapp_enviado',
      'seguimiento_registrado',
    ])
    expect(gte).toHaveBeenCalledWith('ocurrido_en', '2026-03-08T12:00:00.000Z')
    expect(order).toHaveBeenCalledWith('ocurrido_en', { ascending: true })
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseEventosFake([], { message: 'boom' })

    await expect(medianaPrimeraRespuesta7d(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('leadsPorFuente30d', () => {
  it('cuenta por payload.fuente, de mayor a menor', async () => {
    const { supabase } = crearSupabaseFuentesFake([
      { payload: { fuente: 'portal', fuente_detalle: 'inmuebles24' } },
      { payload: { fuente: 'portal' } },
      { payload: { fuente: 'referido' } },
    ])

    const resultado = await leadsPorFuente30d(supabase, AHORA)

    expect(resultado).toEqual([
      { fuente: 'portal', cuenta: 2 },
      { fuente: 'referido', cuenta: 1 },
    ])
  })

  it('un payload sin fuente cae al bucket "otro" (backfill defensivo)', async () => {
    const { supabase } = crearSupabaseFuentesFake([{ payload: {} }])

    expect(await leadsPorFuente30d(supabase, AHORA)).toEqual([{ fuente: 'otro', cuenta: 1 }])
  })

  it('sin eventos devuelve lista vacía', async () => {
    const { supabase } = crearSupabaseFuentesFake([])

    expect(await leadsPorFuente30d(supabase, AHORA)).toEqual([])
  })

  it('consulta lead_creado de los últimos 30 días', async () => {
    const { supabase, from, select, eq, gte } = crearSupabaseFuentesFake([])

    await leadsPorFuente30d(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('lead_eventos')
    expect(select).toHaveBeenCalledWith('payload')
    expect(eq).toHaveBeenCalledWith('tipo', 'lead_creado')
    expect(gte).toHaveBeenCalledWith('ocurrido_en', '2026-02-13T12:00:00.000Z')
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseFuentesFake([], { message: 'boom' })

    await expect(leadsPorFuente30d(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('actividadContacto7d', () => {
  it('devuelve exactamente 7 posiciones, en cero sin eventos', async () => {
    const { supabase } = crearSupabaseEventosFake([])

    const resultado = await actividadContacto7d(supabase, AHORA)

    expect(resultado).toHaveLength(7)
    expect(resultado.every((n) => n === 0)).toBe(true)
  })

  it('agrupa por día calendario de Monterrey, oldest→newest, respetando el borde de medianoche UTC', async () => {
    const { supabase } = crearSupabaseEventosFake([
      // 2026-03-15T00:00Z → 2026-03-14 Monterrey (AYER, índice 5)
      { lead_id: 'a', tipo: 'whatsapp_enviado', ocurrido_en: '2026-03-15T00:00:00.000Z' },
      // 2026-03-15T06:00Z → 2026-03-15 Monterrey (HOY, índice 6)
      { lead_id: 'b', tipo: 'seguimiento_registrado', ocurrido_en: '2026-03-15T06:00:00.000Z' },
      { lead_id: 'c', tipo: 'whatsapp_enviado', ocurrido_en: '2026-03-15T05:59:59.000Z' }, // AYER
    ])

    const resultado = await actividadContacto7d(supabase, AHORA)

    expect(resultado[5]).toBe(2)
    expect(resultado[6]).toBe(1)
    expect(resultado.reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('ignora filas fuera de las 7 claves conocidas (margen de sobre-pedido)', async () => {
    const { supabase } = crearSupabaseEventosFake([
      { lead_id: 'a', tipo: 'whatsapp_enviado', ocurrido_en: '2020-01-01T06:00:00.000Z' },
    ])

    const resultado = await actividadContacto7d(supabase, AHORA)

    expect(resultado.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('consulta los dos tipos de contacto con margen de un día', async () => {
    const { supabase, from, select, inTipos, gte } = crearSupabaseEventosFake([])

    await actividadContacto7d(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('lead_eventos')
    expect(select).toHaveBeenCalledWith('lead_id, tipo, ocurrido_en')
    expect(inTipos).toHaveBeenCalledWith('tipo', ['whatsapp_enviado', 'seguimiento_registrado'])
    expect(gte).toHaveBeenCalledWith('ocurrido_en', '2026-03-07T12:00:00.000Z')
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseEventosFake([], { message: 'boom' })

    await expect(actividadContacto7d(supabase, AHORA)).rejects.toThrow('boom')
  })
})
