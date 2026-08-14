import { cn } from '@/lib/utils'

/**
 * Anillo del score de calidad (estilo «círculo de calidad» de Inmuebles24).
 * El color es de ESTADO (bien/regular/grave) y nunca viaja solo: el número
 * al centro y la etiqueta de abajo dicen lo mismo con texto.
 */
export function AnilloScore({
  porcentaje,
  publicable,
  tamano = 140,
}: {
  porcentaje: number
  publicable: boolean
  tamano?: number
}) {
  const grosor = Math.max(8, Math.round(tamano / 14))
  const radio = (tamano - grosor) / 2
  const circunferencia = 2 * Math.PI * radio
  const avance = (Math.min(100, Math.max(0, porcentaje)) / 100) * circunferencia

  const colorAnillo =
    porcentaje >= 80 ? 'stroke-emerald-500' : porcentaje >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: tamano, height: tamano }}>
        <svg
          width={tamano}
          height={tamano}
          viewBox={`0 0 ${tamano} ${tamano}`}
          role="img"
          aria-label={`Calidad de la captación: ${porcentaje} por ciento`}
        >
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            strokeWidth={grosor}
            className="stroke-slate-200"
          />
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={`${avance} ${circunferencia - avance}`}
            transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
            className={cn('transition-all duration-500', colorAnillo)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-slate-900">
            {porcentaje}
            <span className="text-base font-medium text-slate-400">%</span>
          </span>
        </div>
      </div>
      <figcaption
        className={cn(
          'text-xs font-medium',
          publicable ? 'text-emerald-600' : 'text-rose-600'
        )}
      >
        {publicable ? 'Cumple los requisitos para cargarse' : 'Aún no cumple los requisitos'}
      </figcaption>
    </figure>
  )
}
