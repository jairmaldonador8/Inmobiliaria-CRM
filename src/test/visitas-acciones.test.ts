// @vitest-environment node
/**
 * Tests TDD para las server actions de visitas (src/lib/visitas/acciones.ts):
 * agendarVisita, reagendarVisita, cancelarVisita. Esta es la frontera de
 * seguridad de la Fase 0 de visitas y no tenía ni un test — se cubre aquí.
 *
 * Mismo patrón que src/test/push-acciones.test.ts: se mockean por completo
 * '@/lib/auth/usuario-actual' (evita cargar el módulo real, que importa
 * 'server-only') y '@/lib/supabase/server' (evita el cliente real de Next).
 * 'next/cache' también se mockea: revalidatePath() lanza fuera de un
 * request de Next ("Invariant: static generation store missing"), verificado
 * en vivo antes de escribir este archivo — sin el mock, TODAS las llamadas a
 * las 3 acciones truenan aunque la lógica sea correcta.
 *
 * `validarDatosVisita` (src/lib/visitas/validacion.ts) NO se mockea: es pura
 * y se usa tal cual, con datos de prueba que la satisfacen (fecha futura,
 * duración en 15–480), para que los tests ejerciten el camino real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { usuarioActualMock } = vi.hoisted(() => ({
  usuarioActualMock: vi.fn(),
}))

vi.mock('@/lib/auth/usuario-actual', () => ({
  usuarioActual: usuarioActualMock,
}))

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import { agendarVisita, cancelarVisita, reagendarVisita } from '@/lib/visitas/acciones'

interface ErrorFake {
  message: string
}

const USUARIO_ADMIN = {
  user_id: 'admin-1',
  agencia_id: 'agencia-1',
  rol: 'admin' as const,
  nombre: 'El Admin',
  telefono: null,
  foto: null,
  activo: true,
}

const FECHA_FUTURA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const DATOS_AGENDAR = {
  leadId: 'lead-1',
  propiedadId: null,
  fecha: FECHA_FUTURA,
  duracionMin: 60,
}

/**
 * Stub chainable para el flujo completo de `agendarVisita`:
 *   leads:      select().eq().eq().maybeSingle()
 *   visitas:    insert().select().single()
 *   seguimientos: insert()  (sin .select, awaited directo)
 */
function crearSupabaseAgendarFake(opts: {
  lead: { id: string; asesor_id: string | null; nombre: string; telefono: string } | null
  leadError?: ErrorFake | null
  visita?: { id: string } | null
  visitaError?: ErrorFake | null
  seguimientoError?: ErrorFake | null
}) {
  const maybeSingleLead = vi
    .fn()
    .mockResolvedValue({ data: opts.lead ?? null, error: opts.leadError ?? null })
  const eqArchivado = vi.fn(() => ({ maybeSingle: maybeSingleLead }))
  const eqId = vi.fn(() => ({ eq: eqArchivado }))
  const selectLead = vi.fn(() => ({ eq: eqId }))

  const singleVisita = vi
    .fn()
    .mockResolvedValue({ data: opts.visita ?? null, error: opts.visitaError ?? null })
  const selectVisita = vi.fn(() => ({ single: singleVisita }))
  const insertVisita = vi.fn<(valores: Record<string, unknown>) => { select: typeof selectVisita }>(
    () => ({ select: selectVisita })
  )

  const insertSeguimiento = vi.fn().mockResolvedValue({ error: opts.seguimientoError ?? null })

  const from = vi.fn((table: string) => {
    if (table === 'leads') return { select: selectLead }
    if (table === 'visitas') return { insert: insertVisita }
    if (table === 'seguimientos') return { insert: insertSeguimiento }
    throw new Error(`tabla inesperada en el stub: ${table}`)
  })

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    selectLead,
    eqId,
    eqArchivado,
    maybeSingleLead,
    insertVisita,
    selectVisita,
    singleVisita,
    insertSeguimiento,
  }
}

/**
 * Stub chainable para `reagendarVisita`/`cancelarVisita`:
 *   visitas: update().eq('id', ...).eq('estado', 'agendada').select('id, lead_id')
 */
function crearSupabaseUpdateVisitaFake(opts: {
  data: { id: string; lead_id: string }[] | null
  error?: ErrorFake | null
}) {
  const selectDespuesDeUpdate = vi
    .fn()
    .mockResolvedValue({ data: opts.data, error: opts.error ?? null })
  const eqEstado = vi.fn(() => ({ select: selectDespuesDeUpdate }))
  const eqId = vi.fn(() => ({ eq: eqEstado }))
  const update = vi.fn(() => ({ eq: eqId }))
  const from = vi.fn(() => ({ update }))

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    update,
    eqId,
    eqEstado,
    selectDespuesDeUpdate,
  }
}

beforeEach(() => {
  usuarioActualMock.mockReset()
  createClientMock.mockReset()
  revalidatePathMock.mockReset()
  usuarioActualMock.mockResolvedValue(USUARIO_ADMIN)
})

