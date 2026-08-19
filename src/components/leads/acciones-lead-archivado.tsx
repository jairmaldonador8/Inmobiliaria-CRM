'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'

import { eliminarLeadDefinitivo, restaurarLead } from '@/lib/leads/acciones'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  leadId: string
  nombre: string
  /** Con operación cerrada el borrado definitivo no se ofrece (0027 lo rechaza). */
  tieneOperacion: boolean
}

/**
 * Los dos caminos de salida de la papelera: devolverlo al tablero o borrarlo
 * de la base de datos.
 *
 * El borrado definitivo confirma en su propio diálogo y dice sin adornos qué
 * se lleva por delante — es la única acción del CRM que no se puede deshacer.
 */
export function AccionesLeadArchivado({ leadId, nombre, tieneOperacion }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [abierto, setAbierto] = useState(false)

  function alRestaurar() {
    iniciarTransicion(async () => {
      const resultado = await restaurarLead(leadId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} volvió al tablero`)
      router.refresh()
    })
  }

  function alBorrar() {
    iniciarTransicion(async () => {
      const resultado = await eliminarLeadDefinitivo(leadId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} se borró para siempre`)
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={alRestaurar}>
        <RotateCcw aria-hidden className="size-3.5" />
        Restaurar
      </Button>

      {tieneOperacion ? (
        <span className="text-xs text-muted-foreground">
          Tiene una operación cerrada: no se puede borrar
        </span>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pendiente}
          onClick={() => setAbierto(true)}
        >
          <Trash2 aria-hidden className="size-3.5" />
          Eliminar definitivamente
        </Button>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar a {nombre} para siempre</DialogTitle>
            <DialogDescription>
              Se borran de la base de datos el lead y todo su rastro: notas,
              llamadas y WhatsApps, visitas, recordatorios, notificaciones y su
              línea de tiempo. Esto no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              Mejor no
            </Button>
            <Button variant="destructive" disabled={pendiente} onClick={alBorrar}>
              {pendiente ? 'Borrando…' : 'Borrar para siempre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
