// @vitest-environment node
/**
 * Tests de la papelera de leads (src/lib/leads/acciones.ts): archivarLead,
 * restaurarLead y eliminarLeadDefinitivo.
 *
 * Mismo patrón de mocks que src/test/tomar-lead.test.ts.
 *
 * Lo que se protege aquí:
 *  1. Los CAS de archivar/restaurar (`.eq('archivado', …)`): sin ellos, dos
 *     admins a la vez o un doble clic reportarían éxito dos veces y meterían
 *     dos notas de sistema por un solo movimiento.
 *  2. La compuerta del borrado definitivo: SOLO se borra lo que ya está en
 *     la papelera. Sin esa compuerta, un clic mal dado borraría un lead vivo
 *     sin vuelta atrás.
 *  3. La traducción del error `lead_con_operacion` que levanta la migración
 *     0027 — el admin tiene que leer por qué no se puede, no un código.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { requireAdminMock, createAdminClientMock, revalidatePathMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/auth/usuario-actual', () => ({
  requireAdmin: requireAdminMock,
  requireAsesor: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/notificaciones/crear', () => ({
  crearNotificacion: vi.fn(),
  notificarAdmins: vi.fn(),
}))
vi.mock('@/lib/guardias/consultas', () => ({ leadEnEscalamientoAbierto: vi.fn() }))

import { archivarLead, eliminarLeadDefinitivo, restaurarLead } from '@/lib/leads/acciones'

const ADMIN = { user_id: 'admin-1', nombre: 'Jair', rol: 'admin', activo: true }

/**
 * Fake para archivar/restaurar:
 *   leads: update({archivado}).eq('id').eq('archivado').select('id, nombre')
 *   seguimientos: insert()
 */
function fakeArchivado(opciones: { filas?: { id: string; nombre: string }[] | null } = {}) {
  const filas = opciones.filas === undefined ? [{ id: 'lead-1', nombre: 'Prueba' }] : opciones.filas
  const filtros: unknown[][] = []
  let payload: Record<string, unknown> | null = null

  const select = vi.fn().mockResolvedValue({ data: filas, error: null })
  const eqArchivado = vi.fn((...args: unknown[]) => {
    filtros.push(args)
    return { select }
  })
  const eqId = vi.fn((...args: unknown[]) => {
    filtros.push(args)
    return { eq: eqArchivado }
  })
  const update = vi.fn((datos: Record<string, unknown>) => {
    payload = datos
    return { eq: eqId }
  })
  const insertSeguimiento = vi.fn().mockResolvedValue({ error: null })

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') return { update }
    if (tabla === 'seguimientos') return { insert: insertSeguimiento }
    throw new Error(`tabla inesperada en el stub: ${tabla}`)
  })

  return { cliente: { from }, filtros, insertSeguimiento, payload: () => payload }
}

/**
 * Fake para el borrado definitivo:
 *   leads: select('id, archivado').eq('id').maybeSingle()
 *   rpc('eliminar_lead_definitivo')
 */
function fakePurga(opciones: {
  lead?: { id: string; archivado: boolean } | null
  rpcError?: { message: string } | null
}) {
  const lead = opciones.lead === undefined ? { id: 'lead-1', archivado: true } : opciones.lead
  const maybeSingle = vi.fn().mockResolvedValue({ data: lead, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const rpc = vi.fn().mockResolvedValue({ error: opciones.rpcError ?? null })

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') return { select }
    throw new Error(`tabla inesperada en el stub: ${tabla}`)
  })

  return { cliente: { from, rpc }, rpc }
}

beforeEach(() => {
  requireAdminMock.mockReset()
  createAdminClientMock.mockReset()
  revalidatePathMock.mockReset()
  requireAdminMock.mockResolvedValue(ADMIN)
})

describe('archivarLead', () => {
  it('archiva solo un lead activo y deja nota de sistema con el nombre del admin', async () => {
    const fake = fakeArchivado()
    createAdminClientMock.mockReturnValue(fake.cliente)

    const resultado = await archivarLead('lead-1')

    expect(resultado).toEqual({ ok: true })
    expect(fake.payload()).toMatchObject({ archivado: true })
    // Marca la hora: la papelera ordena por lo último que se tiró.
    expect(typeof fake.payload()!.archivado_en).toBe('string')
    // El CAS: no se toca un lead que ya está en la papelera.
    expect(fake.filtros).toContainEqual(['archivado', false])
    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1', tipo: 'sistema', autor_id: 'admin-1' })
    )
    expect(fake.insertSeguimiento.mock.calls[0][0].nota).toContain('Jair')
  })

  it('avisa en vez de mentir cuando el lead ya estaba archivado', async () => {
    const fake = fakeArchivado({ filas: [] })
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await archivarLead('lead-1')).toEqual({ error: 'Este lead ya no está activo' })
    expect(fake.insertSeguimiento).not.toHaveBeenCalled()
  })

  it('exige admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('no autorizado'))
    await expect(archivarLead('lead-1')).rejects.toThrow('no autorizado')
  })
})

describe('restaurarLead', () => {
  it('saca el lead de la papelera y lo anota', async () => {
    const fake = fakeArchivado()
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await restaurarLead('lead-1')).toEqual({ ok: true })
    expect(fake.payload()).toEqual({ archivado: false, archivado_en: null })
    expect(fake.filtros).toContainEqual(['archivado', true])
    expect(fake.insertSeguimiento.mock.calls[0][0].nota).toContain('Restaurado')
  })

  it('avisa cuando el lead ya estaba activo', async () => {
    const fake = fakeArchivado({ filas: [] })
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await restaurarLead('lead-1')).toEqual({ error: 'Este lead ya está activo' })
  })
})

describe('eliminarLeadDefinitivo', () => {
  it('purga un lead que ya está en la papelera', async () => {
    const fake = fakePurga({})
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await eliminarLeadDefinitivo('lead-1')).toEqual({ ok: true })
    expect(fake.rpc).toHaveBeenCalledWith('eliminar_lead_definitivo', { p_lead_id: 'lead-1' })
  })

  it('NO borra un lead vivo: primero tiene que pasar por la papelera', async () => {
    const fake = fakePurga({ lead: { id: 'lead-1', archivado: false } })
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await eliminarLeadDefinitivo('lead-1')).toEqual({
      error: 'Primero manda el lead a la papelera',
    })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('avisa si el lead ya no existe', async () => {
    const fake = fakePurga({ lead: null })
    createAdminClientMock.mockReturnValue(fake.cliente)

    expect(await eliminarLeadDefinitivo('lead-1')).toEqual({ error: 'Este lead ya no existe' })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('traduce el rechazo por operación cerrada a algo legible', async () => {
    const fake = fakePurga({ rpcError: { message: 'lead_con_operacion' } })
    createAdminClientMock.mockReturnValue(fake.cliente)

    const resultado = await eliminarLeadDefinitivo('lead-1')
    expect('error' in resultado && resultado.error).toContain('operación cerrada')
  })

  it('exige admin', async () => {
    requireAdminMock.mockRejectedValue(new Error('no autorizado'))
    await expect(eliminarLeadDefinitivo('lead-1')).rejects.toThrow('no autorizado')
  })
})
