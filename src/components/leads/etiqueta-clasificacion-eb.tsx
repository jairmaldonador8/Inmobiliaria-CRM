import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'
import { claseBadgeClasificacionEB, etiquetaClasificacionEB } from '@/lib/leads/formato'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/**
 * Etiqueta de la clasificación de un lead de EasyBroker (ver migración 0011
 * y src/lib/easybroker/mapeo.ts: ClasificacionLeadEB). `null` cubre tanto
 * "no viene de EasyBroker" como "no se pudo clasificar" — en ambos casos NO
 * se pinta nada (no es una categoría del dominio, no hay que inventarle un
 * badge de "sin clasificar").
 */
export function EtiquetaClasificacionEB({
  clasificacion,
  className,
}: {
  clasificacion: ClasificacionLeadEB | null | undefined
  className?: string
}) {
  if (!clasificacion) return null
  return (
    <Badge className={cn(claseBadgeClasificacionEB(clasificacion), className)}>
      {etiquetaClasificacionEB(clasificacion)}
    </Badge>
  )
}
