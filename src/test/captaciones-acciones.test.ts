// @vitest-environment node
/**
 * Tests de cargarCaptacionEB y regresarCaptacion (src/lib/captaciones/
 * acciones.ts): las puertas de estado, el score como candado, el manejo de
 * errores de EasyBroker y el payload que viaja. El resto de acciones del
 * asesor las cubre RLS (integración) + el motor de score (unitario).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  requireAdminMock,
  requireAsesorMock,
  createAdminClientMock,
  createClientMock,
  revalidatePathMock,
  crearNotificacionMock,
  notificarAdminsMock,
  enviarPushMock,
  ebPostMock,
  ebFetchMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  requireAsesorMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  crearNotificacionMock: vi.fn().mockResolvedValue(undefined),
  notificarAdminsMock: vi.fn().mockResolvedValue(undefined),
  enviarPushMock: vi.fn().mockResolvedValue({ enviados: 1 }),
  ebPostMock: vi.fn(),
  ebFetchMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/auth/usuario-actual', () => ({
  requireAdmin: requireAdminMock,
  requireAsesor: requireAsesorMock,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/notificaciones/crear', () => ({
  crearNotificacion: crearNotificacionMock,
  notificarAdmins: notificarAdminsMock,
}))
vi.mock('@/lib/push/enviar', () => ({ enviarPush: enviarPushMock }))
vi.mock('@/lib/easybroker/cliente', () => {
  class EasyBrokerError extends Error {
    readonly status: number
    readonly cuerpo: string
    constructor(status: number, cuerpo: string, url: string) {
      super(`EasyBroker respondió ${status} en ${url}`)
      this.name = 'EasyBrokerError'
      this.status = status
      this.cuerpo = cuerpo
    }
  }
  return { ebPost: ebPostMock, ebFetch: ebFetchMock, EasyBrokerError }
})

/** Árbol de /v1/locations con la ciudad y la colonia de la fila de prueba. */
const CIUDAD_EB = {
  type: 'City',
  name: 'San Pedro Garza García',
  full_name: 'San Pedro Garza García, Nuevo León',
  localities: [
    {
      type: 'Neighborhood',
      name: 'Del Valle',
      full_name: 'Del Valle, San Pedro Garza García, Nuevo León',
    },
    {
      type: 'Neighborhood',
      name: 'Balcones Del Valle',
      full_name: 'Balcones Del Valle, San Pedro Garza García, Nuevo León',
    },
  ],
}

import { cargarCaptacionEB, regresarCaptacion } from '@/lib/captaciones/acciones'
import { EasyBrokerError } from '@/lib/easybroker/cliente'

const ADMIN = { user_id: 'admin-1', nombre: 'Admin Montana', rol: 'admin' }

/** Fila publicable: pasa todos los bloqueantes del score. */
function captacionEnviada(extra: Record<string, unknown> = {}) {
  return {
    id: 'cap-1',
    agencia_id: 'ag-1',
    asesor_id: 'as-1',
    estado: 'enviada',
    titulo: 'Casa en venta en Del Valle, San Pedro Garza García',
    descripcion:
      'Residencia con sala de doble altura, cocina equipada, cuatro recámaras y jardín con ' +
      'terraza techada. Zona de colegios y parques, a minutos de Gómez Morín. Agenda tu visita.',
    tipo: 'Casa',
    operacion: 'sale',
    precio: 18500000,
    moneda: 'MXN',
    colonia: 'Del Valle',
    ciudad: 'San Pedro Garza García',
    entidad: 'Nuevo León',
    calle: 'Río Nazas',
    numero_exterior: '120',
    codigo_postal: '66220',
    lat: 25.6573,
    lng: -100.4023,
    mostrar_ubicacion_exacta: false,
    recamaras: 4,
    banos: 4,
    medios_banos: 1,
    estacionamientos: 3,
    antiguedad: 8,
    m2_construccion: 480,
    m2_terreno: 600,
    video_url: null,
    tour_url: null,
    fotos: Array.from({ length: 12 }, (_, i) => ({
      url: `https://cdn.test/f${i}.jpg`,
      path: `as-1/f${i}.jpg`,
    })),
    comentario_admin: null,
    easybroker_id: null,
    cargada_en: null,
    creado_en: '2026-08-14T00:00:00Z',
    actualizado_en: '2026-08-14T00:00:00Z',
    ...extra,
  }
}

/** Fake de admin client: captaciones (select/update) y usuarios (nombre). */
function crearAdminFake(fila: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []
  const from = vi.fn((tabla: string) => {
    if (tabla === 'captaciones') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: fila, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload)
          const cadena = {
            eq: vi.fn(() => cadena),
            select: vi.fn(() => cadena),
            then: (resolver: (v: unknown) => unknown) =>
              Promise.resolve({ data: [fila], error: null }).then(resolver),
          }
          return cadena
        }),
      }
    }
    if (tabla === 'usuarios') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { nombre: 'Jair Maldonado' }, error: null })),
          })),
        })),
      }
    }
    throw new Error(`tabla inesperada en el fake: ${tabla}`)
  })
  return { cliente: { from }, updates }
}

