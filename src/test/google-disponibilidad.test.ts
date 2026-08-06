// @vitest-environment node
/**
 * Tests TDD para la disponibilidad de un asesor (Task 9):
 * `src/lib/google/disponibilidad.ts` (`obtenerDisponibilidad`, `seSolapan`) y
 * `src/app/api/google/disponibilidad/route.ts` (validación + autorización).
 *
 * Mismo patrón de mocks que `src/test/google-espejo.test.ts`: 'server-only'
 * se mockea completo, igual que `@/lib/supabase/admin`, `@/lib/google/conexiones`
 * y `@/lib/google/oauth` — Google está TOTALMENTE mockeado vía inyección de
 * dependencias (`crearClienteFreeBusy`), nunca se toca la red ni el SDK real.
 *
 * Los tests de la ruta reutilizan estos MISMOS mocks de bajo nivel (no se
 * mockea `@/lib/google/disponibilidad` aparte) — así que ejercitan el código
 * real de `obtenerDisponibilidad` por encima de un Supabase/Google fingido,
 * y solo agregan el mock de `@/lib/auth/usuario-actual` para la sesión.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

const { obtenerConexionMock, obtenerRefreshTokenDescifradoMock, marcarRevocadaMock } = vi.hoisted(
  () => ({
    obtenerConexionMock: vi.fn(),
    obtenerRefreshTokenDescifradoMock: vi.fn(),
    marcarRevocadaMock: vi.fn(),
  })
)
vi.mock('@/lib/google/conexiones', () => ({
  obtenerConexion: obtenerConexionMock,
  obtenerRefreshTokenDescifrado: obtenerRefreshTokenDescifradoMock,
  marcarRevocada: marcarRevocadaMock,
}))

const { ErrorGrantInvalidoFake, refrescarAccessTokenMock } = vi.hoisted(() => {
  class ErrorGrantInvalidoFake extends Error {
    constructor() {
      super('invalid_grant de prueba')
      this.name = 'ErrorGrantInvalido'
    }
  }
  return { ErrorGrantInvalidoFake, refrescarAccessTokenMock: vi.fn() }
})
vi.mock('@/lib/google/oauth', () => ({
  ErrorGrantInvalido: ErrorGrantInvalidoFake,
  refrescarAccessToken: refrescarAccessTokenMock,
}))

const { usuarioActualMock } = vi.hoisted(() => ({
  usuarioActualMock: vi.fn(),
}))
vi.mock('@/lib/auth/usuario-actual', () => ({
  usuarioActual: usuarioActualMock,
}))

import { NextRequest } from 'next/server'

import { obtenerDisponibilidad, seSolapan, type ClienteFreeBusyMinimo } from '@/lib/google/disponibilidad'
import { GET } from '@/app/api/google/disponibilidad/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilaVisita = { id: string; fecha: string; duracion_min: number }

/** Stub chainable de `createAdminClient()` para `visitas`: select().eq().eq().gte().lt()[.neq()] es un thenable que resuelve `{ data, error }`. `neq` filtra de verdad (para probar `excluirVisitaId` de punta a punta). */
function crearVisitasBuilder(filas: FilaVisita[], error: { message: string } | null = null) {
  let excluirId: string | undefined
  const builder: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    gte: ReturnType<typeof vi.fn>
    lt: ReturnType<typeof vi.fn>
    neq: ReturnType<typeof vi.fn>
    then: (resolve: (v: { data: FilaVisita[] | null; error: unknown }) => unknown) => unknown
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    neq: vi.fn((_col: string, valor: string) => {
      excluirId = valor
      return builder
    }),
    then: (resolve) => {
      const data = error ? null : excluirId ? filas.filter((f) => f.id !== excluirId) : filas
      return Promise.resolve({ data, error }).then(resolve)
    },
  }
  return builder
}

function crearSupabaseFake(filas: FilaVisita[], error: { message: string } | null = null) {
  const builder = crearVisitasBuilder(filas, error)
  const from = vi.fn((tabla: string) => {
    if (tabla !== 'visitas') throw new Error(`tabla inesperada en el stub: ${tabla}`)
    return builder
  })
  return { supabase: { from } as unknown as ReturnType<typeof createAdminClientMock>, from, builder }
}

function crearClienteFreeBusyFake(busy: { start: string; end: string }[]) {
  const query = vi.fn().mockResolvedValue({ data: { calendars: { primary: { busy } } } })
  return { freebusy: { query } } as unknown as ClienteFreeBusyMinimo
}

const CONEXION_ACTIVA = {
  googleEmail: 'asesor@gmail.com',
  estado: 'activa' as const,
  creadaEn: '2026-01-01T00:00:00.000Z',
  actualizadaEn: '2026-01-01T00:00:00.000Z',
}

const RANGO = { desde: '2026-03-10T18:00:00.000Z', hasta: '2026-03-10T22:00:00.000Z' }

