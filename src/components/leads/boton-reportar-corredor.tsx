'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserSearch } from 'lucide-react'

import { solicitarReclasificacion } from '@/lib/leads/reclasificacion'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * «Es un corredor, no cliente» (ronda 2): el asesor lo descubre al hablarle
 * — el "cliente" pregunta por SU cliente. Aquí solo se REPORTA; el candado
 * lo tiene administración (ver reclasificacion.ts). Con reporte pendiente,
 * el botón se vuelve el estado, para no re-reportar.
 */
export function BotonReportarCorredor({
  leadId,
  leadNombre,
  reportePendiente,
}: {
  leadId: string
  leadNombre: string
  reportePendiente: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendiente, iniciarTransicion] = useTransition()

  if (reportePendiente) {
    return (
      <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        <UserSearch aria-hidden className="size-3.5" />
        Reporte de corredor pendiente de aprobación
      </p>
    )
  }

  function enviar() {
    iniciarTransicion(async () => {
      const resultado = await solicitarReclasificacion(leadId, motivo)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success('Reporte enviado a administración')
      setAbierto(false)
      setMotivo('')
      router.refresh()
    })
  }

  const primerNombre = leadNombre.trim().split(/\s+/)[0] || 'este lead'

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 self-start text-xs text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
      >
        <UserSearch aria-hidden className="size-3.5" />
        ¿Es un corredor, no cliente? Repórtalo
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>Reportar a {primerNombre} como corredor</SheetTitle>
            <SheetDescription>
              Administración lo revisa y aprueba. Si se aprueba, el lead queda marcado como
              corredor externo y sale de tus colas de urgencia.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pb-4">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="¿Cómo te diste cuenta? (opcional — p. ej. «me dijo que era para su cliente»)"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <Button
              type="button"
              size="lg"
              disabled={pendiente}
              onClick={enviar}
              className="w-full rounded-xl"
            >
              Enviar reporte
            </Button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => setAbierto(false)}
              className="self-center text-sm text-slate-500 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
