'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { actualizarAsesor } from '@/lib/asesores/acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  asesor: { userId: string; nombre: string; telefono: string | null }
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/** Dialog controlado para editar nombre/teléfono de un asesor. */
export function DialogEditarAsesor({ asesor, abierto, onAbiertoChange }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alCambiarAbierto(abrir: boolean) {
    onAbiertoChange(abrir)
    if (!abrir) setError(null)
  }

  function alEnviar(formData: FormData) {
    setError(null)

    const nombre = String(formData.get('nombre') ?? '').trim()
    const telefono = String(formData.get('telefono') ?? '').trim()

    iniciarTransicion(async () => {
      const resultado = await actualizarAsesor(asesor.userId, { nombre, telefono })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success('Asesor actualizado')
      alCambiarAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar asesor</DialogTitle>
          <DialogDescription>Actualiza el nombre o el teléfono de contacto.</DialogDescription>
        </DialogHeader>

        <form action={alEnviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="editar-nombre">Nombre</Label>
            <Input
              id="editar-nombre"
              name="nombre"
              required
              disabled={pendiente}
              defaultValue={asesor.nombre}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="editar-telefono">Teléfono (opcional)</Label>
            <Input
              id="editar-telefono"
              name="telefono"
              type="tel"
              disabled={pendiente}
              defaultValue={asesor.telefono ?? ''}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
