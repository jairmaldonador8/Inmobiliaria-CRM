// @vitest-environment node
/**
 * Tests TDD para el cron de reintento del espejo a Google Calendar (Task 10):
 * `src/lib/google/retry.ts` (`procesarPendientes`, `calcularProximoIntento`)
 * y `src/app/api/cron/gcal-retry/route.ts` (auth fail-closed).
 *
 * `retry.ts` importa `@/lib/google/espejo` (para su default de
 * `sincronizarVisita`), y ese módulo trae 'server-only' + varias
 * dependencias que tocan red/env al importarse — mismo set de mocks que
 * `src/test/google-espejo.test.ts` para poder importar el árbol sin
 * reventar fuera de la condición "react-server".
 *
 * `procesarPendientes` recibe el `SupabaseClient` por parámetro (como
 * `sincronizarEasyBroker`), así que los tests de la lógica de reintento
 * pasan un fake en memoria propio, sin mockear `@/lib/supabase/admin` — ese
 * mock solo hace falta para los tests de la ruta (que sí llaman a
 * `createAdminClient()` internamente).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('@/lib/google/conexiones', () => ({
  obtenerConexion: vi.fn(),
  obtenerRefreshTokenDescifrado: vi.fn(),
  marcarRevocada: vi.fn(),
}))

vi.mock('@/lib/google/oauth', () => ({
  ErrorGrantInvalido: class ErrorGrantInvalidoFake extends Error {},
  refrescarAccessToken: vi.fn(),
}))

vi.mock('@/lib/push/enviar', () => ({
  enviarPush: vi.fn(),
}))

import {
  calcularProximoIntento,
  procesarPendientes,
  LOTE_MAXIMO,
  TOPE_INTENTOS,
} from '@/lib/google/retry'
import { GET } from '@/app/api/cron/gcal-retry/route'

// ---------------------------------------------------------------------------
// Fake de `visitas` en memoria: reproduce las operaciones que usa retry.ts
// (select+eq+lte+order+limit para el lote; update+eq+eq+lte+select para el
// claim atómico; select+eq+maybeSingle para releer el estado final) contra
// un arreglo mutable, así el claim de una fila se refleja de verdad en la
// siguiente lectura — sin esto no se podría probar el reintento end-to-end.
// ---------------------------------------------------------------------------

type FilaFake = {
  id: string
  gcal_intentos: number
  gcal_sync_estado: string
  gcal_proximo_intento: string
  gcal_ultimo_error?: string | null
}

type Filtro = { campo: string; valor: unknown; op: 'eq' | 'lte' }

function coincide(fila: FilaFake, filtros: Filtro[]): boolean {
  return filtros.every(({ campo, valor, op }) => {
    const actual = (fila as Record<string, unknown>)[campo]
    if (op === 'eq') return actual === valor
    if (op === 'lte') {
      if (actual === null || actual === undefined) return false
      return (actual as string) <= (valor as string)
    }
    return true
  })
}

/**
 * `reclamosFallidos`: ids cuyo UPDATE de claim debe devolver 0 filas — así
 * se simula que "otro tick" ya reclamó esa visita justo antes.
 */
function crearTablaVisitasFake(filasIniciales: FilaFake[], reclamosFallidos: Set<string> = new Set()) {
  const filas: FilaFake[] = filasIniciales.map((f) => ({ ...f }))

  function construirSelect(filtros: Filtro[] = []): Record<string, unknown> {
    return {
      eq: (campo: string, valor: unknown) => construirSelect([...filtros, { campo, valor, op: 'eq' }]),
      lte: (campo: string, valor: unknown) => construirSelect([...filtros, { campo, valor, op: 'lte' }]),
      order: (campo: string, opciones: { ascending: boolean }) => ({
        limit: (n: number) => {
          const coincidentes = filas.filter((f) => coincide(f, filtros))
          coincidentes.sort((a, b) => {
            const av = (a as Record<string, unknown>)[campo] as string
            const bv = (b as Record<string, unknown>)[campo] as string
            if (av === bv) return 0
            const cmp = av < bv ? -1 : 1
            return opciones.ascending ? cmp : -cmp
          })
          return Promise.resolve({ data: coincidentes.slice(0, n), error: null })
        },
      }),
      maybeSingle: () => {
        const coincidentes = filas.filter((f) => coincide(f, filtros))
        return Promise.resolve({ data: coincidentes[0] ?? null, error: null })
      },
    }
  }

  function construirUpdate(patch: Record<string, unknown>, filtros: Filtro[] = []): Record<string, unknown> {
    return {
      eq: (campo: string, valor: unknown) => construirUpdate(patch, [...filtros, { campo, valor, op: 'eq' }]),
      lte: (campo: string, valor: unknown) => construirUpdate(patch, [...filtros, { campo, valor, op: 'lte' }]),
      select: () => {
        const coincidentes = filas.filter(
          (f) => coincide(f, filtros) && !reclamosFallidos.has(f.id)
        )
        for (const f of coincidentes) Object.assign(f, patch)
        return Promise.resolve({ data: coincidentes.map((f) => ({ id: f.id })), error: null })
      },
    }
  }

  const from = vi.fn((tabla: string) => {
    if (tabla !== 'visitas') throw new Error(`tabla inesperada en el stub: ${tabla}`)
    return {
      select: () => construirSelect(),
      update: (patch: Record<string, unknown>) => construirUpdate(patch),
    }
  })

  return { supabase: { from } as unknown as SupabaseClient, filas }
}

