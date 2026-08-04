'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { asignarLead } from '@/lib/leads/acciones'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionAsesor = { userId: string; nombre: string }

type Props = {
  leadId: string
  leadNombre: string
  asesores: OpcionAsesor[]
}

/** Select de asesor + botón «Asignar» de una fila de la bandeja. */
export function AsignarLead({ leadId, leadNombre, asesores }: Props) {
  const router = useRouter()
  const [asesorId, setAsesorId] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const items = [
    { value: null, label: 'Elegir asesor' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
  ]

  function alAsignar() {
    if (!asesorId) return

    iniciarTransicion(async () => {
      const resultado = await asignarLead(leadId, asesorId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        router.refresh()
        return
      }
      const nombreAsesor = asesores.find((a) => a.userId === asesorId)?.nombre ?? 'asesor'
      toast.success(`${leadNombre} asignado a ${nombreAsesor}`)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        items={items}
        value={asesorId}
        onValueChange={(v) => setAsesorId(v as string | null)}
        disabled={pendiente}
      >
        <SelectTrigger
          aria-label={`Elegir asesor para ${leadNombre}`}
          className="w-44 bg-white"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value ?? 'sin'} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={alAsignar} disabled={pendiente || !asesorId}>
        {pendiente ? 'Asignando…' : 'Asignar'}
      </Button>
    </div>
  )
}
