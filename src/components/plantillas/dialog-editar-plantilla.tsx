'use client'

import { useState, useTransition } from 'react'
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

type Plantilla = { id: string; nombre: string; texto: string }

type Props = {
  plantilla: Plantilla
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/**
 * Dialog controlado para editar nombre/texto de una plantilla existente.
 *
 * El estado de los campos NO vive aquí sino en `ContenidoEditarPlantilla`,
 * dentro de `DialogContent`. El portal de Base UI desmonta su contenido
 * cuando el dialog se cierra (`keepMounted` es false por default, ver
 * node_modules/@base-ui/react/dialog/portal), así que cada apertura monta el
 * formulario de cero y los campos nacen con los valores vigentes de la
 * plantilla — sin sincronizar nada a mano.
 *
 * Antes esto se resolvía con un useEffect que llamaba a setNombre/setTexto al
 * abrir: pintaba una vez con los valores viejos y volvía a pintar con los
 * nuevos (render en cascada, react-hooks/set-state-in-effect). El desmontaje
 * respeta la animación de salida: Base UI espera a que termine.
 */
export function DialogEditarPlantilla({ plantilla, abierto, onAbiertoChange }: Props) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar plantilla</DialogTitle>
          <DialogDescription>Actualiza el nombre o el texto del mensaje.</DialogDescription>
        </DialogHeader>

        <ContenidoEditarPlantilla
          plantilla={plantilla}
          onListo={() => onAbiertoChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ContenidoEditarPlantilla({
  plantilla,
  onListo,
}: {
  plantilla: Plantilla
  onListo: () => void
}) {
  const [nombre, setNombre] = useState(plantilla.nombre)
  const [texto, setTexto] = useState(plantilla.texto)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alEnviar() {
    setError(null)

    iniciarTransicion(async () => {
      const resultado = await editarPlantilla(plantilla.id, nombre, texto)

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success('Plantilla actualizada')
      onListo()
    })
  }

  return (
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
  )
}
