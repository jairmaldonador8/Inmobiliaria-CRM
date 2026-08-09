'use client'

/**
 * Toggle «Exclusiva» de la propiedad (Fase B guardias). SOLO se renderiza en
 * la vista admin: la marca vive en `propiedades_internas`, invisible para
 * asesores a nivel de base — este componente jamás debe montarse en (asesor).
 * Los leads de propiedades exclusivas se asignan directo al dueño (regla VIP).
 */
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { marcarExclusiva } from '@/lib/propiedades/internas'
import { cn } from '@/lib/utils'

export function ToggleExclusiva({
  propiedadId,
  exclusivaInicial,
}: {
  propiedadId: string
  exclusivaInicial: boolean
}) {
  const [exclusiva, setExclusiva] = useState(exclusivaInicial)
  const [guardando, startTransition] = useTransition()

  function alternar() {
    const nueva = !exclusiva
    setExclusiva(nueva) // optimista; se revierte si la action falla
    startTransition(async () => {
      const r = await marcarExclusiva(propiedadId, nueva)
      if ('error' in r) {
        setExclusiva(!nueva)
        toast.error(r.error)
      }
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={exclusiva}
      onClick={alternar}
      disabled={guardando}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
    >
      <span className="text-sm font-medium text-slate-900">
        Exclusiva
        <span className="block text-xs font-normal text-slate-500">
          Sus leads van directo al dueño (VIP)
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          exclusiva ? 'bg-slate-900' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
            exclusiva && 'translate-x-5'
          )}
        />
      </span>
    </button>
  )
}
