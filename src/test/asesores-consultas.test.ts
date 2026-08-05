// @vitest-environment node
/**
 * Tests TDD para src/lib/asesores/consultas.ts: obtenerAsesores() extraída
 * de la página admin de asesores (mismo comportamiento: mismos campos,
 * mismo orden, mismo cliente admin) más el nuevo booleano `tienePush`
 * (Task 9), calculado con UNA sola consulta a push_suscripciones (evita
 * N+1) y membresía por Set en JS. Mock del cliente admin al estilo de
 * src/test/push-acciones.test.ts y src/test/notificaciones-push.test.ts.
 *
 * consultas.ts importa 'server-only', que revienta (throw) al cargarse
 * fuera de un bundler con la condición "react-server" — se mockea el
 * paquete completo, igual que en src/test/push-enviar.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

import { obtenerAsesores } from '@/lib/asesores/consultas'

const USUARIOS = [
  { user_id: 'a1', nombre: 'Ana', telefono: '5511', activo: true, creado_en: '2024-01-01' },
  { user_id: 'a2', nombre: 'Beto', telefono: null, activo: false, creado_en: '2024-01-02' },
]

type Usuario = (typeof USUARIOS)[number]

function crearSupabaseFake({
  usuarios = USUARIOS,
  leads = [],
  suscripciones = [],
  usuariosAuth = [],
}: {
  usuarios?: Usuario[]
  leads?: { asesor_id: string | null }[]
  suscripciones?: { usuario_id: string }[]
  usuariosAuth?: { id: string; email: string | null }[]
} = {}) {
  const inPushMock = vi.fn().mockResolvedValue({ data: suscripciones, error: null })
  const selectPushMock = vi.fn(() => ({ in: inPushMock }))

  const notLeadsMock = vi.fn().mockResolvedValue({ data: leads, error: null })
  const eqLeadsMock = vi.fn(() => ({ not: notLeadsMock }))
  const inLeadsMock = vi.fn(() => ({ eq: eqLeadsMock }))
  const selectLeadsMock = vi.fn(() => ({ in: inLeadsMock }))

  const orderUsuariosMock = vi.fn().mockResolvedValue({ data: usuarios, error: null })
  const eqUsuariosMock = vi.fn(() => ({ order: orderUsuariosMock }))
  const selectUsuariosMock = vi.fn(() => ({ eq: eqUsuariosMock }))

  const from = vi.fn((tabla: string) => {
    if (tabla === 'usuarios') return { select: selectUsuariosMock }
    if (tabla === 'leads') return { select: selectLeadsMock }
    if (tabla === 'push_suscripciones') return { select: selectPushMock }
    throw new Error(`tabla inesperada en el fake: ${tabla}`)
  })

  const listUsersMock = vi.fn().mockResolvedValue({ data: { users: usuariosAuth }, error: null })

  const supabase = {
    from,
    auth: { admin: { listUsers: listUsersMock } },
  }

  return {
    supabase,
    from,
    selectPushMock,
    inPushMock,
    selectLeadsMock,
    inLeadsMock,
    eqLeadsMock,
    notLeadsMock,
    selectUsuariosMock,
    eqUsuariosMock,
    orderUsuariosMock,
    listUsersMock,
  }
}

describe('obtenerAsesores', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset()
  })

  it('devuelve la lista con los mismos campos que antes (nombre, email, teléfono, activo, leadsActivos)', async () => {
    const { supabase } = crearSupabaseFake({
      leads: [{ asesor_id: 'a1' }, { asesor_id: 'a1' }],
      usuariosAuth: [
        { id: 'a1', email: 'ana@klo-ser.mx' },
        { id: 'a2', email: 'beto@klo-ser.mx' },
      ],
    })
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerAsesores()

    expect(resultado).toEqual([
      {
        userId: 'a1',
        nombre: 'Ana',
        email: 'ana@klo-ser.mx',
        telefono: '5511',
        activo: true,
        leadsActivos: 2,
        tienePush: false,
      },
      {
        userId: 'a2',
        nombre: 'Beto',
        email: 'beto@klo-ser.mx',
        telefono: null,
        activo: false,
        leadsActivos: 0,
        tienePush: false,
      },
    ])
  })

  it('respeta el orden por creado_en ascendente pedido a la consulta de usuarios', async () => {
    const { supabase, eqUsuariosMock, orderUsuariosMock } = crearSupabaseFake()
    createAdminClientMock.mockReturnValue(supabase)

    await obtenerAsesores()

    expect(eqUsuariosMock).toHaveBeenCalledWith('rol', 'asesor')
    expect(orderUsuariosMock).toHaveBeenCalledWith('creado_en', { ascending: true })
  })

  it('marca tienePush: true solo para los asesores presentes en push_suscripciones', async () => {
    const { supabase } = crearSupabaseFake({
      suscripciones: [{ usuario_id: 'a1' }],
    })
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerAsesores()

    expect(resultado.find((a) => a.userId === 'a1')?.tienePush).toBe(true)
    expect(resultado.find((a) => a.userId === 'a2')?.tienePush).toBe(false)
  })

  it('consulta push_suscripciones UNA sola vez con todos los ids (evita N+1)', async () => {
    const { supabase, from, inPushMock } = crearSupabaseFake({
      suscripciones: [{ usuario_id: 'a1' }],
    })
    createAdminClientMock.mockReturnValue(supabase)

    await obtenerAsesores()

    const llamadasPush = from.mock.calls.filter(([tabla]) => tabla === 'push_suscripciones')
    expect(llamadasPush).toHaveLength(1)
    expect(inPushMock).toHaveBeenCalledWith('usuario_id', ['a1', 'a2'])
  })

  it('si no hay asesores, devuelve [] y NO consulta leads, push ni auth.admin.listUsers', async () => {
    const { supabase, from, listUsersMock } = crearSupabaseFake({ usuarios: [] })
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerAsesores()

    expect(resultado).toEqual([])
    expect(from).not.toHaveBeenCalledWith('leads')
    expect(from).not.toHaveBeenCalledWith('push_suscripciones')
    expect(listUsersMock).not.toHaveBeenCalled()
  })

  it('si no hay correo para un id (usuario borrado de auth), cae a "—"', async () => {
    const { supabase } = crearSupabaseFake({ usuarios: [USUARIOS[0]], usuariosAuth: [] })
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerAsesores()

    expect(resultado[0].email).toBe('—')
  })
})
