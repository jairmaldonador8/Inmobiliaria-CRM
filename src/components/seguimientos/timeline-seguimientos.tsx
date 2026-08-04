import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bot, FileText, Home, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react'

import { etiquetaTipoSeguimiento } from '@/lib/seguimientos/formato'
import { cn } from '@/lib/utils'

export type SeguimientoTimeline = {
  id: string
  tipo: string
  nota: string
  creado_en: string
  /** Nombre del autor; null = evento automático → se muestra «Sistema». */
  autor_nombre: string | null
}

const ICONOS_TIPO: Record<string, LucideIcon> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  correo: Mail,
  visita: Home,
  otro: FileText,
  sistema: Bot,
}

/**
 * Timeline de seguimientos (más reciente primero). INMUTABLE por diseño:
 * sin editar ni borrar — el historial es el historial.
 *
 * Server Component compartido por el detalle del asesor y el del admin.
 */
export function TimelineSeguimientos({ seguimientos }: { seguimientos: SeguimientoTimeline[] }) {
  if (seguimientos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
        Sin seguimientos todavía — registra el primero
      </p>
    )
  }

  return (
    <ol data-timeline className="flex flex-col">
      {seguimientos.map((seguimiento, indice) => {
        const Icono = ICONOS_TIPO[seguimiento.tipo] ?? FileText
        const esSistema = seguimiento.tipo === 'sistema'
        return (
          <li key={seguimiento.id} data-seguimiento={seguimiento.tipo} className="relative flex gap-3 pb-5">
            {/* Línea vertical que conecta con el siguiente evento. */}
            {indice < seguimientos.length - 1 ? (
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
                <span className="text-sm font-medium text-slate-900">
                  {seguimiento.autor_nombre ?? 'Sistema'}
                </span>
                <span className="text-xs text-slate-500">
                  {etiquetaTipoSeguimiento(seguimiento.tipo)}
                </span>
                <span suppressHydrationWarning className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(seguimiento.creado_en), {
                    addSuffix: true,
                    locale: es,
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-line text-slate-600">
                {seguimiento.nota}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
