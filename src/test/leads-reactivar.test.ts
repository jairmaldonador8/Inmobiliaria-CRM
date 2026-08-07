// @vitest-environment node
/**
 * Tests de `reactivarLead` (src/lib/leads/acciones-asesor.ts): revivir un
 * lead dado por perdido y regresarlo al tablero.
 *
 * Mismo patrón de mocks que src/test/visitas-acciones.test.ts — se mockean
 * '@/lib/auth/usuario-actual' (evita cargar 'server-only'),
 * '@/lib/supabase/server' y 'next/cache' (revalidatePath lanza fuera de un
 * request de Next).
 *
 * Lo que de verdad se está protegiendo aquí es el filtro
 * `.eq('etapa', 'cerrado_perdido')`: sin él, esta action sería un «mover
 * cualquier lead a contactado» disfrazado, capaz de descuadrar los
 * «cerrados ganados del mes» del dashboard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { requireAsesorMock } = vi.hoisted(() => ({ requireAsesorMock: vi.fn() }))
vi.mock('@/lib/auth/usuario-actual', () => ({ requireAsesor: requireAsesorMock }))

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { reactivarLead } from '@/lib/leads/acciones-asesor'

const ASESOR = {
  user_id: 'asesor-1',
  agencia_id: 'agencia-1',
  rol: 'asesor' as const,
  nombre: 'Asesor Uno',
  telefono: null,
  foto: null,
  activo: true,
}

/**
 * leads: update({etapa}).eq('id').eq('archivado').eq('etapa').select('id')
 * seguimientos: insert()
 */
function crearSupabaseFake(opts: {
  filas: { id: string }[] | null
  error?: { message: string } | null
  seguimientoError?: { message: string } | null
}) {
  const selectTrasUpdate = vi
    .fn()
    .mockResolvedValue({ data: opts.filas, error: opts.error ?? null })
  const eqEtapa = vi.fn(() => ({ select: selectTrasUpdate }))
  const eqArchivado = vi.fn(() => ({ eq: eqEtapa }))
  const eqId = vi.fn(() => ({ eq: eqArchivado }))
  const update = vi.fn(() => ({ eq: eqId }))
  const insertSeguimiento = vi.fn().mockResolvedValue({ error: opts.seguimientoError ?? null })

  const from = vi.fn((table: string) => {
    if (table === 'leads') return { update }
    if (table === 'seguimientos') return { insert: insertSeguimiento }
    throw new Error(`tabla inesperada en el stub: ${table}`)
  })

  return {
    supabase: { from } as unknown as SupabaseClient,
    update,
    eqId,
    eqArchivado,
    eqEtapa,
    insertSeguimiento,
  }
}

beforeEach(() => {
  requireAsesorMock.mockReset()
  createClientMock.mockReset()
  revalidatePathMock.mockReset()
  requireAsesorMock.mockResolvedValue(ASESOR)
})

describe('reactivarLead', () => {
  it('regresa el lead a «contactado» y deja rastro en el timeline', async () => {
    const fake = crearSupabaseFake({ filas: [{ id: 'lead-1' }] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await reactivarLead('lead-1')

    expect(resultado).toEqual({ ok: true })
    expect(fake.update).toHaveBeenCalledWith({ etapa: 'contactado' })
    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        autor_id: 'asesor-1',
        tipo: 'sistema',
        nota: 'Lead reactivado: regresó al pipeline desde «Cerrado perdido»',
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/asesor/leads')
  })

  it('solo toca leads en «cerrado_perdido»: un ganado NO se reactiva', async () => {
    const fake = crearSupabaseFake({ filas: [{ id: 'lead-1' }] })
    createClientMock.mockResolvedValue(fake.supabase)

    await reactivarLead('lead-1')

    // La guarda es del lado del servidor, no del botón: el update se ancla
    // a cerrado_perdido, así que un ganado afecta 0 filas.
    expect(fake.eqEtapa).toHaveBeenCalledWith('etapa', 'cerrado_perdido')
    expect(fake.eqArchivado).toHaveBeenCalledWith('archivado', false)
  })

  it('0 filas afectadas (ajeno, ganado, archivado o inexistente) da un error genérico y no registra nada', async () => {
    const fake = crearSupabaseFake({ filas: [] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await reactivarLead('lead-1')

    expect(resultado).toEqual({ error: 'No se pudo reactivar el lead' })
    expect(fake.insertSeguimiento).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('si falla el seguimiento (best-effort), la reactivación NO se revierte', async () => {
    const fake = crearSupabaseFake({
      filas: [{ id: 'lead-1' }],
      seguimientoError: { message: 'no se pudo insertar' },
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await reactivarLead('lead-1')

    expect(resultado).toEqual({ ok: true })
  })
})
