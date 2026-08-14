// @vitest-environment node
/**
 * Tests de la captura de leads del sitio oficial (src/lib/leads/captura.ts):
 * validacion del payload crudo y orquestacion de capturarLeadSitio sobre la
 * tuberia del sync (que aqui se mockea — su comportamiento real ya lo cubren
 * guardias-sync.test.ts y easybroker-sync.integration.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const {
  contactRequestYaVistoMock,
  buscarLeadExistenteMock,
  registrarConsultaRepetidaMock,
  crearLeadNuevoMock,
} = vi.hoisted(() => ({
  contactRequestYaVistoMock: vi.fn(),
  buscarLeadExistenteMock: vi.fn(),
  registrarConsultaRepetidaMock: vi.fn().mockResolvedValue(undefined),
  crearLeadNuevoMock: vi.fn(),
}))

vi.mock('@/lib/easybroker/sync', () => ({
  contactRequestYaVisto: contactRequestYaVistoMock,
  buscarLeadExistente: buscarLeadExistenteMock,
  registrarConsultaRepetida: registrarConsultaRepetidaMock,
  crearLeadNuevo: crearLeadNuevoMock,
}))

import { capturarLeadSitio, validarSolicitudCaptura } from '@/lib/leads/captura'

const PROPIEDAD = { id: 'prop-1', titulo: 'Casa Cumbres', colonia: 'Cumbres', ciudad: 'Monterrey' }

/** Fake supabase: solo las tablas que capturarLeadSitio consulta directo. */
function crearSupabaseFake(opciones: { propiedad?: typeof PROPIEDAD | null } = {}) {
  const from = vi.fn((tabla: string) => {
    if (tabla === 'propiedades') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: opciones.propiedad ?? null, error: null })
            ),
          })),
        })),
      }
    }
    if (tabla === 'agencias') {
      return {
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 'ag-1' }, error: null })),
          })),
        })),
      }
    }
    throw new Error(`tabla inesperada en el fake: ${tabla}`)
  })
  return { from } as unknown as SupabaseClient
}

const SOLICITUD_BASE = {
  solicitud_id: 'abc-123',
  nombre: 'Ana Visitante',
  telefono: '81 1234-5678',
  email: 'ANA@Test.com',
  mensaje: 'Me interesa la casa',
  propiedad_easybroker_id: null,
  pagina: '/contacto',
}

describe('validarSolicitudCaptura', () => {
  it('rechaza cuerpos que no son objeto JSON', () => {
    for (const body of [null, 'texto', 42, ['lista']]) {
      const v = validarSolicitudCaptura(body)
      expect(v.ok).toBe(false)
    }
  })

  it('rechaza sin solicitud_id', () => {
    const v = validarSolicitudCaptura({ ...SOLICITUD_BASE, solicitud_id: '  ' })
    expect(v).toMatchObject({ ok: false, error: expect.stringContaining('solicitud_id') })
  })

  it('rechaza sin nombre', () => {
    const v = validarSolicitudCaptura({ ...SOLICITUD_BASE, nombre: undefined })
    expect(v).toMatchObject({ ok: false, error: expect.stringContaining('nombre') })
  })

  it('rechaza sin telefono NI email (lead incontactable)', () => {
    const v = validarSolicitudCaptura({ ...SOLICITUD_BASE, telefono: null, email: '' })
    expect(v).toMatchObject({ ok: false, error: expect.stringContaining('telefono o email') })
  })

  it('normaliza: telefono a 52XXXXXXXXXX y email a minusculas', () => {
    const v = validarSolicitudCaptura(SOLICITUD_BASE)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.solicitud.telefono).toBe('528112345678')
    expect(v.solicitud.email).toBe('ana@test.com')
    expect(v.solicitud.nombre).toBe('Ana Visitante')
  })

  it('acepta solo telefono o solo email', () => {
    expect(validarSolicitudCaptura({ ...SOLICITUD_BASE, email: null }).ok).toBe(true)
    expect(validarSolicitudCaptura({ ...SOLICITUD_BASE, telefono: null }).ok).toBe(true)
  })
})

