'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { togglePortal } from '@/lib/propiedades/acciones'
import { PORTALES_MANUALES } from '@/lib/propiedades/portales'

type Props = {
  propiedadId: string
  /** Portales ya marcados en propiedad_portales. */
  marcados: string[]
}

/**
 * Checkboxes de portales manuales (Inmuebles24, Lamudi, …): registro a mano
 * de dónde está publicada la propiedad además de EasyBroker. Solo admin.
 */
export function PortalesManuales({ propiedadId, marcados }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  // Estado local optimista; se revierte si la acción falla.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(marcados))

  function alTogglear(portal: string, marcado: boolean) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev)
      if (marcado) siguiente.add(portal)
      else siguiente.delete(portal)
      return siguiente
    })

    iniciarTransicion(async () => {
      const resultado = await togglePortal(propiedadId, portal, marcado)
      if ('error' in resultado) {
        // Revertir el cambio optimista.
        setSeleccion((prev) => {
          const siguiente = new Set(prev)
          if (marcado) siguiente.delete(portal)
          else siguiente.add(portal)
          return siguiente
        })
        toast.error(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {PORTALES_MANUALES.map((portal) => (
        <li key={portal}>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 select-none">
            <input
              type="checkbox"
              checked={seleccion.has(portal)}
              disabled={pendiente}
              onChange={(e) => alTogglear(portal, e.target.checked)}
              className="size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {portal}
          </label>
        </li>
      ))}
    </ul>
  )
}
