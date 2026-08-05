/**
 * Tarjeta de estadística (KPI) del kit Fintech Muro: compone TarjetaGlass
 * con etiqueta, valor y una tendencia opcional (▲ verde si sube, ▼ barro
 * si baja, oculta si el delta es 0 o no se pasa tendencia). El sufijo de
 * la tendencia es configurable (por defecto '%'), para soportar deltas
 * absolutos (p. ej. "▲ 3 leads"). La flecha va acompañada de texto
 * sr-only ("subió"/"bajó") para que la semántica no dependa solo del
 * color/glifo, y de `data-tendencia="sube"|"baja"` para poder engancharse
 * desde tests o CSS sin depender de las clases de color.
 * Acepta `className` (fusionada con `cn()`) y reenvía el resto de props
 * estándar de `<div>` a la TarjetaGlass raíz.
 */
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'

interface Tendencia {
  /** Cambio — solo se usa el signo para elegir flecha, color y texto sr-only. */
  delta: number
  /** Unidad mostrada tras el número absoluto (p. ej. ' leads'). Por defecto '%'. */
  sufijo?: string
}

interface StatCardProps extends Omit<ComponentProps<'div'>, 'children'> {
  etiqueta: string
  valor: string
  tendencia?: Tendencia
}

export default function StatCard({
  etiqueta,
  valor,
  tendencia,
  className,
  ...props
}: StatCardProps) {
  const delta = tendencia?.delta ?? 0
  const sufijo = tendencia?.sufijo ?? '%'
  const sube = delta > 0

  return (
    <TarjetaGlass className={className} {...props}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{etiqueta}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900">{valor}</span>
        {delta !== 0 && (
          <span
            className={cn('text-xs font-semibold', sube ? 'text-[#65A30D]' : 'text-[#A34E28]')}
            data-tendencia={sube ? 'sube' : 'baja'}
          >
            <span className="sr-only">{sube ? 'subió' : 'bajó'} </span>
            {sube ? '▲' : '▼'} {Math.abs(delta)}
            {sufijo}
          </span>
        )}
      </div>
    </TarjetaGlass>
  )
}
