// @vitest-environment node
/**
 * Tests TDD de las server actions admin de guardias
 * (src/lib/guardias/acciones.ts): validaciones, upsert por UNIQUE
 * fecha+turno, liberar turno, copiar semana sin pisar, y configuración.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { requireAdminMock, createAdminClientMock, revalidatePathMock, leerConfiguracionMock } =
  vi.hoisted(() => ({
    requireAdminMock: vi.fn().mockResolvedValue({ user_id: 'admin-1', nombre: 'Admin' }),
    createAdminClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    leerConfiguracionMock: vi.fn(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/auth/usuario-actual', () => ({
  requireAdmin: requireAdminMock,
  requireAsesor: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/guardias/consultas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/guardias/consultas')>()
  return { ...actual, leerConfiguracion: leerConfiguracionMock }
})

import {
  copiarSemanaAnterior,
  guardarConfiguracionGuardias,
  guardarGuardia,
  type EntradaConfiguracionGuardias,
} from '@/lib/guardias/acciones'
import { CONFIG_DEFAULTS } from '@/lib/guardias/consultas'

interface FilaGuardia {
  fecha: string
  turno: string
  hora_inicio?: string
  hora_fin?: string
  asesor_id?: string
}

/** Fake admin client configurable por tabla. */
function fakeAdmin(opciones: {
  asesorExiste?: boolean
  usuarioExiste?: boolean
  semanaOrigen?: FilaGuardia[]
  semanaDestino?: FilaGuardia[]
} = {}) {
  const upserts: { tabla: string; payload: unknown; conflicto?: string }[] = []
  const inserts: { tabla: string; payload: unknown }[] = []
  const deletes: { tabla: string; filtros: unknown[][] }[] = []
  let llamadasSelectGuardias = 0

  const from = vi.fn((tabla: string) => {
    if (tabla === 'usuarios') {
      const consulta: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) consulta[m] = vi.fn(() => consulta)
      consulta.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: (opciones.asesorExiste ?? opciones.usuarioExiste ?? true) ? { user_id: 'x' } : null,
          error: null,
        })
      )
      return consulta
    }
    if (tabla === 'guardias') {
      const filtros: unknown[][] = []
      const consulta: Record<string, unknown> = {
        upsert: vi.fn((payload: unknown, opts?: { onConflict?: string }) => {
          upserts.push({ tabla, payload, conflicto: opts?.onConflict })
          return Promise.resolve({ error: null })
        }),
        insert: vi.fn((payload: unknown) => {
          inserts.push({ tabla, payload })
          return Promise.resolve({ error: null })
        }),
        delete: vi.fn(() => {
          const cadena: Record<string, unknown> = {
            eq: vi.fn((...args: unknown[]) => {
              filtros.push(['eq', ...args])
              return cadena
            }),
            then: (res: (v: unknown) => unknown) => {
              deletes.push({ tabla, filtros })
              return Promise.resolve({ error: null }).then(res)
            },
          }
          return cadena
        }),
        then: undefined as unknown,
      }
      for (const m of ['select', 'gte', 'lte', 'order']) {
        consulta[m] = vi.fn(() => consulta)
      }
      // select de copiarSemana: 1a llamada = origen, 2a = destino
      consulta.then = (res: (v: unknown) => unknown) => {
        llamadasSelectGuardias += 1
        const data = llamadasSelectGuardias === 1 ? (opciones.semanaOrigen ?? []) : (opciones.semanaDestino ?? [])
        return Promise.resolve({ data, error: null }).then(res)
      }
      return consulta
    }
    if (tabla === 'configuracion') {
      return {
        upsert: vi.fn((payload: unknown, opts?: { onConflict?: string }) => {
          upserts.push({ tabla, payload, conflicto: opts?.onConflict })
          return Promise.resolve({ error: null })
        }),
      }
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })

  createAdminClientMock.mockReturnValue({ from })
  return { upserts, inserts, deletes }
}

beforeEach(() => {
  createAdminClientMock.mockReset()
  revalidatePathMock.mockClear()
  leerConfiguracionMock.mockReset().mockResolvedValue(CONFIG_DEFAULTS)
})

