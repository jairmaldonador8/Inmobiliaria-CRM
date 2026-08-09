// @vitest-environment node
/**
 * Tests TDD del resolutor de asignación (src/lib/guardias/resolutor.ts).
 *
 * `decidirAsignacion` es pura: recibe la guardia activa/siguiente ya
 * resueltas (las fronteras horarias se prueban en guardias-consultas).
 * `resolverAsignacion` orquesta las consultas — se mockean.
 *
 * Orden del spec: VIP → guardia activa → siguiente guardia → bandeja.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { guardiaActivaMock, siguienteGuardiaMock, leerConfiguracionMock, esLeadVipMock } =
  vi.hoisted(() => ({
    guardiaActivaMock: vi.fn(),
    siguienteGuardiaMock: vi.fn(),
    leerConfiguracionMock: vi.fn(),
    esLeadVipMock: vi.fn(),
  }))

vi.mock('@/lib/guardias/consultas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/guardias/consultas')>()
  return {
    ...actual,
    guardiaActiva: guardiaActivaMock,
    siguienteGuardia: siguienteGuardiaMock,
    leerConfiguracion: leerConfiguracionMock,
    esLeadVip: esLeadVipMock,
  }
})

import { decidirAsignacion, resolverAsignacion } from '@/lib/guardias/resolutor'
import { CONFIG_DEFAULTS, type ConfiguracionGuardias, type Guardia } from '@/lib/guardias/consultas'

const AHORA = new Date('2026-08-10T16:00:00Z') // 10:00 Monterrey

const ACTIVA: Guardia = {
  id: 'g-activa', fecha: '2026-08-10', turno: 'manana',
  hora_inicio: '09:00:00', hora_fin: '15:00:00', asesor_id: 'asesor-activo',
}
// Turno tarde de hoy: inicia 15:00 Monterrey = 21:00Z
const SIGUIENTE: Guardia = {
  id: 'g-sig', fecha: '2026-08-10', turno: 'tarde',
  hora_inicio: '15:00:00', hora_fin: '00:00:00', asesor_id: 'asesor-siguiente',
}

const config = (extra: Partial<ConfiguracionGuardias> = {}): ConfiguracionGuardias => ({
  ...CONFIG_DEFAULTS,
  duenoUserId: 'dueno-1',
  ...extra,
})

describe('decidirAsignacion', () => {
  it('guardia activa → asignar a ese asesor con reloj desde ahora', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: false, config: config(), activa: ACTIVA, siguiente: null })
    expect(d).toEqual({ tipo: 'guardia_activa', asesorId: 'asesor-activo', escalamientoDesde: AHORA.toISOString() })
  })

  it('fuera de horario (hueco o madrugada) → siguiente guardia con reloj diferido a su inicio', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: false, config: config(), activa: null, siguiente: SIGUIENTE })
    expect(d).toEqual({
      tipo: 'guardia_futura',
      asesorId: 'asesor-siguiente',
      escalamientoDesde: '2026-08-10T21:00:00.000Z',
    })
  })

  it('sin rol cargado → bandeja', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: false, config: config(), activa: null, siguiente: null })
    expect(d).toEqual({ tipo: 'bandeja' })
  })

  it('VIP en horario de guardia → directo al dueño, reloj desde ahora', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: true, config: config(), activa: ACTIVA, siguiente: null })
    expect(d).toEqual({
      tipo: 'vip', asesorId: 'dueno-1',
      escalamientoDesde: AHORA.toISOString(), fueraDeHorario: false,
    })
  })

  it('VIP fuera de horario → al dueño con reloj diferido al siguiente turno (no lo despierta a las 3am)', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: true, config: config(), activa: null, siguiente: SIGUIENTE })
    expect(d).toEqual({
      tipo: 'vip', asesorId: 'dueno-1',
      escalamientoDesde: '2026-08-10T21:00:00.000Z', fueraDeHorario: true,
    })
  })

  it('VIP sin rol cargado → al dueño con reloj desde ahora', () => {
    const d = decidirAsignacion({ ahora: AHORA, esVip: true, config: config(), activa: null, siguiente: null })
    expect(d).toEqual({
      tipo: 'vip', asesorId: 'dueno-1',
      escalamientoDesde: AHORA.toISOString(), fueraDeHorario: false,
    })
  })

  it('VIP con dueño SIN configurar → regla apagada, sigue el flujo normal', () => {
    const d = decidirAsignacion({
      ahora: AHORA, esVip: true, config: config({ duenoUserId: null }), activa: ACTIVA, siguiente: null,
    })
    expect(d.tipo).toBe('guardia_activa')
  })
})

describe('resolverAsignacion', () => {
  const supabase = {} as SupabaseClient

  beforeEach(() => {
    guardiaActivaMock.mockReset()
    siguienteGuardiaMock.mockReset()
    leerConfiguracionMock.mockReset()
    esLeadVipMock.mockReset()
    leerConfiguracionMock.mockResolvedValue(config())
    esLeadVipMock.mockResolvedValue(false)
    guardiaActivaMock.mockResolvedValue(null)
    siguienteGuardiaMock.mockResolvedValue(null)
  })

  it('compone consultas: guardia activa gana y no consulta la siguiente', async () => {
    guardiaActivaMock.mockResolvedValue(ACTIVA)
    const { decision } = await resolverAsignacion(supabase, 'p1', AHORA)
    expect(decision.tipo).toBe('guardia_activa')
    expect(siguienteGuardiaMock).not.toHaveBeenCalled()
  })

  it('devuelve la config para que el caller notifique (dueño, correo)', async () => {
    const { config: cfg } = await resolverAsignacion(supabase, 'p1', AHORA)
    expect(cfg.duenoUserId).toBe('dueno-1')
  })

  it('propaga errores de consulta (el sync degrada a bandeja + alerta admin)', async () => {
    esLeadVipMock.mockRejectedValue(new Error('rls boom'))
    await expect(resolverAsignacion(supabase, 'p1', AHORA)).rejects.toThrow('rls boom')
  })
})
