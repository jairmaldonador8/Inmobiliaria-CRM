'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { asignarLead, reasignarLead } from '@/lib/leads/acciones'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionAsesorReasignar = { userId: string; nombre: string }

type Props = {
  leadId: string
  leadNombre: string
  /** null = lead en bandeja → el botón dice «Asignar» y usa asignarLead. */
  asesorActualId: string | null
  asesores: OpcionAsesorReasignar[]
}

/**
 * Select de asesor + botón del detalle admin: asigna (bandeja) o reasigna
 * (ya tiene asesor). Ambas actions registran el seguimiento de sistema y
 * notifican al asesor.
 */
export function ReasignarLead({ leadId, leadNombre, asesorActualId, asesores }: Props) {
  const router = useRouter()
  const [asesorId, setAsesorId] = useState<string | null>(asesorActualId)
  const [pendiente, iniciarTransicion] = useTransition()

  const esBandeja = asesorActualId === null
  const items = [
    { value: null, label: 'Elegir asesor' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
  ]

  const sinCambio = !asesorId || asesorId === asesorActualId

  function alConfirmar() {
    if (!asesorId || sinCambio) return

    iniciarTransicion(async () => {
      const resultado = esBandeja
        ? await asignarLead(leadId, asesorId)
        : await reasignarLead(leadId, asesorId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        router.refresh()
        return
      }
      const nombreAsesor = asesores.find((a) => a.userId === asesorId)?.nombre ?? 'asesor'
      toast.success(
        `${leadNombre} ${esBandeja ? 'asignado' : 'reasignado'} a ${nombreAsesor}`
      )
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
          className="w-full min-w-0 flex-1 bg-white sm:w-52 sm:flex-none"
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
      <Button size="sm" onClick={alConfirmar} disabled={pendiente || sinCambio}>
        {pendiente
          ? esBandeja
            ? 'Asignando…'
            : 'Reasignando…'
          : esBandeja
            ? 'Asignar'
            : 'Reasignar'}
      </Button>
    </div>
  )
}
