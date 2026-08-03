'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, UserCheck, UserX } from 'lucide-react'

import { desactivarAsesor, reactivarAsesor } from '@/lib/asesores/acciones'
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
import { DialogEditarAsesor } from '@/components/asesores/dialog-editar-asesor'

type Asesor = {
  userId: string
  nombre: string
  telefono: string | null
  activo: boolean
}

/** Menú de acciones por fila: editar, desactivar/reactivar. */
export function MenuAccionesAsesor({ asesor }: { asesor: Asesor }) {
  const [editarAbierto, setEditarAbierto] = useState(false)
  const [confirmarAbierto, setConfirmarAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function alConfirmarDesactivar() {
    iniciarTransicion(async () => {
      const resultado = await desactivarAsesor(asesor.userId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`Se desactivó a ${asesor.nombre}`)
      setConfirmarAbierto(false)
    })
  }

  function alReactivar() {
    iniciarTransicion(async () => {
      const resultado = await reactivarAsesor(asesor.userId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`Se reactivó a ${asesor.nombre}`)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${asesor.nombre}`}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditarAbierto(true)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          {asesor.activo ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmarAbierto(true)}>
              <UserX />
              Desactivar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={alReactivar}>
              <UserCheck />
              Reactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogEditarAsesor
        asesor={asesor}
        abierto={editarAbierto}
        onAbiertoChange={setEditarAbierto}
      />

      <Dialog open={confirmarAbierto} onOpenChange={setConfirmarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar a {asesor.nombre}</DialogTitle>
            <DialogDescription>
              Sus leads no cerrados volverán a la bandeja y sus propiedades quedarán sin
              responsable. Podrás reactivarlo cuando quieras.
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
            <Button variant="destructive" disabled={pendiente} onClick={alConfirmarDesactivar}>
              {pendiente ? 'Desactivando…' : 'Desactivar asesor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
