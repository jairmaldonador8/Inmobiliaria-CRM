// @vitest-environment node
/**
 * Tests TDD del motor de escalamiento v2 — RONDAS en DIGEST
 * (src/lib/guardias/escalamiento.ts, spec Fase C). Reloj simulado.
 *
 * Claves: rondas acumuladas tras cron caído pero UN solo push por
 * destinatario por corrida; nada de rondas después del umbral del dueño;
 * idempotencia por ronda vía 23505; VIP un solo recordatorio; respuesta
 * manual detiene todo; un lead con error no tumba la corrida.
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
    nombre: `Lead${minutos}`,
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
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gt', 'lte', 'limit']) {
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
  const eventosInsertados: { lead_id: string; tipo: string; actor_id: string | null; payload: Record<string, unknown> }[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') {
      return crearTabla(() => ({ data: opciones.leads ?? [], error: null }))
    }
    if (tabla === 'seguimientos') {
      return crearTabla((filtros) => {
        const eqLead = filtros.find((f) => f[0] === 'eq' && f[1] === 'lead_id')
        const tiene = (opciones.conRespuestaManual ?? []).includes(eqLead?.[2] as string)
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
    if (tabla === 'lead_eventos') {
      return {
        insert: vi.fn((payload: (typeof eventosInsertados)[number]) => {
          eventosInsertados.push(payload)
          return Promise.resolve({ error: null })
        }),
      }
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })

  return { supabase: { from } as unknown as SupabaseClient, pasosInsertados, eventosInsertados }
}

function pushesDe(destinatario: string) {
  return enviarPushMock.mock.calls.filter((c) => c[1] === destinatario)
}

beforeEach(() => {
  leerConfiguracionMock.mockReset().mockResolvedValue(CONFIG)
  esLeadVipMock.mockReset().mockResolvedValue(false)
  crearNotificacionMock.mockClear()
  notificarAdminsMock.mockClear()
  enviarPushMock.mockClear()
  enviarCorreoMock.mockClear()
})

describe('procesarEscalamientos v2 (rondas en digest)', () => {
  it('a los 20 min: solo la ronda 1 de recordatorio, digest privado de un lead', async () => {
    const { supabase, pasosInsertados } = fakeDb({ leads: [lead(20)] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(pasosInsertados).toEqual([{ lead_id: 'l-20', paso: 'recordatorio_r1' }])
    expect(r.pasosEjecutados).toEqual(['recordatorio_r1:l-20'])
    expect(pushesDe('asesor-1')).toHaveLength(1)
    expect(pushesDe('asesor-1')[0][2]).toMatchObject({ url: '/asesor/leads/l-20' })
  })

  it('cada paso registrado y cada push de recordatorio dejan su evento en lead_eventos (actor null = sistema)', async () => {
    const { supabase, eventosInsertados } = fakeDb({ leads: [lead(20)] })
    await procesarEscalamientos(supabase, AHORA)

    expect(eventosInsertados).toEqual([
      {
        lead_id: 'l-20',
        tipo: 'escalamiento_paso',
        actor_id: null,
        payload: { paso: 'recordatorio_r1' },
      },
      {
        lead_id: 'l-20',
        tipo: 'push_recordatorio',
        actor_id: null,
        payload: { paso: 'recordatorio_r1' },
      },
    ])
  })

  it('cron caído: un escalamiento_paso por ronda registrada y UN push_recordatorio con la última ronda', async () => {
    const { supabase, eventosInsertados } = fakeDb({
      leads: [lead(50)],
      asesoresActivos: ['asesor-1', 'asesor-2'],
    })
    await procesarEscalamientos(supabase, AHORA)

    const pasosEventos = eventosInsertados
      .filter((e) => e.tipo === 'escalamiento_paso')
      .map((e) => e.payload.paso)
    expect(pasosEventos).toEqual(['recordatorio_r1', 'recordatorio_r2', 'recordatorio_r3', 'abierto_r1'])
    // El digest manda UN push por destinatario → UN push_recordatorio por lead,
    // anotado con la última ronda nueva (el abierto no es recordatorio).
    const pushEventos = eventosInsertados.filter((e) => e.tipo === 'push_recordatorio')
    expect(pushEventos).toEqual([
      {
        lead_id: 'l-50',
        tipo: 'push_recordatorio',
        actor_id: null,
        payload: { paso: 'recordatorio_r3' },
      },
    ])
  })

  it('cron caído (50 min sin pasos): registra r1-r3 de recordatorio + r1 de abierto, pero UN push por destinatario', async () => {
    const { supabase, pasosInsertados } = fakeDb({
      leads: [lead(50)],
      asesoresActivos: ['asesor-1', 'asesor-2', 'asesor-3'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    const pasos = pasosInsertados.map((p) => p.paso)
    expect(pasos).toEqual(['recordatorio_r1', 'recordatorio_r2', 'recordatorio_r3', 'abierto_r1'])
    expect(r.errores).toEqual([])
    // digest: el responsable recibe SU recordatorio (1 push) + el abierto (1 push como activo)
    expect(pushesDe('asesor-1')).toHaveLength(2)
    // los demás activos: solo el abierto
    expect(pushesDe('asesor-2')).toHaveLength(1)
    expect(pushesDe('asesor-2')[0][2].titulo).toContain('disponible')
  })

  it('corrida siguiente sin rondas nuevas: cero pushes (idempotencia del digest)', async () => {
    const { supabase, eventosInsertados } = fakeDb({
      leads: [lead(50)],
      pasosPrevios: ['l-50:recordatorio_r1', 'l-50:recordatorio_r2', 'l-50:recordatorio_r3', 'l-50:abierto_r1'],
      asesoresActivos: ['asesor-1', 'asesor-2'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual([])
    expect(enviarPushMock).not.toHaveBeenCalled()
    expect(crearNotificacionMock).not.toHaveBeenCalled()
    // Sin rondas nuevas tampoco hay eventos: at-most-once por ronda.
    expect(eventosInsertados).toEqual([])
  })

  it('después del umbral del dueño NO hay más rondas: a los 130 min las rondas paran en <120 y dispara dueno_120', async () => {
    const { supabase, pasosInsertados } = fakeDb({ leads: [lead(130)], asesoresActivos: ['asesor-2'] })
    await procesarEscalamientos(supabase, AHORA)

    const pasos = pasosInsertados.map((p) => p.paso)
    // recordatorios cada 15 con umbral < 120: r1..r7 (15..105)
    expect(pasos.filter((p) => p.startsWith('recordatorio_r'))).toHaveLength(7)
    expect(pasos).not.toContain('recordatorio_r8')
    // abiertos cada 30 con umbral < 120: r1..r3 (30..90)
    expect(pasos.filter((p) => p.startsWith('abierto_r'))).toHaveLength(3)
    expect(pasos).not.toContain('abierto_r4')
    expect(pasos).toContain('dueno_120')
    expect(enviarCorreoMock).toHaveBeenCalledWith(expect.objectContaining({ para: 'dueno@klo-ser.com' }))
    expect(pushesDe('dueno-1')[0][2].titulo).toBe('Lead sin atender 2 horas')
  })

  it('lead que ya pasó el umbral en corridas anteriores: silencio total (vive en el panel)', async () => {
    const previos = [
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => `l-130:recordatorio_r${k}`),
      ...[1, 2, 3].map((k) => `l-130:abierto_r${k}`),
      'l-130:dueno_120',
    ]
    const { supabase } = fakeDb({ leads: [lead(130)], pasosPrevios: previos, asesoresActivos: ['asesor-2'] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.pasosEjecutados).toEqual([])
    expect(enviarPushMock).not.toHaveBeenCalled()
    expect(enviarCorreoMock).not.toHaveBeenCalled()
  })

  it('dos leads del mismo asesor: UN push digest que lista ambos, el más viejo primero', async () => {
    const { supabase } = fakeDb({ leads: [lead(20, { id: 'l-a', nombre: 'Ana' }), lead(45, { id: 'l-b', nombre: 'Beto' })], asesoresActivos: [] })
    await procesarEscalamientos(supabase, AHORA)

    const propios = pushesDe('asesor-1').filter((c) => c[2].titulo.includes('sin contestar'))
    expect(propios).toHaveLength(1)
    expect(propios[0][2].cuerpo).toContain('Beto (45 min), Ana (20 min)')
    expect(propios[0][2].titulo).toBe('2 leads sin contestar')
  })

  it('VIP: un único recordatorio al dueño aunque lleve 3 horas; sin rondas ni correo', async () => {
    esLeadVipMock.mockResolvedValue(true)
    const { supabase, pasosInsertados, eventosInsertados } = fakeDb({
      leads: [lead(180, { asesor_id: 'dueno-1' })],
      asesoresActivos: ['asesor-2'],
    })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(pasosInsertados).toEqual([{ lead_id: 'l-180', paso: 'recordatorio_vip' }])
    expect(r.procesados).toBe(1)
    expect(enviarCorreoMock).not.toHaveBeenCalled()
    expect(pushesDe('dueno-1')[0][2].titulo).toBe('Lead VIP sin contestar')
    expect(eventosInsertados).toEqual([
      {
        lead_id: 'l-180',
        tipo: 'escalamiento_paso',
        actor_id: null,
        payload: { paso: 'recordatorio_vip' },
      },
      {
        lead_id: 'l-180',
        tipo: 'push_recordatorio',
        actor_id: null,
        payload: { paso: 'recordatorio_vip' },
      },
    ])
  })

  it('seguimiento manual posterior a la asignación → no escala nada', async () => {
    const { supabase, pasosInsertados } = fakeDb({ leads: [lead(50)], conRespuestaManual: ['l-50'] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(pasosInsertados).toEqual([])
    expect(r.pasosEjecutados).toEqual([])
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('un lead con error no tumba la corrida: el digest de los demás sale', async () => {
    esLeadVipMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(false)
    const { supabase } = fakeDb({ leads: [lead(20, { id: 'l-roto' }), lead(25)] })
    const r = await procesarEscalamientos(supabase, AHORA)

    expect(r.errores).toEqual([expect.stringContaining('l-roto')])
    expect(r.procesados).toBe(1)
    expect(pushesDe('asesor-1')).toHaveLength(1)
  })
})
