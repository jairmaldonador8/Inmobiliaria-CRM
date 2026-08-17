// @vitest-environment node
/**
 * Orden de la bandeja (pedido de Renata, Live test 2026-08-17): los leads
 * recién llegados van HASTA ARRIBA — creado_en descendente. Antes era
 * ascendente y el equipo lo reportó como «está al revés».
 */
import { describe, expect, it, vi } from 'vitest'

// consultas.ts importa 'server-only', que revienta fuera del bundler de
// Next — se mockea el paquete completo, igual que asesores-consultas.test.ts.
vi.mock('server-only', () => ({}))

const { fromMock, orderMock } = vi.hoisted(() => {
  const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
  const cadena = {
    select: vi.fn(() => cadena),
    is: vi.fn(() => cadena),
    eq: vi.fn(() => cadena),
    order: orderMock,
  }
  return { fromMock: vi.fn(() => cadena), orderMock }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

import { leadsBandeja } from '@/lib/leads/consultas'

describe('leadsBandeja', () => {
  it('ordena por creado_en DESCENDENTE: lo recién llegado hasta arriba', async () => {
    const leads = await leadsBandeja()

    expect(leads).toEqual([])
    expect(fromMock).toHaveBeenCalledWith('leads')
    expect(orderMock).toHaveBeenCalledWith('creado_en', { ascending: false })
  })
})
