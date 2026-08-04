'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { asignarAsesorPropiedad } from '@/lib/propiedades/acciones'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SIN_RESPONSABLE = 'sin'

type Props = {
  propiedadId: string
  asesorId: string | null
  asesores: { userId: string; nombre: string }[]
}

/** Select de asesor responsable de una propiedad (solo vista admin). */
export function SelectorAsesor({ propiedadId, asesorId, asesores }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  const items = [
    { value: SIN_RESPONSABLE, label: 'Sin responsable' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
  ]

  function alCambiar(valor: string) {
    const nuevoAsesorId = valor === SIN_RESPONSABLE ? null : valor
    if (nuevoAsesorId === asesorId) return

    iniciarTransicion(async () => {
      const resultado = await asignarAsesorPropiedad(propiedadId, nuevoAsesorId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(
        nuevoAsesorId
          ? `Responsable asignado: ${asesores.find((a) => a.userId === nuevoAsesorId)?.nombre ?? ''}`
          : 'Propiedad sin responsable'
      )
      router.refresh()
    })
  }

  return (
    <Select
      items={items}
      value={asesorId ?? SIN_RESPONSABLE}
      onValueChange={(v) => alCambiar(v as string)}
      disabled={pendiente}
    >
      <SelectTrigger aria-label="Asesor responsable" className="w-full bg-white">
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
