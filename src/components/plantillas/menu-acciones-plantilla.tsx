'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'

import { alternarActiva, eliminarPlantilla } from '@/lib/plantillas/acciones'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogEditarPlantilla } from '@/components/plantillas/dialog-editar-plantilla'

type Plantilla = { id: string; nombre: string; texto: string; activa: boolean }

/** Menú de acciones por plantilla: editar, activar/desactivar, eliminar (con confirmación). */
export function MenuAccionesPlantilla({ plantilla }: { plantilla: Plantilla }) {
  const [editarAbierto, setEditarAbierto] = useState(false)
  const [confirmarAbierto, setConfirmarAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function alAlternarActiva() {
    iniciarTransicion(async () => {
      const resultado = await alternarActiva(plantilla.id, !plantilla.activa)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(plantilla.activa ? 'Plantilla desactivada' : 'Plantilla activada')
    })
  }

  function alConfirmarEliminar() {
    iniciarTransicion(async () => {
      const resultado = await eliminarPlantilla(plantilla.id)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`Se eliminó "${plantilla.nombre}"`)
      setConfirmarAbierto(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para la plantilla ${plantilla.nombre}`}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditarAbierto(true)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={alAlternarActiva}>
            {plantilla.activa ? <PowerOff /> : <Power />}
            {plantilla.activa ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmarAbierto(true)}>
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogEditarPlantilla
        plantilla={plantilla}
        abierto={editarAbierto}
        onAbiertoChange={setEditarAbierto}
      />

      <Dialog open={confirmarAbierto} onOpenChange={setConfirmarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar «{plantilla.nombre}»</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. La plantilla dejará de estar disponible para los
              asesores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => setConfirmarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pendiente} onClick={alConfirmarEliminar}>
              {pendiente ? 'Eliminando…' : 'Eliminar plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
