// @vitest-environment node
/**
 * Tests TDD de tomarLead() (src/lib/leads/acciones.ts) — la acción del
 * escalamiento abierto. Clave: CAS sobre el asesor VIGENTE (el primero que
 * toma gana; el segundo recibe «ya fue tomado») y elegibilidad server-side
 * vía leadEnEscalamientoAbierto (el cliente nunca lee lead_escalamientos).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  requireAsesorMock,
  createAdminClientMock,
  crearNotificacionMock,
  revalidatePathMock,
  leadEnEscalamientoAbiertoMock,
} = vi.hoisted(() => ({
  requireAsesorMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  crearNotificacionMock: vi.fn().mockResolvedValue(undefined),
  revalidatePathMock: vi.fn(),
  leadEnEscalamientoAbiertoMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/auth/usuario-actual', () => ({
  requireAdmin: vi.fn(),
  requireAsesor: requireAsesorMock,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/notificaciones/crear', () => ({
  crearNotificacion: crearNotificacionMock,
  notificarAdmins: vi.fn(),
}))
vi.mock('@/lib/guardias/consultas', () => ({
  leadEnEscalamientoAbierto: leadEnEscalamientoAbiertoMock,
}))

import { tomarLead } from '@/lib/leads/acciones'

const YO = { user_id: 'asesor-yo', nombre: 'Beto Asesor', rol: 'asesor', activo: true }

function fakeAdmin(opciones: { casGana?: boolean } = {}) {
  const filtrosUpdate: unknown[][] = []
  let payloadUpdate: Record<string, unknown> = {}
  const insertsSeguimientos: Record<string, unknown>[] = []

  const cadenaUpdate: Record<string, unknown> = {
    select: vi.fn(() =>
      Promise.resolve(
        opciones.casGana === false
          ? { data: [], error: null }
          : { data: [{ id: 'lead-1', nombre: 'Ana Cliente' }], error: null }
      )
    ),
  }
  for (const m of ['eq']) {
    cadenaUpdate[m] = vi.fn((...args: unknown[]) => {
      filtrosUpdate.push([m, ...args])
      return cadenaUpdate
    })
  }

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') {
      return {
        update: vi.fn((payload: Record<string, unknown>) => {
          payloadUpdate = payload
          return cadenaUpdate
        }),
      }
    }
    if (tabla === 'seguimientos') {
      return {
        insert: vi.fn((p: Record<string, unknown>) => {
          insertsSeguimientos.push(p)
          return Promise.resolve({ error: null })
        }),
      }
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })

  const cliente = { from }
  createAdminClientMock.mockReturnValue(cliente)
  return { cliente, filtrosUpdate, insertsSeguimientos, payloadUpdate: () => payloadUpdate }
}

beforeEach(() => {
  requireAsesorMock.mockReset().mockResolvedValue(YO)
  leadEnEscalamientoAbiertoMock.mockReset().mockResolvedValue({
    id: 'lead-1',
    nombre: 'Ana Cliente',
    asesor_id: 'asesor-original',
  })
  crearNotificacionMock.mockClear()
  revalidatePathMock.mockClear()
  createAdminClientMock.mockReset()
})

describe('tomarLead', () => {
  it('el primero que lo toma gana: CAS sobre el asesor VIGENTE + seguimiento + aviso al original', async () => {
    const { cliente, filtrosUpdate, insertsSeguimientos, payloadUpdate } = fakeAdmin()

    const r = await tomarLead('lead-1')

    expect(r).toEqual({ ok: true })
    expect(payloadUpdate()).toMatchObject({ asesor_id: 'asesor-yo' })
    // el candado exige el asesor original, NO .is(null) de bandeja
    expect(filtrosUpdate).toContainEqual(['eq', 'asesor_id', 'asesor-original'])
    expect(filtrosUpdate).toContainEqual(['eq', 'etapa', 'nuevo'])
    expect(String(insertsSeguimientos[0].nota)).toContain('tomó el lead')
    expect(crearNotificacionMock).toHaveBeenCalledWith(
      cliente,
      expect.objectContaining({ destinatarioId: 'asesor-original' })
    )
  })

  it('el segundo pierde el CAS → «ya fue tomado», sin side effects', async () => {
    const { insertsSeguimientos } = fakeAdmin({ casGana: false })

    const r = await tomarLead('lead-1')

    expect(r).toEqual({ error: 'Este lead ya fue tomado' })
    expect(insertsSeguimientos).toHaveLength(0)
    expect(crearNotificacionMock).not.toHaveBeenCalled()
  })

  it('sin paso abierto_30 (o etapa avanzada/archivado) → no elegible', async () => {
    leadEnEscalamientoAbiertoMock.mockResolvedValue(null)
    fakeAdmin()

    const r = await tomarLead('lead-1')

    expect(r).toEqual({ error: 'Este lead ya no está en escalamiento abierto' })
  })

  it('si el lead ya es mío → aviso sin CAS', async () => {
    leadEnEscalamientoAbiertoMock.mockResolvedValue({
      id: 'lead-1',
      nombre: 'Ana Cliente',
      asesor_id: 'asesor-yo',
    })
    const { filtrosUpdate } = fakeAdmin()

    const r = await tomarLead('lead-1')

    expect(r).toEqual({ error: 'Este lead ya es tuyo' })
    expect(filtrosUpdate).toHaveLength(0)
  })
})
