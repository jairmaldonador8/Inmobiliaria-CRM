import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

import { iconoEvento } from '@/lib/eventos/formato'
import type { EventoTimeline } from '@/lib/eventos/consultas'
import { cn } from '@/lib/utils'

/**
 * Timeline «Historia del lead» (más reciente primero). INMUTABLE por diseño
 * — lead_eventos es append-only, así que aquí no hay editar ni borrar.
 *
 * Misma estructura visual que TimelineSeguimientos (slate/white a propósito:
 * las páginas de detalle aún no están rediseñadas al kit Fintech). Server
 * Component compartido por el detalle del asesor y el del admin — los tipos
 * de supervisión solo llegan al admin porque la RLS los filtra, la UI no
 * distingue nada.
 */
export function TimelineEventos({ eventos }: { eventos: EventoTimeline[] }) {
  if (eventos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
        Sin historia todavía — aquí se irá anotando todo lo que le pase al lead
      </p>
    )
  }

  return (
    <ol data-timeline className="flex flex-col">
      {eventos.map((evento, indice) => {
        const Icono = iconoEvento(evento.tipo)
        const esSistema = evento.actor_nombre === null
        return (
          <li key={evento.id} data-evento={evento.tipo} className="relative flex gap-3 pb-5">
            {/* Línea vertical que conecta con el siguiente evento. */}
            {indice < eventos.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-8 left-[15px] h-[calc(100%-2rem)] w-px bg-slate-200"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full ring-1',
                esSistema
                  ? 'bg-slate-100 text-slate-500 ring-slate-200'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
              )}
            >
              <Icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-slate-900">{evento.etiqueta}</span>
                <span suppressHydrationWarning className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(evento.ocurrido_en), {
                    addSuffix: true,
                    locale: es,
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{evento.actor_nombre ?? 'Sistema'}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
