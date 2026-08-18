/**
 * Mensaje de ficha técnica para compartir con el CLIENTE (ronda 2, pedido de
 * Renata). Tono formal y confiable — es texto que llega al cliente final, no
 * a la UI interna del asesor (criterio de mensajes automatizados del
 * proyecto: nada de «te late» / «chance»).
 *
 * Función pura: la comparten la ficha del asesor y la del admin.
 */

import { etiquetaOperacion, formatearPrecio, formatearSuperficie } from '@/lib/propiedades/formato'

export type PropiedadCompartible = {
  titulo: string
  operacion: string | null
  precio: number | null
  moneda: string
  recamaras: number | null
  banos: number | null
  estacionamientos: number | null
  superficie_construccion: number | null
  superficie_terreno: number | null
  colonia: string | null
  ciudad: string | null
  url_publica: string | null
}

export function mensajeFichaTecnica(propiedad: PropiedadCompartible): string {
  const zona = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')
  const precio = formatearPrecio(propiedad.precio, propiedad.moneda)

  const datos = [
    propiedad.operacion ? `Operación: ${etiquetaOperacion(propiedad.operacion)}` : null,
    propiedad.precio != null ? `Precio: ${precio}` : null,
    propiedad.recamaras != null ? `Recámaras: ${propiedad.recamaras}` : null,
    propiedad.banos != null ? `Baños: ${propiedad.banos}` : null,
    propiedad.estacionamientos != null ? `Estacionamientos: ${propiedad.estacionamientos}` : null,
    propiedad.superficie_construccion != null
      ? `Construcción: ${formatearSuperficie(propiedad.superficie_construccion)}`
      : null,
    propiedad.superficie_terreno != null
      ? `Terreno: ${formatearSuperficie(propiedad.superficie_terreno)}`
      : null,
    zona ? `Zona: ${zona}` : null,
  ].filter(Boolean)

  const bloques = [
    `Le comparto la ficha técnica de la propiedad:`,
    propiedad.titulo,
    datos.map((d) => `• ${d}`).join('\n'),
    propiedad.url_publica
      ? `Puede ver más detalles y fotografías aquí:\n${propiedad.url_publica}`
      : null,
    'Quedo al pendiente de cualquier duda.',
  ].filter(Boolean)

  return bloques.join('\n\n')
}
