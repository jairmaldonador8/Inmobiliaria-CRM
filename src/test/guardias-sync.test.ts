// @vitest-environment node
/**
 * Tests TDD de crearLeadNuevo (src/lib/easybroker/sync.ts) — la integración
 * del resolutor de guardias al sync. El contrato clave: el sync JAMÁS pierde
 * un lead por las guardias (resolutor falla → bandeja + alerta admin).
 *
 * Se mockean resolutor, notificaciones y push; el fake de supabase captura
 * los inserts de leads/seguimientos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { resolverAsignacionMock, crearNotificacionMock, notificarAdminsMock, enviarPushMock } =
  vi.hoisted(() => ({
    resolverAsignacionMock: vi.fn(),
    crearNotificacionMock: vi.fn().mockResolvedValue(undefined),
    notificarAdminsMock: vi.fn().mockResolvedValue(undefined),
    enviarPushMock: vi.fn().mockResolvedValue({ enviados: 1 }),
  }))

vi.mock('@/lib/guardias/resolutor', () => ({
  resolverAsignacion: resolverAsignacionMock,
}))
vi.mock('@/lib/notificaciones/crear', () => ({
  crearNotificacion: crearNotificacionMock,
  notificarAdmins: notificarAdminsMock,
}))
vi.mock('@/lib/push/enviar', () => ({
  enviarPush: enviarPushMock,
}))

import { crearLeadNuevo } from '@/lib/easybroker/sync'
import type { mapearContactRequest } from '@/lib/easybroker/mapeo'
import { CONFIG_DEFAULTS } from '@/lib/guardias/consultas'

const AHORA = new Date('2026-08-10T16:00:00Z')

const FILA = {
  easybroker_id: 'cr-1',
  nombre: 'Ana Cliente',
  telefono: '528112345678',
  email: 'ana@test.com',
  fuente: 'easybroker',
  fuente_detalle: 'Pincali',
  propiedad_eb_id: 'EB-123',
  mensaje_original: 'Me interesa',
  creado_en: '2026-08-10T15:59:00.000Z',
} as unknown as ReturnType<typeof mapearContactRequest>

const PROPIEDAD = { id: 'prop-1', titulo: 'Casa Cumbres', colonia: 'Cumbres', ciudad: 'Monterrey' }

const decision = (d: Record<string, unknown>) =>
  resolverAsignacionMock.mockResolvedValue({ decision: d, config: CONFIG_DEFAULTS })

/** Fake supabase: captura inserts y responde a select de usuarios. */
function crearSupabaseFake(opciones: { errorInsertLead?: { code: string; message: string } } = {}) {
  const insertsLeads: Record<string, unknown>[] = []
  const insertsSeguimientos: Record<string, unknown>[] = []

  const from = vi.fn((tabla: string) => {
    if (tabla === 'leads') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertsLeads.push(payload)
          return {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve(
                  opciones.errorInsertLead
                    ? { data: null, error: opciones.errorInsertLead }
                    : { data: { id: 'lead-1' }, error: null }
                )
              ),
            })),
          }
        }),
      }
    }
    if (tabla === 'seguimientos') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertsSeguimientos.push(payload)
          return Promise.resolve({ error: null })
        }),
      }
    }
    if (tabla === 'usuarios') {
      const consulta = {
        select: vi.fn(() => consulta),
        eq: vi.fn(() => consulta),
        maybeSingle: vi.fn(() => Promise.resolve({ data: { nombre: 'Caro Asesora' }, error: null })),
      }
      return consulta
    }
    throw new Error(`tabla inesperada: ${tabla}`)
  })

  return { supabase: { from } as unknown as SupabaseClient, insertsLeads, insertsSeguimientos }
}

beforeEach(() => {
  resolverAsignacionMock.mockReset()
  crearNotificacionMock.mockClear()
  notificarAdminsMock.mockClear()
  enviarPushMock.mockClear()
})

