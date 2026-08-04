'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, Sparkles, UserPlus, UserX, type LucideIcon } from 'lucide-react'

import { marcarLeida, marcarTodasLeidas } from '@/lib/notificaciones/acciones'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type NotificacionListado = {
  id: string
  tipo: string
  texto: string
  url: string | null
  leida: boolean
  creada_en: string
}

const ICONOS_TIPO: Record<string, LucideIcon> = {
  lead_asignado: UserPlus,
  asesor_desactivado: UserX,
  lead_nuevo: Sparkles,
}

function FilaNotificacion({ notificacion }: { notificacion: NotificacionListado }) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const Icono = ICONOS_TIPO[notificacion.tipo] ?? Bell

  function alTocar() {
    if (pendiente) return
    iniciarTransicion(async () => {
      if (!notificacion.leida) {
        await marcarLeida(notificacion.id)
      }
      router.refresh()
      if (notificacion.url) {
        router.push(notificacion.url)
      }
    })
  }

  return (
    <li>
      <button
        type="button"
        onClick={alTocar}
        disabled={pendiente}
        className={cn(
          'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-slate-100 disabled:opacity-60',
          notificacion.leida ? 'bg-white' : 'bg-blue-50/70'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full ring-1',
            notificacion.leida
              ? 'bg-slate-100 text-slate-500 ring-slate-200'
              : 'bg-blue-100 text-blue-700 ring-blue-600/20'
          )}
        >
          <Icono aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm leading-snug break-words',
              notificacion.leida ? 'text-slate-600' : 'font-medium text-slate-900'
            )}
          >
            {notificacion.texto}
          </p>
          <span suppressHydrationWarning className="mt-0.5 block text-xs text-slate-400">
            {formatDistanceToNow(new Date(notificacion.creada_en), {
              addSuffix: true,
              locale: es,
            })}
          </span>
        </div>
        {!notificacion.leida ? (
          <span
            aria-label="Sin leer"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600"
          />
        ) : null}
      </button>
    </li>
  )
}

/**
 * Lista de notificaciones compartida por asesor y admin. Cada fila marca
 * la notificación como leída al tocarla y navega a su `url` si tiene una
 * (p. ej. el detalle del lead). «Marcar todas» solo aparece si hay al
 * menos una sin leer.
 */
export function ListaNotificaciones({
  notificaciones,
}: {
  notificaciones: NotificacionListado[]
}) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const hayNoLeidas = notificaciones.some((n) => !n.leida)

  function alMarcarTodas() {
    iniciarTransicion(async () => {
      await marcarTodasLeidas()
      router.refresh()
    })
  }

  if (notificaciones.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
        No tienes notificaciones todavía
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {hayNoLeidas ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={alMarcarTodas} disabled={pendiente}>
            Marcar todas como leídas
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {notificaciones.map((notificacion) => (
          <FilaNotificacion key={notificacion.id} notificacion={notificacion} />
        ))}
      </ul>
    </div>
  )
}