function solicitudValidada(extra: Record<string, unknown> = {}) {
  const v = validarSolicitudCaptura({ ...SOLICITUD_BASE, ...extra })
  if (!v.ok) throw new Error(`la solicitud base deberia ser valida: ${v.error}`)
  return v.solicitud
}

describe('capturarLeadSitio', () => {
  beforeEach(() => {
    contactRequestYaVistoMock.mockReset().mockResolvedValue(false)
    buscarLeadExistenteMock.mockReset().mockResolvedValue(null)
    registrarConsultaRepetidaMock.mockReset().mockResolvedValue(undefined)
    crearLeadNuevoMock.mockReset().mockResolvedValue(true)
  })

  it('solicitud_id ya procesado -> duplicado, sin tocar nada mas', async () => {
    contactRequestYaVistoMock.mockResolvedValue(true)
    const resultado = await capturarLeadSitio(crearSupabaseFake(), solicitudValidada())
    expect(resultado).toBe('duplicado')
    expect(contactRequestYaVistoMock).toHaveBeenCalledWith(expect.anything(), 'sitio:abc-123')
    expect(buscarLeadExistenteMock).not.toHaveBeenCalled()
    expect(crearLeadNuevoMock).not.toHaveBeenCalled()
  })

  it('telefono/email de un lead vivo -> reingreso via registrarConsultaRepetida', async () => {
    const existente = { id: 'lead-9', nombre: 'Ana', asesor_id: 'as-1', creado_en: '2026-08-01' }
    buscarLeadExistenteMock.mockResolvedValue(existente)

    const resultado = await capturarLeadSitio(crearSupabaseFake(), solicitudValidada())

    expect(resultado).toBe('reingreso')
    expect(registrarConsultaRepetidaMock).toHaveBeenCalledWith(
      expect.anything(),
      existente,
      expect.objectContaining({
        easybroker_id: 'sitio:abc-123',
        fuente: 'sitio',
        fuente_detalle: 'sitio Montana (/contacto)',
      }),
      null
    )
    expect(crearLeadNuevoMock).not.toHaveBeenCalled()
  })

  it('lead nuevo -> crearLeadNuevo con la agencia, fuente sitio y clasificacion null', async () => {
    const resultado = await capturarLeadSitio(crearSupabaseFake(), solicitudValidada())

    expect(resultado).toBe('nuevo')
    expect(crearLeadNuevoMock).toHaveBeenCalledWith(
      expect.anything(),
      'ag-1',
      expect.objectContaining({
        easybroker_id: 'sitio:abc-123',
        nombre: 'Ana Visitante',
        telefono: '528112345678',
        email: 'ana@test.com',
        fuente: 'sitio',
        mensaje_original: 'Me interesa la casa',
        contacto_eb_id: null,
      }),
      null, // propiedad no referida
      null // clasificacion_eb: semantica exclusiva de EasyBroker
    )
  })

  it('con propiedad_easybroker_id resuelve la propiedad local y la pasa', async () => {
    const supabase = crearSupabaseFake({ propiedad: PROPIEDAD })
    const solicitud = solicitudValidada({ propiedad_easybroker_id: 'EB-123' })

    await capturarLeadSitio(supabase, solicitud)

    expect(crearLeadNuevoMock).toHaveBeenCalledWith(
      expect.anything(),
      'ag-1',
      expect.objectContaining({ propiedad_eb_id: 'EB-123' }),
      PROPIEDAD,
      null
    )
  })

  it('sin pagina, fuente_detalle queda "sitio Montana" a secas', async () => {
    await capturarLeadSitio(crearSupabaseFake(), solicitudValidada({ pagina: undefined }))
    expect(crearLeadNuevoMock).toHaveBeenCalledWith(
      expect.anything(),
      'ag-1',
      expect.objectContaining({ fuente_detalle: 'sitio Montana' }),
      null,
      null
    )
  })

  it('carrera perdida en el insert (crearLeadNuevo false) -> duplicado', async () => {
    crearLeadNuevoMock.mockResolvedValue(false)
    const resultado = await capturarLeadSitio(crearSupabaseFake(), solicitudValidada())
    expect(resultado).toBe('duplicado')
  })
})