describe('agendarVisita', () => {
  it('lead sin asesor asignado devuelve el error específico y NO inserta la visita', async () => {
    const fake = crearSupabaseAgendarFake({
      lead: { id: 'lead-1', asesor_id: null, nombre: 'Ana', telefono: '5599000001' },
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await agendarVisita(DATOS_AGENDAR)

    expect(resultado).toEqual({ error: 'Asigna el lead a un asesor antes de agendar una visita' })
    expect(fake.insertVisita).not.toHaveBeenCalled()
  })

  it('lead que RLS no devuelve (ajeno o inexistente) da un error genérico que no revela cuál de los dos es', async () => {
    const fakeInexistente = crearSupabaseAgendarFake({ lead: null })
    createClientMock.mockResolvedValue(fakeInexistente.supabase)
    const resultadoInexistente = await agendarVisita(DATOS_AGENDAR)

    const fakeError = crearSupabaseAgendarFake({ lead: null, leadError: { message: 'algo' } })
    createClientMock.mockResolvedValue(fakeError.supabase)
    const resultadoConError = await agendarVisita(DATOS_AGENDAR)

    expect(resultadoInexistente).toEqual({ error: 'El lead no existe' })
    expect(resultadoConError).toEqual({ error: 'El lead no existe' })
    expect(fakeInexistente.insertVisita).not.toHaveBeenCalled()
    expect(fakeError.insertVisita).not.toHaveBeenCalled()
  })

  it('inserta la visita con asesor_id = lead.asesor_id, NO el user_id de quien agenda (admin agendando a nombre del asesor dueño)', async () => {
    const fake = crearSupabaseAgendarFake({
      lead: { id: 'lead-1', asesor_id: 'asesor-dueño', nombre: 'Ana', telefono: '5599000001' },
      visita: { id: 'visita-1' },
    })
    createClientMock.mockResolvedValue(fake.supabase)
    usuarioActualMock.mockResolvedValue(USUARIO_ADMIN) // admin-1 !== asesor-dueño

    const resultado = await agendarVisita(DATOS_AGENDAR)

    expect(resultado).toEqual({ ok: true, visitaId: 'visita-1' })
    expect(fake.insertVisita).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        asesor_id: 'asesor-dueño',
        estado: 'agendada',
      })
    )
    // El insert NO debe llevar el user_id de quien agenda como asesor_id.
    const argumentoInsert = fake.insertVisita.mock.calls[0][0]
    expect(argumentoInsert.asesor_id).not.toBe(USUARIO_ADMIN.user_id)
  })

  it('si falla el seguimiento de sistema (best-effort), la visita ya agendada NO se revierte', async () => {
    const fake = crearSupabaseAgendarFake({
      lead: { id: 'lead-1', asesor_id: 'asesor-dueño', nombre: 'Ana', telefono: '5599000001' },
      visita: { id: 'visita-1' },
      seguimientoError: { message: 'no se pudo insertar el seguimiento' },
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await agendarVisita(DATOS_AGENDAR)

    expect(resultado).toEqual({ ok: true, visitaId: 'visita-1' })
    expect(fake.insertSeguimiento).toHaveBeenCalled()
  })

  it('si falla el insert de la visita, devuelve error', async () => {
    const fake = crearSupabaseAgendarFake({
      lead: { id: 'lead-1', asesor_id: 'asesor-dueño', nombre: 'Ana', telefono: '5599000001' },
      visitaError: { message: 'boom' },
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await agendarVisita(DATOS_AGENDAR)

    expect(resultado).toEqual({ error: 'No se pudo agendar la visita' })
  })
})

describe('reagendarVisita', () => {
  const DATOS_REAGENDAR = { fecha: FECHA_FUTURA, duracionMin: 90 }

  it('filtra por estado=agendada: 0 filas afectadas (no es tuya, no existe, o ya no aplica) da el mismo error genérico', async () => {
    const fake = crearSupabaseUpdateVisitaFake({ data: [] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await reagendarVisita('visita-1', DATOS_REAGENDAR)

    expect(resultado).toEqual({ error: 'No se pudo reagendar la visita' })
    expect(fake.eqEstado).toHaveBeenCalledWith('estado', 'agendada')
    expect(fake.eqId).toHaveBeenCalledWith('id', 'visita-1')
  })

  it('con una fila afectada, actualiza fecha y duración y devuelve ok', async () => {
    const fake = crearSupabaseUpdateVisitaFake({ data: [{ id: 'visita-1', lead_id: 'lead-1' }] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await reagendarVisita('visita-1', DATOS_REAGENDAR)

    expect(resultado).toEqual({ ok: true })
    expect(fake.update).toHaveBeenCalledWith({
      fecha: DATOS_REAGENDAR.fecha,
      duracion_min: DATOS_REAGENDAR.duracionMin,
    })
  })
})

describe('cancelarVisita', () => {
  it('filtra por estado=agendada: 0 filas afectadas da el mismo error genérico', async () => {
    const fake = crearSupabaseUpdateVisitaFake({ data: [] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await cancelarVisita('visita-1')

    expect(resultado).toEqual({ error: 'No se pudo cancelar la visita' })
    expect(fake.eqEstado).toHaveBeenCalledWith('estado', 'agendada')
  })

  it('con una fila afectada, marca estado=cancelada y devuelve ok', async () => {
    const fake = crearSupabaseUpdateVisitaFake({ data: [{ id: 'visita-1', lead_id: 'lead-1' }] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await cancelarVisita('visita-1')

    expect(resultado).toEqual({ ok: true })
    expect(fake.update).toHaveBeenCalledWith({ estado: 'cancelada' })
  })
})
