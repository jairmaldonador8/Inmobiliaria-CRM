// @vitest-environment node
/**
 * Tests TDD para el mapeo de payloads de EasyBroker a filas de nuestro
 * esquema (propiedades / leads). Los fixtures son respuestas REALES del
 * sandbox de staging (api.stagingeb.com) capturadas con curl.
 */
import { describe, expect, it } from 'vitest'
import { config } from 'dotenv'
import path from 'node:path'

// Cargar .env.local ANTES de la colección de tests para que skipIf vea la key
config({ path: path.resolve(__dirname, '../../.env.local') })

import {
  mapearPropiedadLista,
  mapearPropiedadDetalle,
  mapearContactRequest,
  estatusEsActivo,
  type PropiedadListaEB,
  type PropiedadDetalleEB,
  type ContactRequestEB,
} from '@/lib/easybroker/mapeo'

import propertiesList from './fixtures/easybroker/properties-list.json'
import propertyDetail from './fixtures/easybroker/property-detail.json'
import contactRequests from './fixtures/easybroker/contact-requests.json'

const listaContent = propertiesList.content as unknown as PropiedadListaEB[]
const detalle = propertyDetail as unknown as PropiedadDetalleEB
const crContent = contactRequests.content as unknown as ContactRequestEB[]

describe('mapearPropiedadLista', () => {
  it('mapea la primera propiedad real del fixture (EB-C6349, renta)', () => {
    const row = mapearPropiedadLista(listaContent[0])
    expect(row).toMatchObject({
      easybroker_id: 'EB-C6349',
      titulo: 'DEPARTAMENTO EN RENTA EN EL AGUACATAL EN VALLE PONIENTE',
      tipo: 'Departamento',
      operacion: 'rental',
      precio: 33200.0,
      moneda: 'MXN',
      ubicacion: 'El Aguacatal, Santa Catarina, Nuevo León',
      superficie_construccion: 113.0,
      superficie_terreno: null,
      recamaras: 2,
      banos: null,
      estacionamientos: 1,
    })
    // -06:00 → UTC (instante exacto)
    expect(row.actualizada_eb).toBe('2024-08-13T05:36:39.000Z')
    // Foto de portada en el array de fotos
    expect(row.fotos).toEqual([
      'https://assets.stagingeb.com/property_images/36349/126557/EB-C6349.jpg?version=1611968228',
    ])
  })

  it('mapea una propiedad en venta (EB-C6351) con lot_size', () => {
    const row = mapearPropiedadLista(listaContent[2])
    expect(row.easybroker_id).toBe('EB-C6351')
    expect(row.operacion).toBe('sale')
    expect(row.precio).toBe(30850000.0)
    expect(row.superficie_terreno).toBe(590.0)
    expect(row.superficie_construccion).toBe(610.0)
  })

  it('tolera operations[] vacío (sin operacion/precio, moneda por defecto MXN)', () => {
    const item: PropiedadListaEB = { ...listaContent[0], operations: [] }
    const row = mapearPropiedadLista(item)
    expect(row.operacion).toBeNull()
    expect(row.precio).toBeNull()
    expect(row.moneda).toBe('MXN')
  })

  it('tolera construction_size y title_image_full ausentes', () => {
    const item: PropiedadListaEB = {
      ...listaContent[0],
      construction_size: null,
      title_image_full: null,
    }
    const row = mapearPropiedadLista(item)
    expect(row.superficie_construccion).toBeNull()
    expect(row.fotos).toEqual([])
  })
})

describe('mapearPropiedadDetalle', () => {
  it('agrega descripcion, colonia/ciudad, coordenadas, url_publica y fotos completas', () => {
    const extra = mapearPropiedadDetalle(detalle)
    expect(extra.descripcion).toContain('Departamento amueblado en renta')
    // "El Aguacatal, Santa Catarina, Nuevo León" → colonia / ciudad
    expect(extra.colonia).toBe('El Aguacatal')
    expect(extra.ciudad).toBe('Santa Catarina')
    // En este fixture real las coordenadas vienen null
    expect(extra.lat).toBeNull()
    expect(extra.lng).toBeNull()
    expect(extra.url_publica).toBe(
      'https://www.stagingeb.com/mx/listings/departamento-en-renta-en-el-aguacatal-en-valle-poniente-c12f782d-fb33-49ed-ba25-f3f8f5c8e3de'
    )
    // images[] (11 fotos), NO el campo deprecado property_images
    expect(extra.fotos).toHaveLength(11)
    expect(extra.fotos[0]).toBe(
      'https://assets.stagingeb.com/property_images/36349/126557/EB-C6349.jpg?version=1611968228'
    )
  })

  it('usa las coordenadas cuando existen y tolera location.name corto', () => {
    const conCoords: PropiedadDetalleEB = {
      ...detalle,
      location: {
        ...detalle.location,
        name: 'Monterrey, Nuevo León',
        latitude: 25.6866,
        longitude: -100.3161,
      },
    }
    const extra = mapearPropiedadDetalle(conCoords)
    expect(extra.lat).toBe(25.6866)
    expect(extra.lng).toBe(-100.3161)
    // Con solo 2 partes no hay colonia; la primera parte es la ciudad
    expect(extra.colonia).toBeNull()
    expect(extra.ciudad).toBe('Monterrey')
  })
})

