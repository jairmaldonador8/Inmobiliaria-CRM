// @vitest-environment node
/**
 * Tests TDD para src/lib/eventos/consultas.ts: la consulta del timeline
 * «Historia del lead» y el colapso del par tomado_de_bandeja/lead_asignado.
 *
 * Regla de colapso (corrección de revisores sobre el plan): NO se compara
 * por igualdad de actor — `tomarLead` corre con el cliente admin, así que el
 * `lead_asignado` del trigger llega con actor_id NULL mientras que
 * `tomado_de_bandeja` trae el uid del asesor. Se descarta un `lead_asignado`
 * cuando existe un `tomado_de_bandeja` del mismo lead dentro del mismo
 * minuto (con cross-check payload.a === actor del tomado cuando ambos
 * existen).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { colapsarEventos, eventosDeLead, type FilaEventoLead } from '@/lib/eventos/consultas'

function fila(parcial: Partial<FilaEventoLead> & { id: string; tipo: string }): FilaEventoLead {
  return {
    actor_id: null,
    payload: {},
    ocurrido_en: '2026-08-10T12:00:00.000Z',
    ...parcial,
  }
}

describe('colapsarEventos', () => {
  it('descarta el lead_asignado (actor NULL, del trigger) si hay un tomado_de_bandeja en el mismo minuto', () => {
    const eventos = [
      fila({
        id: 'e2',
        tipo: 'tomado_de_bandeja',
        actor_id: 'uid-ana',
        ocurrido_en: '2026-08-10T12:00:01.000Z',
      }),
      fila({
        id: 'e1',
        tipo: 'lead_asignado',
        actor_id: null, // tomarLead corre con cliente admin → auth.uid() null
        payload: { de: null, a: 'uid-ana' },
        ocurrido_en: '2026-08-10T12:00:00.500Z',
      }),
    ]

    const resultado = colapsarEventos(eventos)

    expect(resultado.map((e) => e.id)).toEqual(['e2'])
  })

  it('NO descarta un lead_asignado lejano en el tiempo (asignación manual del admin)', () => {
    const eventos = [
      fila({
        id: 'e2',
        tipo: 'tomado_de_bandeja',
        actor_id: 'uid-ana',
        ocurrido_en: '2026-08-10T12:00:00.000Z',
      }),
      fila({
        id: 'e1',
        tipo: 'lead_asignado',
        payload: { de: null, a: 'uid-ana' },
        ocurrido_en: '2026-08-10T11:30:00.000Z',
      }),
    ]

    const resultado = colapsarEventos(eventos)

    expect(resultado.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('NO descarta un lead_asignado hacia OTRO asesor aunque coincida el minuto (cross-check payload.a)', () => {
    const eventos = [
      fila({
        id: 'e2',
        tipo: 'tomado_de_bandeja',
        actor_id: 'uid-ana',
        ocurrido_en: '2026-08-10T12:00:01.000Z',
      }),
      fila({
        id: 'e1',
        tipo: 'lead_asignado',
        payload: { de: null, a: 'uid-luis' },
        ocurrido_en: '2026-08-10T12:00:00.000Z',
      }),
    ]

    const resultado = colapsarEventos(eventos)

    expect(resultado.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('sin tomado_de_bandeja no toca nada', () => {
    const eventos = [
      fila({ id: 'e1', tipo: 'lead_asignado', payload: { a: 'uid-ana' } }),
      fila({ id: 'e2', tipo: 'etapa_cambiada', payload: { de: 'nuevo', a: 'contactado' } }),
    ]

    expect(colapsarEventos(eventos)).toEqual(eventos)
  })

  it('los demás tipos pasan intactos aunque haya tomado_de_bandeja cerca', () => {
    const eventos = [
      fila({
        id: 'e2',
        tipo: 'tomado_de_bandeja',
        actor_id: 'uid-ana',
        ocurrido_en: '2026-08-10T12:00:01.000Z',
      }),
      fila({
        id: 'e1',
        tipo: 'etapa_cambiada',
        payload: { de: 'nuevo', a: 'contactado' },
        ocurrido_en: '2026-08-10T12:00:00.000Z',
      }),
    ]

    expect(colapsarEventos(eventos)).toHaveLength(2)
  })
})

/**
 * Stub de dos tablas: lead_eventos (select→eq→order→limit) y usuarios
 * (select→in). Mismo estilo DI que src/test/dashboard-consultas.test.ts.
 */
