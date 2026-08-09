// @vitest-environment node
/**
 * Tests TDD del motor de escalamiento (src/lib/guardias/escalamiento.ts) con
 * reloj simulado (`ahora` inyectado). Claves: pasos por umbral acumulado (el
 * cron caído se pone al día), idempotencia at-most-once vía 23505, VIP solo
 * recordatorio, y un lead con error no tumba la corrida.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { leerConfiguracionMock, esLeadVipMock, crearNotificacionMock, notificarAdminsMock, enviarPushMock, enviarCorreoMock } =
  vi.hoisted(() => ({
    leerConfiguracionMock: vi.fn(),
    esLeadVipMock: vi.fn(),
    crearNotificacionMock: vi.fn().mockResolvedValue(undefined),
    notificarAdminsMock: vi.fn().mockResolvedValue(undefined),
    enviarPushMock: vi.fn().mockResolvedValue({ enviados: 1 }),
    enviarCorreoMock: vi.fn().mockResolvedValue({ enviado: true }),
  }))

vi.mock('@/lib/guardias/consultas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/guardias/consultas')>()
  return { ...actual, leerConfiguracion: leerConfiguracionMock, esLeadVip: esLeadVipMock }
})
vi.mock('@/lib/notificaciones/crear', () => ({
  crearNotificacion: crearNotificacionMock,
  notificarAdmins: notificarAdminsMock,
}))
vi.mock('@/lib/push/enviar', () => ({ enviarPush: enviarPushMock }))
vi.mock('@/lib/correo/enviar', () => ({ enviarCorreo: enviarCorreoMock }))

import { procesarEscalamientos } from '@/lib/guardias/escalamiento'
import { CONFIG_DEFAULTS, type ConfiguracionGuardias } from '@/lib/guardias/consultas'

const AHORA = new Date('2026-08-10T18:00:00Z')

const CONFIG: ConfiguracionGuardias = {
  ...CONFIG_DEFAULTS,
  duenoUserId: 'dueno-1',
  correoDueno: 'dueno@klo-ser.com',
}

interface FilaLead {
  id: string
  nombre: string
  asesor_id: string
  propiedad_id: string | null
  escalamiento_desde: string
  asignado_en: string | null
}

/** Lead cuyo reloj arrancó hace `minutos`. */
function lead(minutos: number, extra: Partial<FilaLead> = {}): FilaLead {
  const desde = new Date(AHORA.getTime() - minutos * 60_000).toISOString()
  return {
    id: `l-${minutos}`,
    nombre: 'Ana Cliente',
    asesor_id: 'asesor-1',
    propiedad_id: 'prop-1',
    escalamiento_desde: desde,
    asignado_en: desde,
    ...extra,
  }
}

/** Builder thenable que graba los filtros encadenados (estilo PostgREST). */
function crearTabla(resolver: (filtros: unknown[][]) => { data: unknown; error: unknown }) {
  const filtros: unknown[][] = []
  const c: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolver(filtros)).then(res, rej),
  }
  for (const m of ['select', 'eq', 'neq', 'not', 'gt', 'lte', 'limit']) {
    c[m] = (...args: unknown[]) => {
      filtros.push([m, ...args])
      return c
    }
  }
  return c
}

function fakeDb(opciones: {
  leads?: FilaLead[]
  conRespuestaManual?: string[]
  pasosPrevios?: string[]
  asesoresActivos?: string[]
}) {
  const pasosPrevios = new Set(opciones.pasosPrevios ?? [])
  const pasosInsertados: { lead_id: string; paso: string }[] = []
  const filtrosLeads: unknown[][] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') {
      return crearTabla((filtros) => {
        filtrosLeads.push(...filtros)
        return { data: opciones.leads ?? [], error: null }
      })
    }
    if (tabla === 'seguimientos') {
      return crearTabla((filtros) => {
        const eqLead = filtros.find((f) => f[0] === 'eq' && f[1] === 'lead_id')
        const leadId = eqLead?.[2] as string
        const tiene = (opciones.conRespuestaManual ?? []).includes(leadId)
        return { data: tiene ? [{ id: 'seg-1' }] : [], error: null }
      })
    }
    if (tabla === 'lead_escalamientos') {
      return {
        insert: vi.fn((payload: { lead_id: string; paso: string }) => {
          const clave = `${payload.lead_id}:${payload.paso}`
          if (pasosPrevios.has(clave)) {
            return Promise.resolve({ error: { code: '23505', message: 'dup' } })
          }
          pasosPrevios.add(clave)
          pasosInsertados.push(payload)
          return Promise.resolve({ error: null })
        }),
      }
    }
    if (tabla === 'usuarios') {
      return crearTabla(() => ({
        data: (opciones.asesoresActivos ?? []).map((id) => ({ user_id: id })),
        error: null,
      }))
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })

  return { supabase: { from } as unknown as SupabaseClient, pasosInsertados, filtrosLeads }
}

beforeEach(() => {
  leerConfiguracionMock.mockReset().mockResolvedValue(CONFIG)
  esLeadVipMock.mockReset().mockResolvedValue(false)
  crearNotificacionMock.mockClear()
  notificarAdminsMock.mockClear()
  enviarPushMock.mockClear()
  enviarCorreoMock.mockClear()
})

