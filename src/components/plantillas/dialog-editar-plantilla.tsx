'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { editarPlantilla } from '@/lib/plantillas/acciones'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormularioPlantilla } from '@/components/plantillas/formulario-plantilla'

type Props = {
  plantilla: { id: string; nombre: string; texto: string }
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/** Dialog controlado para editar nombre/texto de una plantilla existente. */
export function DialogEditarPlantilla({ plantilla, abierto, onAbiertoChange }: Props) {
  const [nombre, setNombre] = useState(plantilla.nombre)
  const [texto, setTexto] = useState(plantilla.texto)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  // Recarga los campos cada vez que se abre (por si cambió la plantilla o se
  // había editado y cancelado antes).
  useEffect(() => {
    if (abierto) {
      setNombre(plantilla.nombre)
      setTexto(plantilla.texto)
      setError(null)
    }
  }, [abierto, plantilla.nombre, plantilla.texto])

  function alCambiarAbierto(abrir: boolean) {
    onAbiertoChange(abrir)
    if (!abrir) setError(null)
  }

  function alEnviar() {
    setError(null)

    iniciarTransicion(async () => {
      const resultado = await editarPlantilla(plantilla.id, nombre, texto)

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success('Plantilla actualizada')
      alCambiarAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar plantilla</DialogTitle>
          <DialogDescription>Actualiza el nombre o el texto del mensaje.</DialogDescription>
        </DialogHeader>

        <form action={alEnviar} className="grid gap-4">
          <FormularioPlantilla
            idPrefix="editar-plantilla"
            nombre={nombre}
            texto={texto}
            onNombreChange={setNombre}
            onTextoChange={setTexto}
            disabled={pendiente}
          />

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
