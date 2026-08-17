// @vitest-environment node
/**
 * Tests de las fases del orquestador (opciones.soloLeads): el poll rapido de
 * cada minuto SOLO debe pegarle a /v1/contact_requests; el sync completo
 * recorre las tres fases. Supabase se finge con paginas vacias — aqui se
 * prueba QUE fases corren, no su contenido (eso lo cubre la integracion).
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// sync.ts importa push/enviar, que trae 'server-only' (revienta bajo vitest).
// Aqui no se ejercita ninguna notificacion (paginas vacias): mock inerte.
vi.mock('@/lib/push/enviar', () => ({
  enviarPush: vi.fn().mockResolvedValue({ enviados: 0 }),
}))

import { sincronizarEasyBroker } from '@/lib/easybroker/sync'

/**
 * Fake minimo de supabase para el camino "sin datos": lease siempre libre,
 * cursores vacios, agencia unica. Todas las cadenas del builder terminan en
 * un thenable exitoso.
 */
function crearSupabaseFake() {
  function tablaFake(tabla: string) {
    let conSelect = false
    const q: Record<string, unknown> = {}
    const encadena = () => q
    q.update = encadena
    q.eq = encadena
    q.or = encadena
    q.range = encadena
    q.limit = encadena
    q.order = encadena
    q.select = () => {
      conSelect = true
      return q
    }
    q.upsert = () => Promise.resolve({ error: null })
    q.maybeSingle = () => Promise.resolve({ data: null, error: null })
    q.single = () =>
      Promise.resolve(
        tabla === 'agencias'
          ? { data: { id: 'ag-1' }, error: null }
          : { data: null, error: { message: `single inesperado en ${tabla}` } }
      )
    // adquirirLease termina en .select() sobre el update: devolver una fila
    // significa "lease adquirido". El resto de cadenas awaited directo
    // (liberarLease, reconciliacion con data vacia) resuelven sin error.
    q.then = (resolver: (v: unknown) => unknown) =>
      Promise.resolve(
        tabla === 'sync_estado' && conSelect
          ? { data: [{ recurso: 'lock' }], error: null }
          : { data: [], error: null }
      ).then(resolver)
    return q
  }
  return { from: vi.fn((tabla: string) => tablaFake(tabla)) } as unknown as SupabaseClient
}

function crearObtenerPagina() {
  const rutas: string[] = []
  const obtenerPagina = vi.fn(async (path: string) => {
    rutas.push(path)
    return {
      pagination: { limit: 50, page: 1, total: 0, next_page: null },
      content: [],
    }
  })
  return { rutas, obtenerPagina }
}

describe('sincronizarEasyBroker: fases', () => {
  it('sin opciones corre las tres fases (properties, contact_requests, listing_statuses)', async () => {
    const { rutas, obtenerPagina } = crearObtenerPagina()
    const resultado = await sincronizarEasyBroker(crearSupabaseFake(), { obtenerPagina })

    expect(resultado.omitido).toBe(false)
    expect(resultado.errores).toEqual([])
    expect(rutas).toContain('/v1/properties')
    expect(rutas).toContain('/v1/contact_requests')
    expect(rutas).toContain('/v1/listing_statuses')
  })

  it('soloLeads: true SOLO pega a /v1/contact_requests', async () => {
    const { rutas, obtenerPagina } = crearObtenerPagina()
    const resultado = await sincronizarEasyBroker(
      crearSupabaseFake(),
      { obtenerPagina },
      { soloLeads: true }
    )

    expect(resultado.omitido).toBe(false)
    expect(resultado.errores).toEqual([])
    expect(rutas).toEqual(['/v1/contact_requests'])
  })

  it('soloPropiedades: true SOLO pega a /v1/properties (sin leads ni listing_statuses)', async () => {
    const { rutas, obtenerPagina } = crearObtenerPagina()
    const resultado = await sincronizarEasyBroker(
      crearSupabaseFake(),
      { obtenerPagina },
      { soloPropiedades: true }
    )

    expect(resultado.omitido).toBe(false)
    expect(resultado.errores).toEqual([])
    expect(rutas).toEqual(['/v1/properties'])
    // El barrido con la tabla vacia no refresca nada (y no truena).
    expect(resultado.propiedades.refrescadas).toBe(0)
  })
})
