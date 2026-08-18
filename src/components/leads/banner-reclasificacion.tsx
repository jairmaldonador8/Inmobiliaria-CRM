'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserSearch } from 'lucide-react'

import { resolverReclasificacion } from '@/lib/leads/reclasificacion'
import { Button } from '@/components/ui/button'

/**
 * Aviso en la ficha ADMIN del lead: hay un reporte de «es un corredor, no
 * cliente» esperando decisión (ronda 2). Aprobar reclasifica el lead a
 * corredor externo; en ambos casos el solicitante recibe la resolución.
 */
export function BannerReclasificacion({
  solicitudId,
  solicitanteNombre,
  motivo,
}: {
  solicitudId: string
  solicitanteNombre: string
  motivo: string
}) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  function resolver(decision: 'aprobada' | 'rechazada') {
    iniciarTransicion(async () => {
      const resultado = await resolverReclasificacion(solicitudId, decision)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(
        decision === 'aprobada'
          ? 'Aprobado: el lead quedó como corredor externo'
          : 'Rechazado: el lead sigue como cliente directo'
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2.5">
        <UserSearch aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {solicitanteNombre} reporta que este lead es un corredor, no cliente
          </p>
          {motivo ? <p className="mt-0.5 text-xs text-slate-600">«{motivo}»</p> : null}
          <p className="mt-0.5 text-xs text-slate-500">
            Si lo apruebas, se marca como corredor externo y sale de las colas de urgencia.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={pendiente}
          onClick={() => resolver('aprobada')}
          className="rounded-xl"
        >
          Aprobar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pendiente}
          onClick={() => resolver('rechazada')}
          className="rounded-xl bg-white"
        >
          Rechazar
        </Button>
      </div>
    </div>
  )
}
