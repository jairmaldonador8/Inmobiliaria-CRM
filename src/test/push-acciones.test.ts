// @vitest-environment node
/**
 * Tests TDD para las server actions de suscripción push
 * (ver src/lib/push/acciones.ts): guardarSuscripcion() hace upsert por
 * endpoint para el usuario de la sesión actual; eliminarSuscripcion() borra
 * por endpoint. Ambas exigen sesión — usuarioActual y el cliente de
 * Supabase se mockean completos, igual que en
 * src/test/notificaciones-push.test.ts y src/test/push-enviar.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { usuarioActualMock } = vi.hoisted(() => ({
  usuarioActualMock: vi.fn(),
}))

vi.mock('@/lib/auth/usuario-actual', () => ({
  usuarioActual: usuarioActualMock,
}))

const {
  createClientMock,
  upsertMock,
  fromMock,
  deleteEqMock,
  deleteEqUsuarioMock,
  deleteMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
  deleteEqMock: vi.fn(),
  deleteEqUsuarioMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import { eliminarSuscripcion, guardarSuscripcion } from '@/lib/push/acciones'

const USUARIO = {
  user_id: 'user-1',
  agencia_id: 'agencia-1',
  rol: 'asesor' as const,
  nombre: 'Ana',
  telefono: null,
  foto: null,
  activo: true,
}

const SUB = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'p256dh-valor', auth: 'auth-valor' },
}

describe('guardarSuscripcion', () => {
  beforeEach(() => {
    usuarioActualMock.mockReset()
    createClientMock.mockReset()
    upsertMock.mockReset()
    fromMock.mockReset()
    upsertMock.mockResolvedValue({ error: null })
    fromMock.mockImplementation(() => ({ upsert: upsertMock }))
    createClientMock.mockResolvedValue({ from: fromMock })
  })

  it('guarda la suscripción vía upsert con onConflict: "endpoint" para el usuario de la sesión actual', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO)

    const resultado = await guardarSuscripcion(SUB, 'Mozilla/5.0')

    expect(fromMock).toHaveBeenCalledWith('push_suscripciones')
    expect(upsertMock).toHaveBeenCalledWith(
      {
        usuario_id: 'user-1',
        endpoint: 'https://push.example/abc',
        p256dh: 'p256dh-valor',
        auth: 'auth-valor',
        user_agent: 'Mozilla/5.0',
      },
      { onConflict: 'endpoint' }
    )
    expect(resultado).toEqual({})
  })

  it('sin sesión devuelve {error} y NO toca la base de datos', async () => {
    usuarioActualMock.mockResolvedValue(null)

    const resultado = await guardarSuscripcion(SUB, 'Mozilla/5.0')

    expect(resultado).toEqual({ error: 'Sin sesión' })
    expect(createClientMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('si el upsert falla, devuelve {error} legible', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO)
    upsertMock.mockResolvedValue({ error: { message: 'boom' } })

    const resultado = await guardarSuscripcion(SUB, 'Mozilla/5.0')

    expect(resultado).toEqual({ error: 'No se pudo guardar la suscripción' })
  })

  it('sin user_agent, guarda user_agent: null', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO)

    await guardarSuscripcion(SUB)

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_agent: null }),
      { onConflict: 'endpoint' }
    )
  })
})

describe('eliminarSuscripcion', () => {
  beforeEach(() => {
    usuarioActualMock.mockReset()
    createClientMock.mockReset()
    fromMock.mockReset()
    deleteEqMock.mockReset()
    deleteEqUsuarioMock.mockReset()
    deleteMock.mockReset()
    deleteEqUsuarioMock.mockResolvedValue({ error: null })
    deleteEqMock.mockImplementation(() => ({ eq: deleteEqUsuarioMock }))
    deleteMock.mockImplementation(() => ({ eq: deleteEqMock }))
    fromMock.mockImplementation(() => ({ delete: deleteMock }))
    createClientMock.mockResolvedValue({ from: fromMock })
  })

  it('con sesión, borra la suscripción por endpoint Y por usuario_id (defensa en profundidad)', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO)

    const resultado = await eliminarSuscripcion('https://push.example/abc')

    expect(fromMock).toHaveBeenCalledWith('push_suscripciones')
    expect(deleteMock).toHaveBeenCalled()
    expect(deleteEqMock).toHaveBeenCalledWith('endpoint', 'https://push.example/abc')
    expect(deleteEqUsuarioMock).toHaveBeenCalledWith('usuario_id', 'user-1')
    expect(resultado).toEqual({})
  })

  it('sin sesión devuelve {error} y NO toca la base de datos', async () => {
    usuarioActualMock.mockResolvedValue(null)

    const resultado = await eliminarSuscripcion('https://push.example/abc')

    expect(resultado).toEqual({ error: 'Sin sesión' })
    expect(createClientMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
