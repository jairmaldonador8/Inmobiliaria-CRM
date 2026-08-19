'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

import { archivarLead } from '@/lib/leads/acciones'
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
}

/**
 * «Eliminar lead» del detalle de admin: lo manda a la papelera.
 *
 * Discreto y con confirmación, igual que `BotonReactivarLead`: es la única
 * acción de esta hoja que quita al lead de la vista de todo el equipo. La
 * papelera es la red de seguridad — el borrado de la base vive en
 * /admin/leads/archivados y exige una segunda decisión.
 */
export function BotonEliminarLead({ leadId, nombre }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [abierto, setAbierto] = useState(false)

  function alConfirmar() {
    iniciarTransicion(async () => {
      const resultado = await archivarLead(leadId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} se fue a la papelera`)
      setAbierto(false)
      router.push('/admin/leads')
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setAbierto(true)}
      >
        <Trash2 aria-hidden className="size-3.5" />
        Eliminar lead
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar a {nombre}?</DialogTitle>
            <DialogDescription>
              Sale de la bandeja, del pipeline del asesor y de los números del
              mes. Nada se pierde: queda en la papelera y desde ahí lo puedes
              restaurar o borrar para siempre.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pendiente} onClick={alConfirmar}>
              {pendiente ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
