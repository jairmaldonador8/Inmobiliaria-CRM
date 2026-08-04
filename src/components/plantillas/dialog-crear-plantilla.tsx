'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { crearPlantilla } from '@/lib/plantillas/acciones'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FormularioPlantilla } from '@/components/plantillas/formulario-plantilla'

/** Botón "Nueva plantilla" con el dialog de alta. */
export function DialogCrearPlantilla() {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setNombre('')
      setTexto('')
    }
  }

  function alEnviar() {
    setError(null)

    iniciarTransicion(async () => {
      const resultado = await crearPlantilla(nombre, texto)

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success(`Plantilla "${nombre.trim()}" creada`)
      alCambiarAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogTrigger
        render={
          <Button>
            <Plus data-icon="inline-start" />
            Nueva plantilla
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
          <DialogDescription>
            Usa las variables disponibles para personalizar el mensaje por lead.
          </DialogDescription>
        </DialogHeader>

        <form action={alEnviar} className="grid gap-4">
          <FormularioPlantilla
            idPrefix="crear-plantilla"
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
              {pendiente ? 'Creando…' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
