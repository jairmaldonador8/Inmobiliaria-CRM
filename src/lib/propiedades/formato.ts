/**
 * Formateo y vocabulario de presentación de propiedades.
 *
 * Sin 'server-only': se usa igual en Server Components y en componentes
 * de cliente (tarjetas, galería).
 */

const formatoCompleto = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
})

/** Precio completo: "$17,525,888" (+ sufijo si la moneda no es MXN). */
export function formatearPrecio(precio: number | null, moneda: string): string {
  if (precio == null) return 'Precio por consultar'
  const base = formatoCompleto.format(precio)
  return moneda && moneda !== 'MXN' ? `${base} ${moneda}` : base
}

/** Precio compacto para tarjetas: "$17.5M" en millones, completo si es menor. */
export function formatearPrecioCompacto(precio: number | null, moneda: string): string {
  if (precio == null) return 'Por consultar'
  if (precio >= 1_000_000) {
    const millones = (precio / 1_000_000).toFixed(1).replace(/\.0$/, '')
    const base = `$${millones}M`
    return moneda && moneda !== 'MXN' ? `${base} ${moneda}` : base
  }
  return formatearPrecio(precio, moneda)
}

/** Etiqueta en español de la operación cruda de EasyBroker. */
export function etiquetaOperacion(operacion: string | null): string {
  if (operacion === 'sale') return 'Venta'
  if (operacion === 'rental') return 'Renta'
  return 'Operación'
}

const ETIQUETAS_ESTATUS: Record<string, string> = {
  published: 'Publicada',
  not_published: 'No publicada',
  suspended: 'Suspendida',
  reserved: 'Reservada',
  sold: 'Vendida',
  rented: 'Rentada',
}

/** Etiqueta en español del estatus crudo de EasyBroker. */
export function etiquetaEstatus(estatus: string | null): string {
  if (!estatus) return '—'
  return ETIQUETAS_ESTATUS[estatus] ?? estatus
}

const formatoSuperficie = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

/** "538 m²" o null si no hay dato. */
export function formatearSuperficie(m2: number | null): string | null {
  if (m2 == null || m2 <= 0) return null
  return `${formatoSuperficie.format(m2)} m²`
}