describe('crearLeadNuevo con guardias', () => {
  it('guardia activa: inserta asignado con reloj y notifica al asesor (campanita + push)', async () => {
    decision({ tipo: 'guardia_activa', asesorId: 'asesor-1', escalamientoDesde: AHORA.toISOString() })
    const { supabase, insertsLeads, insertsSeguimientos } = crearSupabaseFake()

    const creado = await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, 'cliente_directo', AHORA)

    expect(creado).toBe(true)
    expect(insertsLeads[0]).toMatchObject({
      asesor_id: 'asesor-1',
      asignado_en: AHORA.toISOString(),
      escalamiento_desde: AHORA.toISOString(),
    })
    expect(insertsSeguimientos[0]).toMatchObject({ tipo: 'sistema', autor_id: null })
    expect(String(insertsSeguimientos[0].nota)).toContain('por guardia')
    expect(crearNotificacionMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ destinatarioId: 'asesor-1', url: '/asesor/leads/lead-1' })
    )
    expect(enviarPushMock).toHaveBeenCalledWith(
      supabase,
      'asesor-1',
      expect.objectContaining({ url: '/asesor/leads/lead-1' })
    )
    expect(notificarAdminsMock).not.toHaveBeenCalled()
  })

  it('fuera de horario: asigna con reloj diferido, campanita SIN push (no despertar a las 3am) y aviso a admins', async () => {
    decision({ tipo: 'guardia_futura', asesorId: 'asesor-2', escalamientoDesde: '2026-08-10T21:00:00.000Z' })
    const { supabase, insertsLeads } = crearSupabaseFake()

    await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, null, AHORA)

    expect(insertsLeads[0]).toMatchObject({
      asesor_id: 'asesor-2',
      escalamiento_desde: '2026-08-10T21:00:00.000Z',
    })
    // campanita in-app sí; push NO — su primer push llega al abrir su turno
    expect(crearNotificacionMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ destinatarioId: 'asesor-2' })
    )
    expect(enviarPushMock).not.toHaveBeenCalled()
    expect(notificarAdminsMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ texto: expect.stringContaining('fuera de horario') })
    )
  })

  it('VIP: directo al dueño con push «Lead VIP» y deep-link admin; sin aviso extra', async () => {
    decision({ tipo: 'vip', asesorId: 'dueno-1', escalamientoDesde: AHORA.toISOString(), fueraDeHorario: false })
    const { supabase, insertsLeads } = crearSupabaseFake()

    await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, null, AHORA)

    expect(insertsLeads[0]).toMatchObject({ asesor_id: 'dueno-1' })
    expect(enviarPushMock).toHaveBeenCalledWith(
      supabase,
      'dueno-1',
      expect.objectContaining({ titulo: 'Lead VIP', url: '/admin/leads/lead-1' })
    )
    expect(notificarAdminsMock).not.toHaveBeenCalled()
  })

  it('el resolutor LANZA → el lead cae a bandeja con alerta a admins (jamás se pierde)', async () => {
    resolverAsignacionMock.mockRejectedValue(new Error('se cayó la consulta'))
    const { supabase, insertsLeads, insertsSeguimientos } = crearSupabaseFake()

    const creado = await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, null, AHORA)

    expect(creado).toBe(true)
    expect(insertsLeads[0]).toMatchObject({
      asesor_id: null,
      asignado_en: null,
      escalamiento_desde: null,
    })
    expect(insertsSeguimientos).toHaveLength(0)
    expect(notificarAdminsMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ texto: expect.stringContaining('falló la asignación') })
    )
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('sin rol cargado (bandeja): notifica a admins que no hay guardias programadas', async () => {
    decision({ tipo: 'bandeja' })
    const { supabase, insertsLeads } = crearSupabaseFake()

    await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, null, AHORA)

    expect(insertsLeads[0]).toMatchObject({ asesor_id: null, escalamiento_desde: null })
    expect(notificarAdminsMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ texto: expect.stringContaining('no hay guardias programadas') })
    )
  })

  it('carrera 23505 → duplicado silencioso, sin notificaciones', async () => {
    decision({ tipo: 'guardia_activa', asesorId: 'asesor-1', escalamientoDesde: AHORA.toISOString() })
    const { supabase } = crearSupabaseFake({ errorInsertLead: { code: '23505', message: 'dup' } })

    const creado = await crearLeadNuevo(supabase, 'ag-1', FILA, PROPIEDAD, null, AHORA)

    expect(creado).toBe(false)
    expect(crearNotificacionMock).not.toHaveBeenCalled()
    expect(enviarPushMock).not.toHaveBeenCalled()
    expect(notificarAdminsMock).not.toHaveBeenCalled()
  })
})
