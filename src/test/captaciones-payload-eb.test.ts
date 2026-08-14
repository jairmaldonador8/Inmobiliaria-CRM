// @vitest-environment node
/**
 * Tests del armador de payload para POST /v1/properties de EasyBroker
 * (src/lib/captaciones/payload-eb.ts). Función pura, sin mocks.
 */
import { describe, expect, it } from 'vitest'

import {
  armarPayloadEB,
  descripcionConIniciales,
  inicialesDeNombre,
  type CaptacionParaEB,
} from '@/lib/captaciones/payload-eb'

function captacionBase(): CaptacionParaEB {
  return {
    titulo: 'Casa en venta en Del Valle, San Pedro Garza García',
    descripcion: 'Residencia con jardín y terraza. Agenda tu visita.',
    tipo: 'house',
    operacion: 'sale',
    precio: 18500000,
    moneda: 'MXN',
    colonia: 'Del Valle',
    ciudad: 'San Pedro Garza García',
    estado: 'Nuevo León',
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
    video_url: 'https://youtu.be/abc',
    tour_url: 'https://tour.example.com/casa',
    fotos: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
  }
}

describe('inicialesDeNombre', () => {
  it('toma las dos primeras palabras', () => {
    expect(inicialesDeNombre('Jair Maldonado')).toBe('JM')
    expect(inicialesDeNombre('maría fernanda lópez')).toBe('MF')
    expect(inicialesDeNombre('Arturo')).toBe('A')
  })
})

describe('descripcionConIniciales', () => {
  it('agrega las iniciales al final en línea propia', () => {
    expect(descripcionConIniciales('Casa con jardín.', 'JM')).toBe('Casa con jardín.\n\nJM')
  })

  it('es idempotente: no duplica si ya terminan la descripción', () => {
    const una = descripcionConIniciales('Casa con jardín.', 'JM')
    expect(descripcionConIniciales(una, 'JM')).toBe(una)
  })
})

describe('armarPayloadEB', () => {
  it('arma los 7 obligatorios + ubicación con colonia, ciudad y estado', () => {
    const payload = armarPayloadEB(captacionBase(), 'JM', true, 2026)
    expect(payload).toMatchObject({
      title: 'Casa en venta en Del Valle, San Pedro Garza García',
      property_type: 'house',
      status: 'published',
      operations: [{ type: 'sale', active: true, amount: 18500000, currency: 'MXN', unit: 'total' }],
    })
    expect(payload.location).toMatchObject({
      name: 'Del Valle, San Pedro Garza García, Nuevo León',
      street: 'Río Nazas',
      postal_code: '66220',
      latitude: 25.6573,
    })
    expect(String(payload.description)).toMatch(/\n\nJM$/)
  })

  it('publicar=false → not_published (el switch maestro del admin)', () => {
    const payload = armarPayloadEB(captacionBase(), 'JM', false, 2026)
    expect(payload.status).toBe('not_published')
  })

  it('antigüedad: 0 → new_construction; años → año de construcción', () => {
    expect(armarPayloadEB({ ...captacionBase(), antiguedad: 0 }, 'JM', true, 2026).age).toBe('new_construction')
    expect(armarPayloadEB({ ...captacionBase(), antiguedad: 8 }, 'JM', true, 2026).age).toBe(2018)
    expect(armarPayloadEB({ ...captacionBase(), antiguedad: null }, 'JM', true, 2026).age).toBeUndefined()
  })

  it('campos null se omiten (no viajan como null a EB)', () => {
    const payload = armarPayloadEB(
      { ...captacionBase(), recamaras: null, video_url: null, calle: null, lat: null, lng: null },
      'JM',
      true,
      2026
    )
    expect('bedrooms' in payload).toBe(false)
    expect('videos' in payload).toBe(false)
    expect('street' in (payload.location as object)).toBe(false)
    expect('latitude' in (payload.location as object)).toBe(false)
  })

  it('nombreUbicacion resuelto contra /locations pisa al armado a mano', () => {
    const payload = armarPayloadEB(
      captacionBase(),
      'JM',
      true,
      2026,
      'Balcones Del Valle, San Pedro Garza García, Nuevo León'
    )
    expect((payload.location as { name: string }).name).toBe(
      'Balcones Del Valle, San Pedro Garza García, Nuevo León'
    )
  })

  it('recorta a 50 imágenes (límite duro de la API)', () => {
    const fotos = Array.from({ length: 60 }, (_, i) => `https://cdn.example.com/${i}.jpg`)
    const payload = armarPayloadEB({ ...captacionBase(), fotos }, 'JM', true, 2026)
    expect((payload.images as unknown[]).length).toBe(50)
  })
})
