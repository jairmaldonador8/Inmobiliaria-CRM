'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { cambiarEstadoSugerencia } from '@/lib/sugerencias/acciones'
import {
  ESTADOS_SUGERENCIA,
  claseBadgeEstadoSugerencia,
  etiquetaEstadoSugerencia,
} from '@/lib/sugerencias/formato'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  sugerenciaId: string
  estado: string
}

/**
 * Selector de estado de una sugerencia (admin). Actualización optimista con
 * reversión + toast si falla el servidor, mismo patrón que SelectorEtapa.
 */
export function SelectorEstadoSugerencia({ sugerenciaId, estado }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [estadoVisible, setEstadoVisible] = useState(estado)

  const items = ESTADOS_SUGERENCIA.map((e) => ({ value: e, label: etiquetaEstadoSugerencia(e) }))

  function alCambiar(nuevo: string) {
    if (nuevo === estadoVisible) return
    const anterior = estadoVisible
    setEstadoVisible(nuevo)
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoSugerencia(sugerenciaId, nuevo)
      if ('error' in resultado) {
        setEstadoVisible(anterior)
        toast.error(resultado.error)
        return
      }
      toast.success(`Estado: ${etiquetaEstadoSugerencia(nuevo)}`)
      router.refresh()
    })
  }

  return (
    <Select
      items={items}
      value={estadoVisible}
      onValueChange={(v) => alCambiar(v as string)}
      disabled={pendiente}
    >
      <SelectTrigger
        aria-label="Cambiar estado"
        className={cn(
          'h-7 w-auto gap-1.5 rounded-full border-0 px-3 text-xs font-medium shadow-none',
          claseBadgeEstadoSugerencia(estadoVisible)
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