describe('procesarEscalamientos', () => {
  it('la query base filtra: etapa nuevo y reloj ya vencido (lte ahora)', async () => {
    const { supabase, filtrosLeads } = fakeDb({ leads: [] })
    await procesarEscalamientos(supabase, AHORA)
    expect(filtrosLeads).toContainEqual(['eq', 'etapa', 'nuevo'])
    expect(filtrosLeads).toContainEqual(['eq', 'archivado', false])
    expect(filtrosLeads).toContainEqual(['lte', 'escalamiento_desde', AHORA.toISOString()])
  })

  it('a los 20 min: solo recordatorio al asesor asignado', async () => {
    const { supabase, pasosInsertados } = fakeDb({ leads: [lead(20)] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual(['recordatorio_15:l-20'])
    expect(pasosInsertados).toEqual([{ lead_id: 'l-20', paso: 'recordatorio_15' }])
    expect(enviarPushMock).toHaveBeenCalledTimes(1)
    expect(enviarPushMock).toHaveBeenCalledWith(
      supabase,
      'asesor-1',
      expect.objectContaining({ url: '/asesor/leads/l-20' })
    )
  })

  it('cron caído: a los 45 min ejecuta recordatorio Y abierto en la MISMA corrida', async () => {
    const { supabase } = fakeDb({ leads: [lead(45)], asesoresActivos: ['asesor-1', 'asesor-2', 'asesor-3'] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual(['recordatorio_15:l-45', 'abierto_30:l-45'])
    // abierto_30: push a TODOS los asesores activos con «tómalo»
    const pushesAbierto = enviarPushMock.mock.calls.filter(
      (c) => (c[2] as { titulo: string }).titulo === 'Lead disponible — tómalo'
    )
    expect(pushesAbierto.map((c) => c[1])).toEqual(['asesor-1', 'asesor-2', 'asesor-3'])
  })

  it('idempotencia: un paso ya registrado (23505) no repite su side effect', async () => {
    const { supabase } = fakeDb({
      leads: [lead(45)],
      pasosPrevios: ['l-45:recordatorio_15'],
      asesoresActivos: ['asesor-2'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual(['abierto_30:l-45'])
    const titulos = enviarPushMock.mock.calls.map((c) => (c[2] as { titulo: string }).titulo)
    expect(titulos).not.toContain('Lead sin contestar')
  })

  it('a las 2h+: los tres pasos, con correo y push al dueño', async () => {
    const { supabase } = fakeDb({ leads: [lead(130)], asesoresActivos: ['asesor-2'] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual([
      'recordatorio_15:l-130',
      'abierto_30:l-130',
      'dueno_120:l-130',
    ])
    expect(enviarCorreoMock).toHaveBeenCalledWith(
      expect.objectContaining({ para: 'dueno@klo-ser.com' })
    )
    expect(enviarPushMock).toHaveBeenCalledWith(
      supabase,
      'dueno-1',
      expect.objectContaining({ titulo: 'Lead sin atender 2 horas' })
    )
  })

  it('dueño sin configurar: el paso 2h alerta a los admins y no manda correo', async () => {
    leerConfiguracionMock.mockResolvedValue({ ...CONFIG, duenoUserId: null, correoDueno: null })
    const { supabase } = fakeDb({ leads: [lead(130)], asesoresActivos: [] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toContain('dueno_120:l-130')
    expect(notificarAdminsMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ texto: expect.stringContaining('2 horas') })
    )
    expect(enviarCorreoMock).not.toHaveBeenCalled()
  })

  it('seguimiento manual posterior a la asignación → el lead ya contestó, no escala', async () => {
    const { supabase, pasosInsertados } = fakeDb({
      leads: [lead(45)],
      conRespuestaManual: ['l-45'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual([])
    expect(pasosInsertados).toEqual([])
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('VIP: solo recordatorio al dueño aunque lleve 3 horas; jamás abierto ni 2h', async () => {
    esLeadVipMock.mockResolvedValue(true)
    const { supabase, pasosInsertados } = fakeDb({
      leads: [lead(180, { asesor_id: 'dueno-1' })],
      asesoresActivos: ['asesor-2'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual(['recordatorio_vip:l-180'])
    expect(pasosInsertados).toEqual([{ lead_id: 'l-180', paso: 'recordatorio_vip' }])
    expect(enviarCorreoMock).not.toHaveBeenCalled()
    expect(enviarPushMock).toHaveBeenCalledWith(
      supabase,
      'dueno-1',
      expect.objectContaining({ titulo: 'Lead VIP sin contestar' })
    )
  })

  it('un lead con error no tumba la corrida: los demás se procesan', async () => {
    esLeadVipMock
      .mockRejectedValueOnce(new Error('boom vip'))
      .mockResolvedValueOnce(false)
    const { supabase } = fakeDb({ leads: [lead(20, { id: 'l-roto' }), lead(25)] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.errores).toEqual([expect.stringContaining('l-roto')])
    expect(r.pasosEjecutados).toEqual(['recordatorio_15:l-25'])
    expect(r.procesados).toBe(1)
  })
})