function crearSupabaseFake(
  eventos: FilaEventoLead[],
  usuarios: { user_id: string; nombre: string }[],
  error: { message: string } | null = null
) {
  const limit = vi.fn().mockResolvedValue({ data: eventos, error })
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const selectEventos = vi.fn(() => ({ eq }))
  const inUsuarios = vi.fn().mockResolvedValue({ data: usuarios, error: null })
  const selectUsuarios = vi.fn(() => ({ in: inUsuarios }))
  const from = vi.fn((tabla: string) =>
    tabla === 'lead_eventos' ? { select: selectEventos } : { select: selectUsuarios }
  )
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    selectEventos,
    eq,
    order,
    limit,
    selectUsuarios,
    inUsuarios,
  }
}

describe('eventosDeLead', () => {
  it('consulta los últimos 50 eventos del lead en orden descendente', async () => {
    const { supabase, from, selectEventos, eq, order, limit } = crearSupabaseFake([], [])

    await eventosDeLead(supabase, 'lead-1')

    expect(from).toHaveBeenCalledWith('lead_eventos')
    expect(selectEventos).toHaveBeenCalledWith('id, tipo, actor_id, payload, ocurrido_en')
    expect(eq).toHaveBeenCalledWith('lead_id', 'lead-1')
    expect(order).toHaveBeenCalledWith('ocurrido_en', { ascending: false })
    expect(limit).toHaveBeenCalledWith(50)
  })

  it('resuelve nombres de actor_id ∪ payload.a/de y arma etiqueta + actor_nombre', async () => {
    const eventos = [
      fila({
        id: 'e1',
        tipo: 'lead_asignado',
        actor_id: 'uid-admin',
        payload: { de: null, a: 'uid-ana' },
      }),
    ]
    const { supabase, inUsuarios } = crearSupabaseFake(eventos, [
      { user_id: 'uid-admin', nombre: 'Jair' },
      { user_id: 'uid-ana', nombre: 'Ana Pérez' },
    ])

    const resultado = await eventosDeLead(supabase, 'lead-1')

    const idsPedidos = inUsuarios.mock.calls[0][1] as string[]
    expect([...idsPedidos].sort()).toEqual(['uid-admin', 'uid-ana'])
    expect(resultado).toEqual([
      {
        id: 'e1',
        tipo: 'lead_asignado',
        etiqueta: 'Se asignó a Ana Pérez',
        actor_nombre: 'Jair',
        ocurrido_en: '2026-08-10T12:00:00.000Z',
      },
    ])
  })

  it('sin uuids que resolver NO consulta usuarios', async () => {
    const eventos = [fila({ id: 'e1', tipo: 'lead_archivado' })]
    const { supabase, from } = crearSupabaseFake(eventos, [])

    await eventosDeLead(supabase, 'lead-1')

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalledWith('usuarios')
  })

  it('actor sin nombre resuelto (RLS del asesor) queda como null → la UI pinta «Sistema»', async () => {
    const eventos = [
      fila({ id: 'e1', tipo: 'whatsapp_enviado', actor_id: 'uid-ajeno', payload: {} }),
    ]
    const { supabase } = crearSupabaseFake(eventos, [])

    const resultado = await eventosDeLead(supabase, 'lead-1')

    expect(resultado[0].actor_nombre).toBeNull()
    expect(resultado[0].etiqueta).toBe('Se le envió WhatsApp')
  })

  it('aplica el colapso tomado_de_bandeja/lead_asignado', async () => {
    const eventos = [
      fila({
        id: 'e2',
        tipo: 'tomado_de_bandeja',
        actor_id: 'uid-ana',
        ocurrido_en: '2026-08-10T12:00:01.000Z',
      }),
      fila({
        id: 'e1',
        tipo: 'lead_asignado',
        payload: { de: null, a: 'uid-ana' },
        ocurrido_en: '2026-08-10T12:00:00.000Z',
      }),
    ]
    const { supabase } = crearSupabaseFake(eventos, [{ user_id: 'uid-ana', nombre: 'Ana Pérez' }])

    const resultado = await eventosDeLead(supabase, 'lead-1')

    expect(resultado.map((e) => e.tipo)).toEqual(['tomado_de_bandeja'])
  })

  it('si la consulta falla, lanza', async () => {
    const { supabase } = crearSupabaseFake([], [], { message: 'boom' })

    await expect(eventosDeLead(supabase, 'lead-1')).rejects.toThrow('boom')
  })
})
