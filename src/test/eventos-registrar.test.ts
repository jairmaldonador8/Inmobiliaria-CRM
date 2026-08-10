// @vitest-environment node
/**
 * Tests TDD para src/lib/eventos/registrar.ts: helper best-effort que anota
 * eventos en lead_eventos. Cliente por DI (mismo estilo que
 * src/test/dashboard-consultas.test.ts): stub chainable, sin mockear módulos.
 *
 * Semántica clave: la acción principal NUNCA falla por no poder anotar el
 * evento — si el insert devuelve error, se loguea con console.error y la
 * promesa resuelve igual.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { registrarEvento } from '@/lib/eventos/registrar'

interface ErrorFake {
  message: string
}

/** Stub para lead_eventos: from().insert() resuelve { error }. */
function crearSupabaseEventosFake(error: ErrorFake | null = null) {
  const insert = vi.fn().mockResolvedValue({ error })
  const from = vi.fn(() => ({ insert }))
  return { supabase: { from } as unknown as SupabaseClient, from, insert }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registrarEvento', () => {
  it('inserta la fila correcta en lead_eventos', async () => {
    const { supabase, from, insert } = crearSupabaseEventosFake()

    await registrarEvento(supabase, 'lead-1', 'seguimiento_registrado', { tipo: 'llamada' }, 'user-9')

    expect(from).toHaveBeenCalledWith('lead_eventos')
    expect(insert).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      tipo: 'seguimiento_registrado',
      actor_id: 'user-9',
      payload: { tipo: 'llamada' },
    })
  })

  it('sin payload ni actor, inserta payload vacío y actor_id null (sistema)', async () => {
    const { supabase, insert } = crearSupabaseEventosFake()

    await registrarEvento(supabase, 'lead-2', 'tomado_de_bandeja')

    expect(insert).toHaveBeenCalledWith({
      lead_id: 'lead-2',
      tipo: 'tomado_de_bandeja',
      actor_id: null,
      payload: {},
    })
  })

  it('si el insert devuelve error, NO lanza y loguea con console.error', async () => {
    const { supabase } = crearSupabaseEventosFake({ message: 'boom' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      registrarEvento(supabase, 'lead-3', 'whatsapp_enviado', { contacto_id: 'c1' }, 'user-9')
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0].join(' ')).toContain('whatsapp_enviado')
    expect(consoleError.mock.calls[0].join(' ')).toContain('boom')
  })
})
