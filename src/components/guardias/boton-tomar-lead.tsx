'use client'

/**
 * Botón «Tomar lead» del escalamiento abierto (30 min sin respuesta). El
 * primero que lo toca se queda el lead; si otro ganó la carrera, la action
 * responde «ya fue tomado» y aquí solo se informa. Al ganar se refresca la
 * ruta: el lead ya es del asesor y la página pinta el detalle completo.
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'

import { tomarLead } from '@/lib/leads/acciones'

export function BotonTomarLead({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [tomando, startTransition] = useTransition()

  function tomar() {
    startTransition(async () => {
      const r = await tomarLead(leadId)
      if ('error' in r) {
        toast.error(r.error)
        router.refresh()
        return
      }
      toast.success('El lead ahora es tuyo — contáctalo ya')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={tomar}
      disabled={tomando}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
    >
      <Zap className="size-4" aria-hidden />
      {tomando ? 'Tomando…' : 'Tomar lead'}
    </button>
  )
}