beforeEach(() => {
  createAdminClientMock.mockReset()
  obtenerConexionMock.mockReset()
  obtenerRefreshTokenDescifradoMock.mockReset()
  marcarRevocadaMock.mockReset()
  refrescarAccessTokenMock.mockReset()
  usuarioActualMock.mockReset()

  obtenerConexionMock.mockResolvedValue(CONEXION_ACTIVA)
  obtenerRefreshTokenDescifradoMock.mockResolvedValue('refresh-token-x')
  refrescarAccessTokenMock.mockResolvedValue('access-token-x')
  marcarRevocadaMock.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// seSolapan
// ---------------------------------------------------------------------------

describe('seSolapan', () => {
  it('dos rangos que se cruzan se solapan', () => {
    expect(
      seSolapan(
        { inicio: '2026-03-10T18:00:00.000Z', fin: '2026-03-10T19:00:00.000Z' },
        { inicio: '2026-03-10T18:30:00.000Z', fin: '2026-03-10T19:30:00.000Z' }
      )
    ).toBe(true)
  })

  it('un rango contenido dentro de otro se solapa', () => {
    expect(
      seSolapan(
        { inicio: '2026-03-10T18:00:00.000Z', fin: '2026-03-10T20:00:00.000Z' },
        { inicio: '2026-03-10T18:30:00.000Z', fin: '2026-03-10T19:00:00.000Z' }
      )
    ).toBe(true)
  })

  it('rangos que NO se tocan no se solapan', () => {
    expect(
      seSolapan(
        { inicio: '2026-03-10T18:00:00.000Z', fin: '2026-03-10T19:00:00.000Z' },
        { inicio: '2026-03-10T20:00:00.000Z', fin: '2026-03-10T21:00:00.000Z' }
      )
    ).toBe(false)
  })

  it('bordes que se TOCAN exactamente (fin de uno = inicio del otro) NO se solapan', () => {
    expect(
      seSolapan(
        { inicio: '2026-03-10T18:00:00.000Z', fin: '2026-03-10T19:00:00.000Z' },
        { inicio: '2026-03-10T19:00:00.000Z', fin: '2026-03-10T20:00:00.000Z' }
      )
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// obtenerDisponibilidad
// ---------------------------------------------------------------------------

describe('obtenerDisponibilidad', () => {
  it('mezcla bloques de Google y visitas del CRM, ordenados por inicio', async () => {
    const { supabase } = crearSupabaseFake([
      { id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracion_min: 60 },
    ])
    createAdminClientMock.mockReturnValue(supabase)
    const cliente = crearClienteFreeBusyFake([
      { start: '2026-03-10T18:30:00.000Z', end: '2026-03-10T19:00:00.000Z' },
    ])

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO, {
      crearClienteFreeBusy: () => cliente,
    })

    expect(resultado.advertenciaParcial).toBe(false)
    expect(resultado.ocupado).toEqual([
      { inicio: '2026-03-10T18:30:00.000Z', fin: '2026-03-10T19:00:00.000Z' },
      { inicio: '2026-03-10T20:00:00.000Z', fin: '2026-03-10T21:00:00.000Z' },
    ])
  })

  it('sin conexión de Google: solo bloques del CRM, sin advertencia y sin llamar a Google', async () => {
    obtenerConexionMock.mockResolvedValue(null)
    const { supabase } = crearSupabaseFake([
      { id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracion_min: 30 },
    ])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO)

    expect(resultado.advertenciaParcial).toBe(false)
    expect(resultado.ocupado).toEqual([
      { inicio: '2026-03-10T20:00:00.000Z', fin: '2026-03-10T20:30:00.000Z' },
    ])
    expect(refrescarAccessTokenMock).not.toHaveBeenCalled()
  })

  it('conexión revocada: mismo tratamiento que sin conexión', async () => {
    obtenerConexionMock.mockResolvedValue({ ...CONEXION_ACTIVA, estado: 'revocada' })
    const { supabase } = crearSupabaseFake([])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO)

    expect(resultado.advertenciaParcial).toBe(false)
    expect(resultado.ocupado).toEqual([])
  })

  it('error al consultar Google (5xx/red): CRM + advertenciaParcial, NUNCA lanza', async () => {
    const { supabase } = crearSupabaseFake([
      { id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracion_min: 60 },
    ])
    createAdminClientMock.mockReturnValue(supabase)
    const cliente = {
      freebusy: { query: vi.fn().mockRejectedValue(new Error('Google respondió 500')) },
    } as unknown as ClienteFreeBusyMinimo

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO, {
      crearClienteFreeBusy: () => cliente,
    })

    expect(resultado.advertenciaParcial).toBe(true)
    expect(resultado.ocupado).toEqual([
      { inicio: '2026-03-10T20:00:00.000Z', fin: '2026-03-10T21:00:00.000Z' },
    ])
  })

  it('ErrorGrantInvalido al refrescar: CRM + advertenciaParcial y marca la conexión revocada (best-effort, no lanza)', async () => {
    refrescarAccessTokenMock.mockRejectedValue(new ErrorGrantInvalidoFake())
    const { supabase } = crearSupabaseFake([])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO)

    expect(resultado.advertenciaParcial).toBe(true)
    expect(marcarRevocadaMock).toHaveBeenCalledWith('asesor-1')
  })

  it('el refresh token no se puede descifrar: no lanza, trata como sin conexión utilizable', async () => {
    obtenerRefreshTokenDescifradoMock.mockRejectedValue(new Error('token corrupto'))
    const { supabase } = crearSupabaseFake([])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO)

    expect(resultado.advertenciaParcial).toBe(true)
    expect(resultado.ocupado).toEqual([])
  })

  it('visita del CRM fuera del rango consultado no aparece', async () => {
    obtenerConexionMock.mockResolvedValue(null)
    const { supabase } = crearSupabaseFake([
      { id: 'visita-lejana', fecha: '2026-03-11T20:00:00.000Z', duracion_min: 30 },
    ])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO)

    expect(resultado.ocupado).toEqual([])
  })

  it('excluirVisitaId (reagendar) excluye la propia visita de los bloques del CRM', async () => {
    obtenerConexionMock.mockResolvedValue(null)
    const { supabase } = crearSupabaseFake([
      { id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracion_min: 60 },
      { id: 'visita-2', fecha: '2026-03-10T19:00:00.000Z', duracion_min: 30 },
    ])
    createAdminClientMock.mockReturnValue(supabase)

    const resultado = await obtenerDisponibilidad('asesor-1', RANGO, {
      excluirVisitaId: 'visita-1',
    })

    expect(resultado.ocupado).toEqual([
      { inicio: '2026-03-10T19:00:00.000Z', fin: '2026-03-10T19:30:00.000Z' },
    ])
  })
})

