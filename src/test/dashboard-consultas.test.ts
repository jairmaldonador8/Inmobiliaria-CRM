// @vitest-environment node
/**
 * Tests TDD para src/lib/dashboard/consultas.ts: las 3 consultas del
 * dashboard admin fintech (Task FM4) — serieLeads30Dias, cierresGanadosMes,
 * citasHoy. Reciben el cliente por DI (mismo estilo que
 * src/test/notificaciones-push.test.ts): stub chainable, sin mockear
 * módulos ni 'server-only' (consultas.ts no lo importa).
 *
 * Fechas SIEMPRE fijas vía el parámetro `ahora` — nunca `new Date()` sin
 * argumentos en una aserción, para que los tests sean deterministas.
 * America/Monterrey es UTC-6 fijo (México eliminó el horario de verano en
 * 2022 para la mayor parte del país) — verificado en vivo con Intl antes de
 * escribir estas fechas de prueba (00:00Z cae en el día calendario ANTERIOR
 * en Monterrey; 06:00Z ya cae en el día calendario correspondiente).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  cierresGanadosMes,
  citasHoy,
  proximasVisitas,
  serieLeads30Dias,
} from '@/lib/dashboard/consultas'

interface ErrorFake {
  message: string
}

const AHORA = new Date('2026-03-15T12:00:00.000Z') // 2026-03-15 06:00 Monterrey

/** Stub chainable para leads: select().eq().gte() resuelve al final. */
function crearSupabaseLeadsFake(leads: { creado_en: string }[], error: ErrorFake | null = null) {
  const gte = vi.fn().mockResolvedValue({ data: leads, error })
  const eq = vi.fn(() => ({ gte }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq, gte }
}

/** Stub chainable para seguimientos: select().eq().eq().gte() resuelve al final. */
function crearSupabaseSeguimientosFake(filas: { lead_id: string }[], error: ErrorFake | null = null) {
  const gte = vi.fn().mockResolvedValue({ data: filas, error })
  const eqNota = vi.fn(() => ({ gte }))
  const eqTipo = vi.fn(() => ({ eq: eqNota }))
  const select = vi.fn(() => ({ eq: eqTipo }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eqTipo, eqNota, gte }
}

/**
 * Stub chainable para visitas:
 * select().eq(lead.archivado).eq(estado).gte().lt() resuelve al final
 * (head:true → {count,error}). El primer .eq es el filtro sobre la relación
 * que evita contar citas de leads archivados (regresión 2026-08-19).
 */
function crearSupabaseVisitasFake(count: number | null, error: ErrorFake | null = null) {
  const lt = vi.fn().mockResolvedValue({ count, error })
  const gte = vi.fn(() => ({ lt }))
  const eqEstado = vi.fn(() => ({ gte }))
  const eq = vi.fn(() => ({ eq: eqEstado }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq, eqEstado, gte, lt }
}

/** Fila cruda tal como la devolvería Supabase para el join de `proximasVisitas`. */
type FilaProximaVisitaFake = {
  id: string
  fecha: string
  duracion_min: number
  lead: { id: string; nombre: string } | null
  propiedad: { titulo: string } | null
}

/** Stub chainable para proximasVisitas: select().eq().gte().order().limit() resuelve al final. */
function crearSupabaseProximasVisitasFake(
  filas: FilaProximaVisitaFake[],
  error: ErrorFake | null = null
) {
  const limit = vi.fn().mockResolvedValue({ data: filas, error })
  const order = vi.fn(() => ({ limit }))
  const gte = vi.fn(() => ({ order }))
  // .eq('lead.archivado', false) → .eq('estado', 'agendada') → .gte(...)
  const eqEstado = vi.fn(() => ({ gte }))
  const eq = vi.fn(() => ({ eq: eqEstado }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq, eqEstado, gte, order, limit }
}

describe('serieLeads30Dias', () => {
  it('devuelve exactamente 30 posiciones', async () => {
    const { supabase } = crearSupabaseLeadsFake([])

    const resultado = await serieLeads30Dias(supabase, AHORA)

    expect(resultado).toHaveLength(30)
  })

  it('los días sin leads quedan en 0', async () => {
    const { supabase } = crearSupabaseLeadsFake([])

    const resultado = await serieLeads30Dias(supabase, AHORA)

    expect(resultado.every((n) => n === 0)).toBe(true)
  })

  it('agrupa por día calendario de Monterrey, oldest→newest, respetando el borde de medianoche UTC', async () => {
    // 2026-03-15T00:00:00Z -> 2026-03-14 Monterrey (AYER, índice 28)
    // 2026-03-15T06:00:00Z -> 2026-03-15 Monterrey (HOY, índice 29, última posición)
    const { supabase } = crearSupabaseLeadsFake([
      { creado_en: '2026-03-15T00:00:00.000Z' },
      { creado_en: '2026-03-15T06:00:00.000Z' },
      { creado_en: '2026-03-15T05:59:59.000Z' }, // también AYER
    ])

    const resultado = await serieLeads30Dias(supabase, AHORA)

    expect(resultado).toHaveLength(30)
    expect(resultado[28]).toBe(2) // ayer: 2 leads
    expect(resultado[29]).toBe(1) // hoy: 1 lead
    expect(resultado.reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('ignora filas con creado_en fuera de las 30 claves conocidas (margen de sobre-pedido)', async () => {
    const { supabase } = crearSupabaseLeadsFake([{ creado_en: '2020-01-01T06:00:00.000Z' }])

    const resultado = await serieLeads30Dias(supabase, AHORA)

    expect(resultado.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('consulta leads no archivados con select("creado_en") y filtra por rango', async () => {
    const { supabase, from, select, eq, gte } = crearSupabaseLeadsFake([])

    await serieLeads30Dias(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('leads')
    expect(select).toHaveBeenCalledWith('creado_en')
    expect(eq).toHaveBeenCalledWith('archivado', false)
    expect(gte).toHaveBeenCalledTimes(1)
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseLeadsFake([], { message: 'boom' })

    await expect(serieLeads30Dias(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('cierresGanadosMes', () => {
  it('cuenta los seguimientos de sistema con la nota de cierre ganado desde el inicio de mes (Monterrey)', async () => {
    const { supabase } = crearSupabaseSeguimientosFake([{ lead_id: 'l1' }, { lead_id: 'l2' }])

    const resultado = await cierresGanadosMes(supabase, AHORA)

    expect(resultado).toBe(2)
  })

  it('deduplica por lead_id', async () => {
    const { supabase } = crearSupabaseSeguimientosFake([
      { lead_id: 'l1' },
      { lead_id: 'l1' },
      { lead_id: 'l2' },
    ])

    const resultado = await cierresGanadosMes(supabase, AHORA)

    expect(resultado).toBe(2)
  })

  it('sin cierres, devuelve 0', async () => {
    const { supabase } = crearSupabaseSeguimientosFake([])

    const resultado = await cierresGanadosMes(supabase, AHORA)

    expect(resultado).toBe(0)
  })

  it('consulta seguimientos tipo=sistema, nota=NOTA_CIERRE.cerrado_ganado, gte inicio de mes Monterrey — sin filtro de asesor', async () => {
    const { supabase, from, select, eqTipo, eqNota, gte } = crearSupabaseSeguimientosFake([])

    await cierresGanadosMes(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('seguimientos')
    expect(select).toHaveBeenCalledWith('lead_id')
    expect(eqTipo).toHaveBeenCalledWith('tipo', 'sistema')
    expect(eqNota).toHaveBeenCalledWith('nota', 'Marcado como cerrado ganado')
    expect(gte).toHaveBeenCalledWith('creado_en', '2026-03-01T06:00:00.000Z')
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseSeguimientosFake([], { message: 'boom' })

    await expect(cierresGanadosMes(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('citasHoy', () => {
  it('devuelve el conteo de visitas agendadas', async () => {
    const { supabase } = crearSupabaseVisitasFake(4)

    const resultado = await citasHoy(supabase, AHORA)

    expect(resultado).toBe(4)
  })

  it('si count es null, devuelve 0', async () => {
    const { supabase } = crearSupabaseVisitasFake(null)

    const resultado = await citasHoy(supabase, AHORA)

    expect(resultado).toBe(0)
  })

  it('consulta visitas estado=agendada dentro de los límites del día de hoy en Monterrey', async () => {
    const { supabase, from, select, eq, eqEstado, gte, lt } = crearSupabaseVisitasFake(0)

    await citasHoy(supabase, AHORA)

    expect(from).toHaveBeenCalledWith('visitas')
    expect(select).toHaveBeenCalledWith('id, lead:leads!inner(archivado)', {
      count: 'exact',
      head: true,
    })
    // Una cita de un lead archivado ya no es cita de hoy (regresión 2026-08-19).
    expect(eq).toHaveBeenCalledWith('lead.archivado', false)
    expect(eqEstado).toHaveBeenCalledWith('estado', 'agendada')
    expect(gte).toHaveBeenCalledWith('fecha', '2026-03-15T06:00:00.000Z')
    expect(lt).toHaveBeenCalledWith('fecha', '2026-03-16T06:00:00.000Z')
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseVisitasFake(0, { message: 'boom' })

    await expect(citasHoy(supabase, AHORA)).rejects.toThrow('boom')
  })
})

describe('proximasVisitas', () => {
  const filaBase: FilaProximaVisitaFake = {
    id: 'v1',
    fecha: '2026-03-16T18:00:00.000Z',
    duracion_min: 45,
    lead: { id: 'l1', nombre: 'Ana Pérez' },
    propiedad: { titulo: 'Casa en Contry' },
  }

  it('devuelve el nombre del lead, el título de la propiedad y la duración', async () => {
    const { supabase } = crearSupabaseProximasVisitasFake([filaBase])

    const resultado = await proximasVisitas(supabase, 5, AHORA)

    expect(resultado).toEqual([
      {
        id: 'v1',
        fecha: '2026-03-16T18:00:00.000Z',
        duracionMin: 45,
        leadId: 'l1',
        leadNombre: 'Ana Pérez',
        propiedadTitulo: 'Casa en Contry',
      },
    ])
  })

  it('cuando la visita no tiene propiedad vinculada, propiedadTitulo es null', async () => {
    const { supabase } = crearSupabaseProximasVisitasFake([{ ...filaBase, propiedad: null }])

    const resultado = await proximasVisitas(supabase, 5, AHORA)

    expect(resultado[0].propiedadTitulo).toBeNull()
  })

  it('usa lead:leads!inner (defensa en profundidad) para que una visita sin lead legible no se pinte con link roto', async () => {
    // Con el inner join real, PostgREST jamás devolvería esta fila (la
    // excluiría del resultado); este caso solo documenta que, si por
    // cualquier razón llegara una fila con lead: null, el mapeo no truena y
    // cae a valores vacíos en vez de reventar la UI.
    const { supabase } = crearSupabaseProximasVisitasFake([{ ...filaBase, lead: null }])

    const resultado = await proximasVisitas(supabase, 5, AHORA)

    expect(resultado[0].leadId).toBe('')
    expect(resultado[0].leadNombre).toBe('')
  })

  it('consulta visitas estado=agendada, futuras (gte fecha=ahora), orden ascendente por fecha, con el límite pedido', async () => {
    const { supabase, from, select, eq, eqEstado, gte, order, limit } =
      crearSupabaseProximasVisitasFake([])

    await proximasVisitas(supabase, 5, AHORA)

    expect(from).toHaveBeenCalledWith('visitas')
    expect(select).toHaveBeenCalledWith(
      'id, fecha, duracion_min, lead:leads!inner(id, nombre, archivado), propiedad:propiedades(titulo)'
    )
    // Las visitas de leads archivados salen de la lista (regresión 2026-08-19).
    expect(eq).toHaveBeenCalledWith('lead.archivado', false)
    expect(eqEstado).toHaveBeenCalledWith('estado', 'agendada')
    expect(gte).toHaveBeenCalledWith('fecha', AHORA.toISOString())
    expect(order).toHaveBeenCalledWith('fecha', { ascending: true })
    expect(limit).toHaveBeenCalledWith(5)
  })

  it('usa 5 como límite por defecto cuando no se especifica', async () => {
    const { supabase, limit } = crearSupabaseProximasVisitasFake([])

    await proximasVisitas(supabase, undefined, AHORA)

    expect(limit).toHaveBeenCalledWith(5)
  })

  it('respeta un límite explícito distinto al default', async () => {
    const { supabase, limit } = crearSupabaseProximasVisitasFake([])

    await proximasVisitas(supabase, 3, AHORA)

    expect(limit).toHaveBeenCalledWith(3)
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseProximasVisitasFake([], { message: 'boom' })

    await expect(proximasVisitas(supabase, 5, AHORA)).rejects.toThrow('boom')
  })
})
