// @vitest-environment node
/**
 * Tests del endpoint POST /api/leads/captura: auth fail-closed con Bearer
 * (mismo contrato que los crons) y traduccion de resultados a status HTTP.
 * La logica de captura se mockea — la cubre leads-captura.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { validarMock, capturarMock, createAdminClientMock } = vi.hoisted(() => ({
  validarMock: vi.fn(),
  capturarMock: vi.fn(),
  createAdminClientMock: vi.fn(() => ({ finge: 'admin-client' })),
}))

vi.mock('@/lib/leads/captura', () => ({
  validarSolicitudCaptura: validarMock,
  capturarLeadSitio: capturarMock,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

import { POST } from '@/app/api/leads/captura/route'

const SOLICITUD = {
  solicitud_id: 'abc',
  nombre: 'Ana',
  telefono: '528112345678',
  email: null,
  mensaje: null,
  propiedad_easybroker_id: null,
  pagina: null,
}

function peticion(opciones: { auth?: string; body?: string } = {}) {
  return new Request('http://localhost/api/leads/captura', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opciones.auth ? { authorization: opciones.auth } : {}),
    },
    body: opciones.body ?? JSON.stringify({ solicitud_id: 'abc', nombre: 'Ana' }),
  })
}

describe('POST /api/leads/captura', () => {
  beforeEach(() => {
    validarMock.mockReset().mockReturnValue({ ok: true, solicitud: SOLICITUD })
    capturarMock.mockReset().mockResolvedValue('nuevo')
    process.env.LEADS_CAPTURA_SECRET = 'secreto-test'
  })

  afterEach(() => {
    delete process.env.LEADS_CAPTURA_SECRET
  })

  it('sin Bearer -> 401 y la captura NO corre', async () => {
    const res = await POST(peticion())
    expect(res.status).toBe(401)
    expect(capturarMock).not.toHaveBeenCalled()
  })

  it('Bearer incorrecto -> 401', async () => {
    const res = await POST(peticion({ auth: 'Bearer otro' }))
    expect(res.status).toBe(401)
  })

  it('sin env var configurada -> 401 aunque manden algo (fail-closed)', async () => {
    delete process.env.LEADS_CAPTURA_SECRET
    const res = await POST(peticion({ auth: 'Bearer undefined' }))
    expect(res.status).toBe(401)
  })

  it('cuerpo que no es JSON -> 400', async () => {
    const res = await POST(peticion({ auth: 'Bearer secreto-test', body: 'no soy json' }))
    expect(res.status).toBe(400)
    expect(capturarMock).not.toHaveBeenCalled()
  })

  it('payload invalido -> 400 con el error de validacion', async () => {
    validarMock.mockReturnValue({ ok: false, error: 'nombre es requerido' })
    const res = await POST(peticion({ auth: 'Bearer secreto-test' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ ok: false, error: 'nombre es requerido' })
  })

  it('lead nuevo -> 201 con el resultado', async () => {
    const res = await POST(peticion({ auth: 'Bearer secreto-test' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, resultado: 'nuevo' })
    expect(capturarMock).toHaveBeenCalledWith({ finge: 'admin-client' }, SOLICITUD)
  })

  it('reingreso y duplicado -> 200 (idempotente para el sitio)', async () => {
    for (const resultado of ['reingreso', 'duplicado'] as const) {
      capturarMock.mockResolvedValue(resultado)
      const res = await POST(peticion({ auth: 'Bearer secreto-test' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, resultado })
    }
  })

  it('la captura lanza -> 500 con mensaje generico (sin detalles internos)', async () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {})
    capturarMock.mockRejectedValue(new Error('insert de lead nuevo: conexion perdida'))
    const res = await POST(peticion({ auth: 'Bearer secreto-test' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'error interno' })
    silencio.mockRestore()
  })
})
