// @vitest-environment node
/**
 * Tests del motor de score de captaciones (src/lib/captaciones/score.ts).
 * Función pura: se prueba con datos armados a mano, sin mocks.
 */
import { describe, expect, it } from 'vitest'

import {
  contieneContacto,
  contieneTelefono,
  esGritado,
  evaluarCaptacion,
  type DatosScoreCaptacion,
} from '@/lib/captaciones/score'

/** Captación de 100: todo capturado, textos limpios, con video y tour. */
function captacionPerfecta(): DatosScoreCaptacion {
  return {
    titulo: 'Casa en venta en Del Valle, San Pedro Garza García',
    descripcion:
      'Residencia de tres plantas en el corazón de Del Valle, a unas calles de Calzada del Valle. ' +
      'Sala de doble altura con iluminación natural, comedor para diez personas, cocina equipada con ' +
      'cubierta de cuarzo y despensa. Cuatro recámaras, la principal con vestidor y baño completo con ' +
      'doble lavabo. Jardín con riego automático, terraza techada y asador. Cochera techada para tres ' +
      'autos. La zona ofrece colegios, parques y el corredor comercial de Gómez Morín a minutos. ' +
      'Ideal para familias que buscan ubicación, amplitud y plusvalía en San Pedro. ' +
      'Cuenta además con cuarto de servicio con baño propio, bodega, cisterna de diez mil litros, ' +
      'calentador solar y preparación para paneles fotovoltaicos. Los acabados incluyen pisos de ' +
      'mármol en áreas sociales, madera de ingeniería en recámaras y cancelería de doble cristal. ' +
      'Agenda tu visita hoy mismo y conócela en persona.',
    tipo: 'house',
    operacion: 'sale',
    precio: 18500000,
    colonia: 'Del Valle',
    ciudad: 'San Pedro Garza García',
    calle: 'Río Nazas',
    lat: 25.6573,
    lng: -100.4023,
    recamaras: 4,
    banos: 4,
    medios_banos: 1,
    estacionamientos: 3,
    antiguedad: 8,
    m2_construccion: 480,
    m2_terreno: 600,
    video_url: 'https://youtu.be/abc123',
    tour_url: 'https://tour.example.com/casa',
    fotos: 18,
  }
}

describe('detectores', () => {
  it('contieneTelefono: detecta 10 dígitos con separadores, ignora montos', () => {
    expect(contieneTelefono('llama al 81 1234 5678')).toBe(true)
    expect(contieneTelefono('Tel: (81) 12-34-56-78')).toBe(true)
    expect(contieneTelefono('precio $12,500,000 MXN')).toBe(false)
    expect(contieneTelefono('superficie de 480 m2 y 600 de terreno')).toBe(false)
  })

  it('contieneContacto: email, url, whatsapp', () => {
    expect(contieneContacto('escríbeme a ventas@montana.com')).toBe(true)
    expect(contieneContacto('más info en www.mi-sitio.com')).toBe(true)
    expect(contieneContacto('mándame WhatsApp')).toBe(true)
    expect(contieneContacto('casa con jardín y asador')).toBe(false)
  })

  it('esGritado: mayúsculas sostenidas sí, siglas y textos cortos no', () => {
    expect(esGritado('HERMOSA CASA EN VENTA APROVECHA GRAN OPORTUNIDAD')).toBe(true)
    expect(esGritado('Casa en venta en Del Valle con jardín')).toBe(false)
    expect(esGritado('CASA SPGG')).toBe(false) // corto: no alcanza el umbral
  })
})

