// @vitest-environment node
/**
 * Tests TDD para `src/lib/google/conexiones.ts` (Task 7): guardarConexion,
 * obtenerConexion, marcarRevocada, desconectar — y la server action
 * `desconectarGoogle` de `src/lib/google/acciones.ts`.
 *
 * `conexiones.ts` importa 'server-only', que revienta (throw) al cargarse
 * fuera de un bundler con la condición "react-server" — se mockea el
 * paquete completo, igual que en src/test/push-enviar.test.ts y
 * src/test/asesores-consultas.test.ts.
 *
 * El cliente admin (`@/lib/supabase/admin`), `cifrarToken`/`descifrarToken`
 * (`@/lib/google/cifrado`) y `revocarToken` (`@/lib/google/oauth`) se
 * mockean por completo: estos tests verifican la LÓGICA de conexiones.ts
 * (qué se cifra, qué se conserva, cuándo se borra la fila), no el cifrado
 * real ni la red. La sección de `desconectarGoogle` reutiliza estos MISMOS
 * mocks — no mockea `@/lib/google/conexiones` aparte — así que ejercita el
 * `desconectar()` real por encima de un Supabase/crypto/oauth fingido; solo
 * `@/lib/auth/usuario-actual` (requireAsesor) y `next/cache`
 * (revalidatePath, que truena fuera de un request de Next) se mockean para
 * esa parte, mismo patrón que src/test/visitas-acciones.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

const { cifrarTokenMock, descifrarTokenMock } = vi.hoisted(() => ({
  cifrarTokenMock: vi.fn(),
  descifrarTokenMock: vi.fn(),
}))
vi.mock('@/lib/google/cifrado', () => ({
  cifrarToken: cifrarTokenMock,
  descifrarToken: descifrarTokenMock,
}))

const { revocarTokenMock } = vi.hoisted(() => ({
  revocarTokenMock: vi.fn(),
}))
vi.mock('@/lib/google/oauth', () => ({
  revocarToken: revocarTokenMock,
}))

const { requireAsesorMock } = vi.hoisted(() => ({
  requireAsesorMock: vi.fn(),
}))
vi.mock('@/lib/auth/usuario-actual', () => ({
  requireAsesor: requireAsesorMock,
}))

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

import {
  desconectar,
  guardarConexion,
  marcarRevocada,
  obtenerConexion,
} from '@/lib/google/conexiones'
import { desconectarGoogle } from '@/lib/google/acciones'

const USER_ID = 'asesor-1'

const ASESOR = {
  user_id: USER_ID,
  agencia_id: 'agencia-1',
  rol: 'asesor' as const,
  nombre: 'Ana',
  telefono: null,
  foto: null,
  activo: true,
}

beforeEach(() => {
  createAdminClientMock.mockReset()
  cifrarTokenMock.mockReset()
  descifrarTokenMock.mockReset()
  revocarTokenMock.mockReset()
  requireAsesorMock.mockReset()
  revalidatePathMock.mockReset()
})

describe('guardarConexion', () => {
  it('cifra el refresh token nuevo y hace upsert con estado activa', async () => {
    cifrarTokenMock.mockReturnValue('v1.CIFRADO-NUEVO')
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ upsert: upsertMock }))
    createAdminClientMock.mockReturnValue({ from })

    await guardarConexion({
      userId: USER_ID,
      email: 'ana@gmail.com',
      refreshToken: 'refresh-token-en-claro',
    })

    expect(cifrarTokenMock).toHaveBeenCalledWith('refresh-token-en-claro', USER_ID)
    expect(from).toHaveBeenCalledWith('google_conexiones')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        google_email: 'ana@gmail.com',
        refresh_token_cifrado: 'v1.CIFRADO-NUEVO',
        estado: 'activa',
      }),
      { onConflict: 'user_id' }
    )
  })

  it('sin refreshToken (reconexión), conserva el cifrado existente y NO cifra nada nuevo', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { refresh_token_cifrado: 'v1.CIFRADO-VIEJO' }, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ select, upsert: upsertMock }))
    createAdminClientMock.mockReturnValue({ from })

    await guardarConexion({ userId: USER_ID, email: 'ana@gmail.com', refreshToken: undefined })

    expect(cifrarTokenMock).not.toHaveBeenCalled()
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token_cifrado: 'v1.CIFRADO-VIEJO', estado: 'activa' }),
      { onConflict: 'user_id' }
    )
  })

  it('sin refreshToken y sin conexión previa que conservar, lanza (nunca guarda null)', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const upsertMock = vi.fn()
    const from = vi.fn(() => ({ select, upsert: upsertMock }))
    createAdminClientMock.mockReturnValue({ from })

    await expect(
      guardarConexion({ userId: USER_ID, email: 'ana@gmail.com', refreshToken: undefined })
    ).rejects.toThrow()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('si el upsert falla, propaga un error legible', async () => {
    cifrarTokenMock.mockReturnValue('v1.X')
    const upsertMock = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const from = vi.fn(() => ({ upsert: upsertMock }))
    createAdminClientMock.mockReturnValue({ from })

    await expect(
      guardarConexion({ userId: USER_ID, email: 'ana@gmail.com', refreshToken: 'tok' })
    ).rejects.toThrow('boom')
  })
})

describe('obtenerConexion', () => {
  it('devuelve el estado y el email SIN el refresh token', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        google_email: 'ana@gmail.com',
        estado: 'activa',
        creada_en: '2026-01-01T00:00:00.000Z',
        actualizada_en: '2026-01-02T00:00:00.000Z',
      },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createAdminClientMock.mockReturnValue({ from })

    const resultado = await obtenerConexion(USER_ID)

    expect(select).toHaveBeenCalledWith('google_email, estado, creada_en, actualizada_en')
    expect(resultado).toEqual({
      googleEmail: 'ana@gmail.com',
      estado: 'activa',
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-02T00:00:00.000Z',
    })
  })

  it('sin fila, devuelve null', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createAdminClientMock.mockReturnValue({ from })

    expect(await obtenerConexion(USER_ID)).toBeNull()
  })
})

describe('marcarRevocada', () => {
  it('cambia el estado a revocada', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq: eqMock }))
    const from = vi.fn(() => ({ update }))
    createAdminClientMock.mockReturnValue({ from })

    await marcarRevocada(USER_ID)

    expect(from).toHaveBeenCalledWith('google_conexiones')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'revocada' }))
    expect(eqMock).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('si el update falla, propaga un error legible', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const update = vi.fn(() => ({ eq: eqMock }))
    const from = vi.fn(() => ({ update }))
    createAdminClientMock.mockReturnValue({ from })

    await expect(marcarRevocada(USER_ID)).rejects.toThrow('boom')
  })
})

describe('desconectar', () => {
  /** Fake de `from('google_conexiones')` que resuelve tanto .select() (lectura del token) como .delete(). */
  function crearFakeDesconectar(opts: {
    filaExistente: { refresh_token_cifrado: string } | null
    errorDelete?: { message: string } | null
  }) {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: opts.filaExistente, error: null })
    const eqSelect = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq: eqSelect }))

    const eqDelete = vi.fn().mockResolvedValue({ error: opts.errorDelete ?? null })
    const del = vi.fn(() => ({ eq: eqDelete }))

    const from = vi.fn(() => ({ select, delete: del }))
    return { from, select, eqSelect, del, eqDelete }
  }

  it('revoca el token contra Google y borra la fila', async () => {
    descifrarTokenMock.mockReturnValue('refresh-en-claro')
    revocarTokenMock.mockResolvedValue(undefined)
    const fake = crearFakeDesconectar({ filaExistente: { refresh_token_cifrado: 'v1.X' } })
    createAdminClientMock.mockReturnValue({ from: fake.from })

    await desconectar(USER_ID)

    expect(descifrarTokenMock).toHaveBeenCalledWith('v1.X', USER_ID)
    expect(revocarTokenMock).toHaveBeenCalledWith('refresh-en-claro', expect.any(Function))
    expect(fake.del).toHaveBeenCalled()
    expect(fake.eqDelete).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('borra la fila AUNQUE la revocación contra Google falle (best-effort)', async () => {
    descifrarTokenMock.mockReturnValue('refresh-en-claro')
    revocarTokenMock.mockRejectedValue(new Error('Google respondió 500'))
    const fake = crearFakeDesconectar({ filaExistente: { refresh_token_cifrado: 'v1.X' } })
    createAdminClientMock.mockReturnValue({ from: fake.from })

    await expect(desconectar(USER_ID)).resolves.toBeUndefined()

    expect(fake.del).toHaveBeenCalled()
    expect(fake.eqDelete).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('sin fila previa, no intenta revocar pero igual borra (idempotente)', async () => {
    const fake = crearFakeDesconectar({ filaExistente: null })
    createAdminClientMock.mockReturnValue({ from: fake.from })

    await desconectar(USER_ID)

    expect(revocarTokenMock).not.toHaveBeenCalled()
    expect(fake.del).toHaveBeenCalled()
  })

  it('si el delete falla, propaga un error legible', async () => {
    const fake = crearFakeDesconectar({
      filaExistente: null,
      errorDelete: { message: 'boom' },
    })
    createAdminClientMock.mockReturnValue({ from: fake.from })

    await expect(desconectar(USER_ID)).rejects.toThrow('boom')
  })
})

describe('desconectarGoogle (server action)', () => {
  beforeEach(() => {
    requireAsesorMock.mockResolvedValue(ASESOR)
  })

  it('exige sesión de asesor, desconecta SU propia conexión y revalida /asesor', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqSelect = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq: eqSelect }))
    const eqDelete = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn(() => ({ eq: eqDelete }))
    const from = vi.fn(() => ({ select, delete: del }))
    createAdminClientMock.mockReturnValue({ from })

    const resultado = await desconectarGoogle()

    expect(requireAsesorMock).toHaveBeenCalled()
    expect(eqDelete).toHaveBeenCalledWith('user_id', USER_ID)
    expect(resultado).toEqual({ ok: true })
    expect(revalidatePathMock).toHaveBeenCalledWith('/asesor')
  })

  it('si desconectar() falla, devuelve {error} legible y NO revalida', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eqSelect = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq: eqSelect }))
    const eqDelete = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const del = vi.fn(() => ({ eq: eqDelete }))
    const from = vi.fn(() => ({ select, delete: del }))
    createAdminClientMock.mockReturnValue({ from })

    const resultado = await desconectarGoogle()

    expect(resultado).toEqual({ error: 'No se pudo desconectar tu cuenta de Google' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