describe('mapearContactRequest', () => {
  it('mapea un contact request real del fixture (id 37779)', () => {
    const row = mapearContactRequest(crContent[0])
    expect(row).toMatchObject({
      easybroker_id: '37779',
      nombre: 'Elizabeth',
      email: 't@a.com',
      fuente: 'portal',
      fuente_detalle: 'probe',
      propiedad_eb_id: 'EB-C0135',
      mensaje_original: 'test',
    })
    // "55555555555" → últimos 10 dígitos + prefijo 52
    expect(row.telefono).toBe('525555555555')
    // happened_at -06:00 → UTC (instante exacto)
    expect(row.creado_en).toBe('2026-07-15T22:55:42.000Z')
  })

  it('normaliza teléfonos con formato internacional (+52...)', () => {
    const row = mapearContactRequest(crContent[2])
    // "+5288229911003399" → dígitos "5288229911003399" → últimos 10 → 52 + "9911003399"
    expect(row.telefono).toBe('529911003399')
    expect(row.creado_en).toBe('2026-07-14T18:42:23.000Z')
  })

  it('normaliza un teléfono típico de 10 dígitos al formato 52XXXXXXXXXX', () => {
    const cr: ContactRequestEB = { ...crContent[0], phone: '(55) 1234-5678 ext' }
    // dígitos: 5512345678 → 52 + 5512345678
    expect(mapearContactRequest(cr).telefono).toBe('525512345678')
  })

  it('normaliza el email a minúsculas (el dedup del sync compara igualdad exacta)', () => {
    const cr: ContactRequestEB = { ...crContent[0], email: '  Elizabeth.Test@Gmail.COM ' }
    expect(mapearContactRequest(cr).email).toBe('elizabeth.test@gmail.com')
  })

  it('tolera phone y email null', () => {
    const cr: ContactRequestEB = { ...crContent[0], phone: null, email: null }
    const row = mapearContactRequest(cr)
    expect(row.telefono).toBeNull()
    expect(row.email).toBeNull()
  })

  it('devuelve null si el teléfono no tiene dígitos', () => {
    const cr: ContactRequestEB = { ...crContent[0], phone: 'sin numero' }
    expect(mapearContactRequest(cr).telefono).toBeNull()
  })
})

describe('estatusEsActivo', () => {
  it('solo published cuenta como activa', () => {
    expect(estatusEsActivo('published')).toBe(true)
  })

  it('reserved, sold, rented, suspended y not_published NO cuentan como activa', () => {
    for (const estatus of ['reserved', 'sold', 'rented', 'suspended', 'not_published']) {
      expect(estatusEsActivo(estatus)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Integración (staging real): se omite si no hay EASYBROKER_API_KEY
// ---------------------------------------------------------------------------
describe('integración: sandbox de staging de EasyBroker', () => {
  it.skipIf(!process.env.EASYBROKER_API_KEY)(
    'obtiene 1 página real de propiedades y el mapeo no truena',
    async () => {
      const { ebFetch } = await import('@/lib/easybroker/cliente')
      const pagina = await ebFetch<{
        pagination: { limit: number; page: number; total: number; next_page: string | null }
        content: PropiedadListaEB[]
      }>('/v1/properties', { limit: 3 })

      // Forma del envelope
      expect(pagina.pagination).toMatchObject({ limit: 3, page: 1 })
      expect(typeof pagina.pagination.total).toBe('number')
      expect(Array.isArray(pagina.content)).toBe(true)
      expect(pagina.content.length).toBeGreaterThan(0)

      // El mapeo funciona sobre datos reales
      for (const item of pagina.content) {
        const row = mapearPropiedadLista(item)
        expect(typeof row.easybroker_id).toBe('string')
        expect(row.easybroker_id.length).toBeGreaterThan(0)
      }
    },
    10_000
  )
})