describe('cargarCaptacionEB', () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue(ADMIN)
    createAdminClientMock.mockReset()
    ebPostMock.mockReset().mockResolvedValue({ public_id: 'EB-NUEVA1' })
    ebFetchMock.mockReset().mockResolvedValue(CIUDAD_EB)
    crearNotificacionMock.mockClear()
    enviarPushMock.mockClear()
    revalidatePathMock.mockClear()
  })

  it('solo captaciones enviadas: un borrador no se carga', async () => {
    const { cliente } = crearAdminFake(captacionEnviada({ estado: 'borrador' }))
    createAdminClientMock.mockReturnValue(cliente)

    const resultado = await cargarCaptacionEB('cap-1', true)
    expect(resultado).toMatchObject({ error: expect.stringContaining('enviadas') })
    expect(ebPostMock).not.toHaveBeenCalled()
  })

  it('con bloqueantes pendientes (pocas fotos) NO llama a EasyBroker', async () => {
    const { cliente } = crearAdminFake(
      captacionEnviada({ fotos: [{ url: 'https://cdn.test/f0.jpg', path: 'as-1/f0.jpg' }] })
    )
    createAdminClientMock.mockReturnValue(cliente)

    const resultado = await cargarCaptacionEB('cap-1', true)
    expect(resultado).toMatchObject({ error: expect.stringContaining('requisito') })
    expect(ebPostMock).not.toHaveBeenCalled()
  })

  it('carga exitosa: payload con iniciales JM, status published, y la fila queda cargada', async () => {
    const { cliente, updates } = crearAdminFake(captacionEnviada())
    createAdminClientMock.mockReturnValue(cliente)

    const resultado = await cargarCaptacionEB('cap-1', true)

    expect(resultado).toEqual({ ok: true, id: 'cap-1' })
    expect(ebPostMock).toHaveBeenCalledWith(
      '/v1/properties',
      expect.objectContaining({
        status: 'published',
        property_type: 'Casa',
        description: expect.stringMatching(/\n\nJM$/),
        images: expect.arrayContaining([{ url: 'https://cdn.test/f0.jpg' }]),
        location: expect.objectContaining({
          // El full_name resuelto contra /v1/locations, no el armado a mano.
          name: 'Del Valle, San Pedro Garza García, Nuevo León',
        }),
      })
    )
    expect(updates[0]).toMatchObject({ estado: 'cargada', easybroker_id: 'EB-NUEVA1' })
    expect(enviarPushMock).toHaveBeenCalled()
  })

  it('colonia fuera del catálogo de EB → error con sugerencias y SIN POST', async () => {
    const { cliente } = crearAdminFake(captacionEnviada({ colonia: 'Valle' }))
    createAdminClientMock.mockReturnValue(cliente)

    const resultado = await cargarCaptacionEB('cap-1', true)
    expect(resultado).toMatchObject({ error: expect.stringContaining('catálogo') })
    expect((resultado as { error: string }).error).toContain('Del Valle')
    expect(ebPostMock).not.toHaveBeenCalled()
  })

  it('publicar=false viaja como not_published', async () => {
    const { cliente } = crearAdminFake(captacionEnviada())
    createAdminClientMock.mockReturnValue(cliente)

    await cargarCaptacionEB('cap-1', false)
    expect(ebPostMock).toHaveBeenCalledWith(
      '/v1/properties',
      expect.objectContaining({ status: 'not_published' })
    )
  })

  it('EasyBroker rechaza (422) → error legible y la fila NO se marca cargada', async () => {
    const { cliente, updates } = crearAdminFake(captacionEnviada())
    createAdminClientMock.mockReturnValue(cliente)
    ebPostMock.mockRejectedValue(new EasyBrokerError(422, '{"error":"location invalida"}', 'url'))

    const resultado = await cargarCaptacionEB('cap-1', true)
    expect(resultado).toMatchObject({ error: expect.stringContaining('422') })
    expect(updates).toHaveLength(0)
  })
})

describe('regresarCaptacion', () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue(ADMIN)
    createAdminClientMock.mockReset()
    crearNotificacionMock.mockClear()
    enviarPushMock.mockClear()
  })

  it('sin comentario → error (el asesor necesita saber qué corregir)', async () => {
    const resultado = await regresarCaptacion('cap-1', '   ')
    expect(resultado).toMatchObject({ error: expect.stringContaining('corregir') })
  })

  it('regresa con comentario y notifica al asesor (campanita + push)', async () => {
    const filas = [{ id: 'cap-1', titulo: 'Casa Del Valle', asesor_id: 'as-1' }]
    const cadena = {
      eq: vi.fn(() => cadena),
      select: vi.fn(() => Promise.resolve({ data: filas, error: null })),
    }
    const cliente = {
      from: vi.fn(() => ({ update: vi.fn(() => cadena) })),
    }
    createAdminClientMock.mockReturnValue(cliente)

    const resultado = await regresarCaptacion('cap-1', 'Faltan fotos de la cocina')
    expect(resultado).toEqual({ ok: true, id: 'cap-1' })
    expect(crearNotificacionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ destinatarioId: 'as-1', tipo: 'captacion_regresada' })
    )
    expect(enviarPushMock).toHaveBeenCalled()
  })
})