describe('guardarGuardia', () => {
  it('fecha o turno inválidos → error sin tocar la base', async () => {
    fakeAdmin()
    expect(await guardarGuardia('2026-13-99', 'manana', 'a1')).toEqual({ error: 'Fecha inválida' })
    expect(await guardarGuardia('10/08/2026', 'manana', 'a1')).toEqual({ error: 'Fecha inválida' })
    expect(await guardarGuardia('2026-08-10', 'nocturno' as 'manana', 'a1')).toEqual({
      error: 'Turno inválido',
    })
  })

  it('asesor inexistente o inactivo → error', async () => {
    fakeAdmin({ asesorExiste: false })
    expect(await guardarGuardia('2026-08-10', 'manana', 'fantasma')).toEqual({
      error: 'El asesor no está disponible',
    })
  })

  it('upsert por fecha+turno con las horas default del turno', async () => {
    const { upserts } = fakeAdmin({ asesorExiste: true })
    const r = await guardarGuardia('2026-08-10', 'tarde', 'asesor-1')

    expect(r).toEqual({ ok: true })
    expect(upserts[0]).toMatchObject({
      tabla: 'guardias',
      conflicto: 'fecha,turno',
      payload: {
        fecha: '2026-08-10',
        turno: 'tarde',
        hora_inicio: '15:00',
        hora_fin: '00:00',
        asesor_id: 'asesor-1',
      },
    })
  })

  it('asesorId null → libera el turno (delete por fecha+turno)', async () => {
    const { deletes, upserts } = fakeAdmin()
    const r = await guardarGuardia('2026-08-10', 'manana', null)

    expect(r).toEqual({ ok: true })
    expect(deletes[0].filtros).toContainEqual(['eq', 'fecha', '2026-08-10'])
    expect(deletes[0].filtros).toContainEqual(['eq', 'turno', 'manana'])
    expect(upserts).toHaveLength(0)
  })
})

describe('copiarSemanaAnterior', () => {
  it('la fecha destino debe ser lunes', async () => {
    fakeAdmin()
    expect(await copiarSemanaAnterior('2026-08-11')).toEqual({
      error: 'La fecha destino debe ser un lunes',
    })
  })

  it('semana anterior vacía → error claro', async () => {
    fakeAdmin({ semanaOrigen: [] })
    expect(await copiarSemanaAnterior('2026-08-10')).toEqual({
      error: 'La semana anterior no tiene guardias capturadas',
    })
  })

  it('copia desplazando +7 días y SIN pisar turnos ya capturados', async () => {
    const { inserts } = fakeAdmin({
      semanaOrigen: [
        { fecha: '2026-08-03', turno: 'manana', hora_inicio: '09:00', hora_fin: '15:00', asesor_id: 'a1' },
        { fecha: '2026-08-04', turno: 'tarde', hora_inicio: '15:00', hora_fin: '00:00', asesor_id: 'a2' },
      ],
      // el destino ya tiene capturado el lunes en la mañana: NO se pisa
      semanaDestino: [{ fecha: '2026-08-10', turno: 'manana' }],
    })

    const r = await copiarSemanaAnterior('2026-08-10')

    expect(r).toEqual({ ok: true, copiadas: 1 })
    expect(inserts[0].payload).toEqual([
      { fecha: '2026-08-11', turno: 'tarde', hora_inicio: '15:00', hora_fin: '00:00', asesor_id: 'a2' },
    ])
  })
})

describe('guardarConfiguracionGuardias', () => {
  const entrada = (extra: Partial<EntradaConfiguracionGuardias> = {}): EntradaConfiguracionGuardias => ({
    umbralVipMxn: 8_000_000,
    duenoUserId: null,
    correoDueno: null,
    escalamientoMin: { recordatorio: 15, abierto: 30, dueno: 120 },
    turnoManana: { inicio: '09:00', fin: '15:00' },
    turnoTarde: { inicio: '15:00', fin: '00:00' },
    ...extra,
  })

  it('valida umbral, orden de tiempos, formato de horas y correo', async () => {
    fakeAdmin()
    expect(await guardarConfiguracionGuardias(entrada({ umbralVipMxn: -5 }))).toMatchObject({
      error: expect.stringContaining('umbral'),
    })
    expect(
      await guardarConfiguracionGuardias(entrada({ escalamientoMin: { recordatorio: 30, abierto: 15, dueno: 120 } }))
    ).toMatchObject({ error: expect.stringContaining('orden') })
    expect(
      await guardarConfiguracionGuardias(entrada({ turnoManana: { inicio: '25:00', fin: '15:00' } }))
    ).toMatchObject({ error: expect.stringContaining('Hora inválida') })
    expect(await guardarConfiguracionGuardias(entrada({ correoDueno: 'no-es-correo' }))).toMatchObject({
      error: expect.stringContaining('correo'),
    })
  })

  it('dueño inexistente/inactivo → error', async () => {
    fakeAdmin({ usuarioExiste: false })
    expect(await guardarConfiguracionGuardias(entrada({ duenoUserId: 'fantasma' }))).toMatchObject({
      error: expect.stringContaining('dueño'),
    })
  })

  it('entrada válida → upsert de las 6 claves por clave', async () => {
    const { upserts } = fakeAdmin({ usuarioExiste: true })
    const r = await guardarConfiguracionGuardias(entrada({ duenoUserId: 'dueno-1' }))

    expect(r).toEqual({ ok: true })
    expect(upserts[0].tabla).toBe('configuracion')
    expect(upserts[0].conflicto).toBe('clave')
    const claves = (upserts[0].payload as { clave: string }[]).map((f) => f.clave)
    expect(claves).toEqual([
      'umbral_vip_mxn',
      'dueno_user_id',
      'correo_dueno',
      'escalamiento_min',
      'turno_manana',
      'turno_tarde',
    ])
  })
})
