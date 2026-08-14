import { CheckCircle2, CircleAlert, CircleDashed } from 'lucide-react'

import type { ScoreCaptacion } from '@/lib/captaciones/score'
import { cn } from '@/lib/utils'

/**
 * El checklist regla por regla del score: primero los requisitos
 * (bloqueantes) y luego las reglas de calidad con su peso. Lo usan el
 * formulario del asesor (en vivo) y el dashboard del admin.
 */
export function ChecklistScore({ score }: { score: ScoreCaptacion }) {
  const requisitosPendientes = score.bloqueantes.filter((b) => !b.cumple)

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Requisitos para cargar</h3>
        <ul className="grid gap-1.5">
          {score.bloqueantes.map((r) => (
            <li key={r.clave} className="flex items-start gap-2">
              {r.cumple ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
              )}
              <div className="min-w-0">
                <p className={cn('text-sm', r.cumple ? 'text-slate-700' : 'font-medium text-rose-700')}>
                  {r.etiqueta}
                </p>
                {!r.cumple ? <p className="text-xs text-slate-500">{r.detalle}</p> : null}
              </div>
            </li>
          ))}
        </ul>
        {requisitosPendientes.length === 0 ? (
          <p className="mt-2 text-xs text-emerald-600">Todos los requisitos cumplidos.</p>
        ) : null}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Calidad del anuncio</h3>
        <ul className="grid gap-1.5">
          {score.reglas.map((r) => (
            <li key={r.clave} className="flex items-start gap-2">
              {r.cumple ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('text-sm', r.cumple ? 'text-slate-700' : 'text-slate-500')}>
                    {r.etiqueta}
                  </p>
                  {!r.cumple ? (
                    <span className="shrink-0 text-xs font-medium text-slate-400">+{r.peso}</span>
                  ) : null}
                </div>
                {!r.cumple ? <p className="text-xs text-slate-500">{r.detalle}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
