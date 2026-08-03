'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

import { crearAsesor } from '@/lib/asesores/acciones'
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
  DialogTrigger,
} from '@/components/ui/dialog'

/** Botón "+ Agregar asesor" con el dialog de alta. */
export function DialogCrearAsesor() {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) setError(null)
  }

  function alEnviar(formData: FormData) {
    setError(null)

    const nombre = String(formData.get('nombre') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const telefono = String(formData.get('telefono') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    iniciarTransicion(async () => {
      const resultado = await crearAsesor({ nombre, email, telefono, password })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success(`Asesor "${nombre}" creado correctamente`)
      alCambiarAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogTrigger
        render={
          <Button>
            <UserPlus data-icon="inline-start" />
            Agregar asesor
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar asesor</DialogTitle>
          <DialogDescription>
            Se creará una cuenta con la que el asesor podrá iniciar sesión de inmediato.
          </DialogDescription>
        </DialogHeader>

        <form action={alEnviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required disabled={pendiente} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pendiente}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telefono">Teléfono (opcional)</Label>
            <Input id="telefono" name="telefono" type="tel" disabled={pendiente} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={pendiente}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Creando…' : 'Crear asesor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