describe('evaluarCaptacion', () => {
  it('captación perfecta → 100, publicable, cero bloqueantes pendientes', () => {
    const score = evaluarCaptacion(captacionPerfecta())
    expect(score.porcentaje).toBe(100)
    expect(score.publicable).toBe(true)
    expect(score.bloqueantes.every((b) => b.cumple)).toBe(true)
  })

  it('sin fotos suficientes → bloqueante, no publicable, pero el porcentaje se calcula', () => {
    const score = evaluarCaptacion({ ...captacionPerfecta(), fotos: 3 })
    expect(score.publicable).toBe(false)
    const bloqueo = score.bloqueantes.find((b) => b.clave === 'fotos_minimas')
    expect(bloqueo?.cumple).toBe(false)
    expect(bloqueo?.detalle).toContain('3 de 6')
    expect(score.porcentaje).toBeGreaterThan(0)
  })

  it('sin lat/lng → bloqueante (la API de EB las exige)', () => {
    const score = evaluarCaptacion({ ...captacionPerfecta(), lat: null, lng: null })
    expect(score.publicable).toBe(false)
    const geo = score.bloqueantes.find((b) => b.clave === 'geolocalizacion')
    expect(geo?.cumple).toBe(false)
  })

  it('mostrar ubicación exacta sin calle → bloqueante; con solo zona no', () => {
    const base = { ...captacionPerfecta(), calle: null }
    const conExacta = evaluarCaptacion({ ...base, mostrar_ubicacion_exacta: true })
    expect(conExacta.publicable).toBe(false)
    expect(conExacta.bloqueantes.some((b) => b.clave === 'calle_exacta' && !b.cumple)).toBe(true)

    const sinExacta = evaluarCaptacion({ ...base, mostrar_ubicacion_exacta: false })
    expect(sinExacta.bloqueantes.some((b) => b.clave === 'calle_exacta')).toBe(false)
  })

  it('sin precio ni operación → bloqueantes caídos', () => {
    const score = evaluarCaptacion({ ...captacionPerfecta(), precio: null, operacion: null })
    expect(score.publicable).toBe(false)
    const claves = score.bloqueantes.filter((b) => !b.cumple).map((b) => b.clave)
    expect(claves).toContain('precio')
    expect(claves).toContain('operacion')
  })

  it('título a gritos y descripción con teléfono → pierden sus puntos con detalle accionable', () => {
    const score = evaluarCaptacion({
      ...captacionPerfecta(),
      titulo: 'OPORTUNIDAD ÚNICA HERMOSA RESIDENCIA REMATE APROVECHA YA',
      descripcion: captacionPerfecta().descripcion + ' Informes al 8112345678.',
    })
    const tituloLimpio = score.reglas.find((r) => r.clave === 'titulo_limpio')
    const descLimpia = score.reglas.find((r) => r.clave === 'descripcion_limpia')
    expect(tituloLimpio?.cumple).toBe(false)
    expect(tituloLimpio?.detalle).toContain('MAYÚSCULAS')
    expect(descLimpia?.cumple).toBe(false)
    expect(score.porcentaje).toBeLessThan(100)
  })

  it('menos de 10 fotos: no bloquea (si pasa el mínimo) pero baja el score con cuenta exacta', () => {
    const score = evaluarCaptacion({ ...captacionPerfecta(), fotos: 7 })
    expect(score.publicable).toBe(true)
    const meta = score.reglas.find((r) => r.clave === 'fotos_meta')
    expect(meta?.cumple).toBe(false)
    expect(meta?.detalle).toContain('faltan 3')
  })

  it('terreno: recámaras/baños no aplican y el score llega a 100 sin ellos', () => {
    const score = evaluarCaptacion({
      ...captacionPerfecta(),
      tipo: 'land',
      recamaras: null,
      banos: null,
      medios_banos: null,
      estacionamientos: null,
      m2_construccion: null,
    })
    expect(score.reglas.some((r) => r.clave === 'recamaras')).toBe(false)
    expect(score.porcentaje).toBe(100)
  })

  it('los pesos ponderados suman 100 en ambos perfiles (casa y terreno)', () => {
    for (const datos of [captacionPerfecta(), { ...captacionPerfecta(), tipo: 'land' }]) {
      const score = evaluarCaptacion(datos)
      const total = score.reglas.reduce((s, r) => s + r.peso, 0)
      expect(total).toBe(100)
    }
  })
})
