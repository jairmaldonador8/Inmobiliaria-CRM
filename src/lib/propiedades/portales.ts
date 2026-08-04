/** Portales manuales que el equipo marca a mano por propiedad. */
export const PORTALES_MANUALES = [
  'Inmuebles24',
  'Lamudi',
  'Vivanuncios',
  'Trovit',
  'Clasco',
  'Sitio propio',
] as const

export type PortalManual = (typeof PORTALES_MANUALES)[number]