// ---------------------------------------------------------------------------
// GET /api/google/disponibilidad
// ---------------------------------------------------------------------------

const ASESOR = {
  user_id: 'asesor-1',
  agencia_id: 'agencia-1',
  rol: 'asesor' as const,
  nombre: 'Ana',
  telefono: null,
  foto: null,
  activo: true,
}

const ADMIN = { ...ASESOR, user_id: 'admin-1', rol: 'admin' as const, nombre: 'Root' }

function url(params: Record<string, string>) {
  return `http://localhost/api/google/disponibilidad?${new URLSearchParams(params).toString()}`
}

describe('GET /api/google/disponibilidad', () => {
  beforeEach(() => {
    // Camino feliz por defecto para las rutas que sí deben ejecutar la
    // consulta real: sin conexión de Google, sin visitas en el CRM.
    obtenerConexionMock.mockResolvedValue(null)
    createAdminClientMock.mockReturnValue(crearSupabaseFake([]).supabase)
  })

  it('sin sesión: 401', async () => {
    usuarioActualMock.mockResolvedValue(null)

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: RANGO.desde, hasta: RANGO.hasta }))
    )

    expect(respuesta.status).toBe(401)
  })

  it('faltan parámetros: 400', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)

    const respuesta = await GET(new NextRequest(url({ asesor: 'asesor-1' })))

    expect(respuesta.status).toBe(400)
  })

  it('desde/hasta no parseables: 400', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: 'no-es-fecha', hasta: RANGO.hasta }))
    )

    expect(respuesta.status).toBe(400)
  })

  it('hasta anterior o igual a desde: 400', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: RANGO.hasta, hasta: RANGO.desde }))
    )

    expect(respuesta.status).toBe(400)
  })

  it('rango mayor a 7 días: 400', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)

    const respuesta = await GET(
      new NextRequest(
        url({ asesor: 'asesor-1', desde: '2026-03-01T00:00:00.000Z', hasta: '2026-03-20T00:00:00.000Z' })
      )
    )

    expect(respuesta.status).toBe(400)
  })

  it('un asesor NO puede consultar la disponibilidad de otro asesor: 403', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR) // user_id: asesor-1

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'otro-asesor', desde: RANGO.desde, hasta: RANGO.hasta }))
    )

    expect(respuesta.status).toBe(403)
  })

  it('un asesor SÍ puede consultar su propia disponibilidad: 200', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: RANGO.desde, hasta: RANGO.hasta }))
    )

    expect(respuesta.status).toBe(200)
    const cuerpo = await respuesta.json()
    expect(cuerpo).toEqual({ ocupado: [], advertenciaParcial: false })
  })

  it('un admin SÍ puede consultar la disponibilidad de cualquier asesor: 200', async () => {
    usuarioActualMock.mockResolvedValue(ADMIN)

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: RANGO.desde, hasta: RANGO.hasta }))
    )

    expect(respuesta.status).toBe(200)
  })

  it('la respuesta nunca incluye título ni detalle de eventos, solo bloques de tiempo', async () => {
    usuarioActualMock.mockResolvedValue(ASESOR)
    createAdminClientMock.mockReturnValue(
      crearSupabaseFake([{ id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracion_min: 30 }]).supabase
    )

    const respuesta = await GET(
      new NextRequest(url({ asesor: 'asesor-1', desde: RANGO.desde, hasta: RANGO.hasta }))
    )
    const cuerpo = await respuesta.json()

    expect(cuerpo.ocupado).toEqual([
      { inicio: '2026-03-10T20:00:00.000Z', fin: '2026-03-10T20:30:00.000Z' },
    ])
    expect(JSON.stringify(cuerpo)).not.toMatch(/summary|description|titulo/i)
  })
})
