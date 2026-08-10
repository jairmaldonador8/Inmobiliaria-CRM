'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { asignarLead } from '@/lib/leads/acciones'
import type { OpcionAsesor } from '@/components/leads/asignar-lead'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

type Props = {
  leadId: string
  leadNombre: string
  asesores: OpcionAsesor[]
}

/** Iniciales del avatar-círculo: primera letra de hasta 2 palabras del nombre. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Acción «Asignar» de la bandeja móvil (Task FM7): botón píldora que abre
 * un Sheet inferior con la lista de asesores activos como filas táctiles
 * generosas (avatar-iniciales + nombre). Reusa la MISMA server action y el
 * mismo patrón de toast que <AsignarLead> (el select + botón de escritorio),
 * solo cambia la superficie de selección de un <Select> a una hoja.
 */
export function HojaAsignarLead({ leadId, leadNombre, asesores }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [asesorPendiente, setAsesorPendiente] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alElegir(asesor: OpcionAsesor) {
    setAsesorPendiente(asesor.userId)
    iniciarTransicion(async () => {
      const resultado = await asignarLead(leadId, asesor.userId)
      setAsesorPendiente(null)
      if ('error' in resultado) {
        toast.error(resultado.error)
        router.refresh()
        return
      }
      toast.success(`${leadNombre} asignado a ${asesor.nombre}`)
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger
        aria-label={`Asignar ${leadNombre}`}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#141414] px-5 text-sm font-semibold text-white shadow-glass-sm transition-opacity active:opacity-90 disabled:opacity-50"
      >
        Asignar
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-md gap-0 rounded-t-2xl p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>Asignar a {leadNombre}</SheetTitle>
        </SheetHeader>
        {asesores.length === 0 ? (
          <p className="px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-sm text-slate-500">
            No hay asesores activos disponibles
          </p>
        ) : (
          <ul className="flex flex-col gap-1 px-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            {asesores.map((asesor) => (
              <li key={asesor.userId}>
                <button
                  type="button"
                  onClick={() => alElegir(asesor)}
                  disabled={pendiente}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#141414]/8 text-sm font-semibold text-[#141414]"
                  >
                    {iniciales(asesor.nombre)}
                  </span>
                  <span className="flex-1 truncate">{asesor.nombre}</span>
                  {pendiente && asesorPendiente === asesor.userId ? (
                    <span className="text-xs text-slate-400">Asignando…</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