function visitaPendiente(overrides: Partial<FilaFake> & { id: string }): FilaFake {
  return {
    gcal_intentos: 0,
    gcal_sync_estado: 'pendiente',
    gcal_proximo_intento: '2026-01-01T00:00:00.000Z',
    gcal_ultimo_error: null,
    ...overrides,
  }
}

const AHORA = new Date('2026-01-01T00:10:00.000Z')

beforeEach(() => {
  createAdminClientMock.mockReset()
})

// ---------------------------------------------------------------------------
// calcularProximoIntento
// ---------------------------------------------------------------------------

describe('calcularProximoIntento', () => {
  it.each([
    { intentosPrevios: 0, minutosEsperados: 1 },
    { intentosPrevios: 1, minutosEsperados: 2 },
    { intentosPrevios: 2, minutosEsperados: 4 },
    { intentosPrevios: 3, minutosEsperados: 8 },
    { intentosPrevios: 4, minutosEsperados: 16 },
    { intentosPrevios: 5, minutosEsperados: 32 },
  ])('con $intentosPrevios intentos previos, agenda $minutosEsperados min después', ({ intentosPrevios, minutosEsperados }) => {
    const resultado = calcularProximoIntento(AHORA, intentosPrevios)
    expect(resultado).toEqual(new Date(AHORA.getTime() + minutosEsperados * 60_000))
  })

  it('el backoff es estrictamente creciente en función de los intentos', () => {
    const valores = [0, 1, 2, 3, 4, 5].map((n) => calcularProximoIntento(AHORA, n).getTime())
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i]).toBeGreaterThan(valores[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// procesarPendientes
// ---------------------------------------------------------------------------

describe('procesarPendientes', () => {
  it('claim atómico: si el UPDATE de reclamo no afecta filas (otro tick ya la tomó), no se procesa', async () => {
    const { supabase, filas } = crearTablaVisitasFake(
      [visitaPendiente({ id: 'visita-1' })],
      new Set(['visita-1'])
    )
    const sincronizarVisitaMock = vi.fn()

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).not.toHaveBeenCalled()
    expect(resumen).toEqual({ procesadas: 0, sincronizadas: 0, pendientes: 0, errores: 0 })
    // La fila queda intacta: nadie la tocó.
    expect(filas[0].gcal_intentos).toBe(0)
  })

  it('reclama con éxito, incrementa gcal_intentos y agenda el backoff correcto antes de llamar a sincronizarVisita', async () => {
    const { supabase, filas } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: 2 }),
    ])
    const sincronizarVisitaMock = vi.fn().mockResolvedValue(undefined)

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).toHaveBeenCalledWith('visita-1')
    expect(filas[0].gcal_intentos).toBe(3)
    expect(filas[0].gcal_proximo_intento).toBe(new Date(AHORA.getTime() + 4 * 60_000).toISOString())
    expect(resumen.procesadas).toBe(1)
  })

  it('tope de intentos agotado: NO llama a Google, marca error y deja el motivo en gcal_ultimo_error', async () => {
    const { supabase, filas } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: TOPE_INTENTOS }),
    ])
    const sincronizarVisitaMock = vi.fn()

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).not.toHaveBeenCalled()
    expect(filas[0].gcal_sync_estado).toBe('error')
    expect(filas[0].gcal_ultimo_error).toEqual(expect.any(String))
    expect(filas[0].gcal_ultimo_error?.length).toBeGreaterThan(0)
    expect(resumen).toEqual({ procesadas: 1, sincronizadas: 0, pendientes: 0, errores: 1 })
  })

  it('con menos del tope de intentos, sigue reintentando normalmente (no la agota antes de tiempo)', async () => {
    const { supabase } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: TOPE_INTENTOS - 1 }),
    ])
    const sincronizarVisitaMock = vi.fn().mockResolvedValue(undefined)

    await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).toHaveBeenCalledWith('visita-1')
  })

  it('lote acotado a 20, ordenado por gcal_proximo_intento (las más atrasadas primero)', async () => {
    const filasIniciales = Array.from({ length: 25 }, (_, i) =>
      visitaPendiente({
        id: `visita-${i}`,
        // i=0 -> la más atrasada (timestamp más chico); i=24 -> la menos atrasada.
        gcal_proximo_intento: new Date(AHORA.getTime() - (25 - i) * 60_000).toISOString(),
      })
    )
    const { supabase } = crearTablaVisitasFake(filasIniciales)
    const idsLlamados: string[] = []
    const sincronizarVisitaMock = vi.fn(async (id: string) => {
      idsLlamados.push(id)
    })

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(resumen.procesadas).toBe(LOTE_MAXIMO)
    expect(idsLlamados).toHaveLength(20)
    expect(idsLlamados[0]).toBe('visita-0')
    expect(idsLlamados).not.toContain('visita-24')
    expect(idsLlamados).not.toContain('visita-23')
  })

  it('visita cancelada sin gcal_event_id: sincronizarVisita la resuelve sin red y el resumen la cuenta como sincronizada', async () => {
    const { supabase, filas } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: 1 }),
    ])
    // Simula lo que hace `sincronizarVisita` para una cancelada sin
    // gcal_event_id (Task 8): marca sincronizada directo, sin llamar a Google.
    const sincronizarVisitaMock = vi.fn(async (id: string) => {
      const fila = filas.find((f) => f.id === id)
      if (fila) fila.gcal_sync_estado = 'sincronizada'
    })

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).toHaveBeenCalledWith('visita-1')
    expect(resumen).toEqual({ procesadas: 1, sincronizadas: 1, pendientes: 0, errores: 0 })
  })

  it('sin_conexion (terminal, no reintenta) también cuenta como resuelta en el resumen', async () => {
    const { supabase, filas } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: 1 }),
    ])
    const sincronizarVisitaMock = vi.fn(async (id: string) => {
      const fila = filas.find((f) => f.id === id)
      if (fila) fila.gcal_sync_estado = 'sin_conexion'
    })

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(resumen.sincronizadas).toBe(1)
  })

  it('si sincronizarVisita deja la visita pendiente de nuevo (falló otra vez), el resumen la cuenta en pendientes', async () => {
    const { supabase } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1', gcal_intentos: 1 }),
    ])
    const sincronizarVisitaMock = vi.fn().mockResolvedValue(undefined) // no muta el estado: sigue 'pendiente'

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(resumen.pendientes).toBe(1)
  })

  it('sin candidatos (lote vacío): no llama a sincronizarVisita y el resumen queda en ceros', async () => {
    const { supabase } = crearTablaVisitasFake([])
    const sincronizarVisitaMock = vi.fn()

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).not.toHaveBeenCalled()
    expect(resumen).toEqual({ procesadas: 0, sincronizadas: 0, pendientes: 0, errores: 0 })
  })

  it('un error de sincronizarVisita para una visita no detiene el resto del lote', async () => {
    const { supabase } = crearTablaVisitasFake([
      visitaPendiente({ id: 'visita-1' }),
      visitaPendiente({ id: 'visita-2', gcal_proximo_intento: '2026-01-01T00:00:01.000Z' }),
    ])
    const sincronizarVisitaMock = vi.fn(async (id: string) => {
      if (id === 'visita-1') throw new Error('fallo inesperado')
    })

    const resumen = await procesarPendientes(supabase, { sincronizarVisita: sincronizarVisitaMock, ahora: AHORA })

    expect(sincronizarVisitaMock).toHaveBeenCalledTimes(2)
    expect(resumen.procesadas).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// GET /api/cron/gcal-retry — auth fail-closed
// ---------------------------------------------------------------------------

describe('GET /api/cron/gcal-retry', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sin CRON_SECRET configurado: rechaza con 401 aunque venga un header', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const request = new Request('https://example.com/api/cron/gcal-retry', {
      headers: { authorization: 'Bearer lo-que-sea' },
    })

    const respuesta = await GET(request)

    expect(respuesta.status).toBe(401)
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it('sin header de autorización: 401', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto')
    const request = new Request('https://example.com/api/cron/gcal-retry')

    const respuesta = await GET(request)

    expect(respuesta.status).toBe(401)
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it('con el secret incorrecto: 401', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto')
    const request = new Request('https://example.com/api/cron/gcal-retry', {
      headers: { authorization: 'Bearer secreto-incorrecto' },
    })

    const respuesta = await GET(request)

    expect(respuesta.status).toBe(401)
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it('con el secret correcto: 200 y corre procesarPendientes sobre el admin client', async () => {
    vi.stubEnv('CRON_SECRET', 'secreto-correcto')
    const { supabase } = crearTablaVisitasFake([])
    createAdminClientMock.mockReturnValue(supabase)
    const request = new Request('https://example.com/api/cron/gcal-retry', {
      headers: { authorization: 'Bearer secreto-correcto' },
    })

    const respuesta = await GET(request)
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(200)
    expect(cuerpo).toEqual({ ok: true, procesadas: 0, sincronizadas: 0, pendientes: 0, errores: 0 })
    expect(createAdminClientMock).toHaveBeenCalledTimes(1)
  })
})
