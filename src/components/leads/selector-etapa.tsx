'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { cambiarEtapa } from '@/lib/leads/acciones-asesor'
import {
  ETAPAS_SELECCIONABLES,
  claseBadgeEtapa,
  etiquetaEtapa,
  type EtapaLead,
} from '@/lib/leads/formato'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  leadId: string
  etapa: string
}

/**
 * Selector de etapa del detalle de lead (asesor). Reusa cambiarEtapa (la
 * misma action del kanban) con actualización optimista: si el servidor
 * falla, revierte con toast.
 *
 * Ofrece ETAPAS_SELECCIONABLES (las 5 activas + cerrado_ganado/perdido), NO
 * el enum completo: 'apartado' está fusionado con 'negociacion' y ya no es
 * un destino que se deba poder elegir. Este selector es una de las dos
 * rutas para CERRAR un lead (la otra es el menú «Mover a…» del kanban) —
 * sigue siendo posible marcar cerrado_ganado/cerrado_perdido aunque esas
 * etapas ya no tengan columna propia.
 */
export function SelectorEtapa({ leadId, etapa }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [etapaVisible, setEtapaVisible] = useState(etapa)

  const items = ETAPAS_SELECCIONABLES.map((e) => ({ value: e, label: etiquetaEtapa(e) }))

  function alCambiar(nueva: string) {
    if (nueva === etapaVisible) return
    const anterior = etapaVisible
    setEtapaVisible(nueva)
    iniciarTransicion(async () => {
      const resultado = await cambiarEtapa(leadId, nueva as EtapaLead)
      if ('error' in resultado) {
        setEtapaVisible(anterior)
        toast.error(resultado.error)
        return
      }
      toast.success(`Etapa: ${etiquetaEtapa(nueva)}`)
      router.refresh()
    })
  }

  return (
    <Select
      items={items}
      value={etapaVisible}
      onValueChange={(v) => alCambiar(v as string)}
      disabled={pendiente}
    >
      <SelectTrigger
        aria-label="Cambiar etapa"
        className={cn(
          'h-8 w-auto gap-1.5 rounded-full border-0 px-3 text-xs font-medium shadow-none',
          claseBadgeEtapa(etapaVisible)
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
