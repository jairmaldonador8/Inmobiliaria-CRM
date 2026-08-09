// @vitest-environment node
/**
 * Tests del endpoint /api/cron/escalamiento: auth fail-closed con Bearer
 * (mismo contrato que easybroker-sync). El motor se mockea — aquí solo se
 * prueba la puerta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { procesarEscalamientosMock, createAdminClientMock } = vi.hoisted(() => ({
  procesarEscalamientosMock: vi.fn(),
  createAdminClientMock: vi.fn(() => ({ finge: 'admin-client' })),
}))

vi.mock('@/lib/guardias/escalamiento', () => ({
  procesarEscalamientos: procesarEscalamientosMock,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

import { GET } from '@/app/api/cron/escalamiento/route'

function peticion(auth?: string) {
  return new Request('http://localhost/api/cron/escalamiento', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('GET /api/cron/escalamiento', () => {
  beforeEach(() => {
    procesarEscalamientosMock.mockReset().mockResolvedValue({
      procesados: 2,
      pasosEjecutados: ['recordatorio_15:l-1'],
      errores: [],
    })
    process.env.CRON_SECRET_ESCALAMIENTO = 'secreto-test'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET_ESCALAMIENTO
  })

  it('sin Bearer → 401 y el motor NO corre', async () => {
    const res = await GET(peticion())
    expect(res.status).toBe(401)
    expect(procesarEscalamientosMock).not.toHaveBeenCalled()
  })

  it('Bearer incorrecto → 401', async () => {
    const res = await GET(peticion('Bearer otro'))
    expect(res.status).toBe(401)
  })

  it('sin env var configurada → 401 aunque manden algo (fail-closed)', async () => {
    delete process.env.CRON_SECRET_ESCALAMIENTO
    const res = await GET(peticion('Bearer undefined'))
    expect(res.status).toBe(401)
  })

  it('Bearer correcto → 200 con el resultado del motor', async () => {
    const res = await GET(peticion('Bearer secreto-test'))
    expect(res.status).toBe(200)
    const cuerpo = await res.json()
    expect(cuerpo).toMatchObject({ ok: true, procesados: 2 })
    expect(procesarEscalamientosMock).toHaveBeenCalledTimes(1)
  })

  it('errores del motor → ok: false pero 200 (el cron no reintenta)', async () => {
    procesarEscalamientosMock.mockResolvedValue({ procesados: 0, pasosEjecutados: [], errores: ['x'] })
    const res = await GET(peticion('Bearer secreto-test'))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(false)
  })
})
