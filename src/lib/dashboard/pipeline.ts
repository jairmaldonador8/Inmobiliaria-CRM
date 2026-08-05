/**
 * Agrupamiento puro para el «pipeline de cápsulas» del dashboard móvil
 * (Task FM6): cuenta leads activos por etapa y los ordena según el orden
 * canónico de `ETAPAS_LEAD`, descartando las etapas cerradas (ya vienen
 * excluidas de la query, pero se filtran aquí también por si acaso) y las
 * etapas sin ningún lead (no se rellena con ceros — la barra segmentada
 * solo dibuja las etapas con datos reales).
 *
 * Función pura y sin dependencias de Supabase: los datos salen gratis de
 * la misma query de `leadsAsignados` que la página ya hace para «sin
 * atender», así que esto solo agrupa en memoria.
 */
import { ETAPAS_CERRADAS, ETAPAS_LEAD, etiquetaEtapa } from '@/lib/leads/formato'

export interface SegmentoPipeline {
  etapa: string
  etiqueta: string
  cantidad: number
}

const ETAPAS_ACTIVAS = ETAPAS_LEAD.filter(
  (etapa) => !(ETAPAS_CERRADAS as readonly string[]).includes(etapa)
)

export function agruparPorEtapa(leads: { etapa: string }[]): SegmentoPipeline[] {
  const conteos = new Map<string, number>()
  for (const lead of leads) {
    conteos.set(lead.etapa, (conteos.get(lead.etapa) ?? 0) + 1)
  }

  return ETAPAS_ACTIVAS.map((etapa) => ({
    etapa,
    etiqueta: etiquetaEtapa(etapa),
    cantidad: conteos.get(etapa) ?? 0,
  })).filter((segmento) => segmento.cantidad > 0)
}
