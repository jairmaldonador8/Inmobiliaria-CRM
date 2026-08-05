/**
 * Tarjeta de estadística (KPI) del kit Fintech Muro: compone TarjetaGlass
 * con etiqueta, valor y una tendencia opcional (▲ verde si sube, ▼ barro
 * si baja, oculta si el delta es 0 o no se pasa tendencia).
 */
import TarjetaGlass from '@/components/fintech/tarjeta-glass'

interface Tendencia {
  /** Cambio porcentual (o absoluto) — solo se usa el signo para elegir flecha y color. */
  delta: number
}

interface StatCardProps {
  etiqueta: string
  valor: string
  tendencia?: Tendencia
}

export default function StatCard({ etiqueta, valor, tendencia }: StatCardProps) {
  const delta = tendencia?.delta ?? 0

  return (
    <TarjetaGlass>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{etiqueta}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900">{valor}</span>
        {delta > 0 && (
          <span className="text-xs font-semibold text-[#65A30D]">▲ {delta}%</span>
        )}
        {delta < 0 && (
          <span className="text-xs font-semibold text-[#A34E28]">▼ {Math.abs(delta)}%</span>
        )}
      </div>
    </TarjetaGlass>
  )
}
