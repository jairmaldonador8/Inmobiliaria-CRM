import { cn } from '@/lib/utils'
import type { SegmentoPipeline } from '@/lib/dashboard/pipeline'

/** Mismos colores del pipeline de cápsulas del home admin y del apartado por asesor. */
const COLORES_PIPELINE = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const

/**
 * Barra segmentada del pipeline: en qué etapa está el trabajo de alguien.
 *
 * Extraída del home admin y del apartado por asesor, que la traían en línea,
 * para que el panorama hable exactamente el mismo idioma visual — una etapa,
 * un color, en todas las pantallas.
 */
export function BarraPipeline({
  segmentos,
  conLeyenda = true,
  className,
}: {
  segmentos: SegmentoPipeline[]
  conLeyenda?: boolean
  className?: string
}) {
  if (segmentos.length === 0) {
    return <p className={cn('text-sm text-slate-500', className)}>Sin leads en el pipeline</p>
  }

  return (
    <div className={className}>
      <div
        className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={segmentos.map((s) => `${s.cantidad} en ${s.etiqueta}`).join(', ')}
      >
        {segmentos.map((segmento, indice) => (
          <div
            key={segmento.etapa}
            className={cn('rounded-full', COLORES_PIPELINE[indice % COLORES_PIPELINE.length])}
            style={{ flexGrow: segmento.cantidad }}
          />
        ))}
      </div>

      {conLeyenda ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segmentos.map((segmento, indice) => (
            <li
              key={segmento.etapa}
              className="flex items-center gap-1.5 text-xs text-slate-500"
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  COLORES_PIPELINE[indice % COLORES_PIPELINE.length]
                )}
              />
              {segmento.etiqueta}{' '}
              <span className="font-semibold text-slate-900">{segmento.cantidad}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
