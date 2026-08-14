'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CloudUpload, TriangleAlert, Undo2 } from 'lucide-react'

import { cargarCaptacionEB, regresarCaptacion } from '@/lib/captaciones/acciones'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Acciones del admin sobre una captación ENVIADA: regresarla con comentarios
 * o aprobarla y cargarla a EasyBroker con un click. El switch maestro decide
 * si nace publicada (se sindica a los portales activos del App Directory de
 * EB) o apagada. La selección fina de portales vive en EasyBroker — su API
 * no la expone (verificado 2026-08-14).
 */
export function AccionesCaptacionAdmin({
  captacionId,
  titulo,
  publicable,
  asesorNombre,
}: {
  captacionId: string
  titulo: string
  publicable: boolean
  asesorNombre: string
}) {
  const router = useRouter()
  const [abiertoRegresar, setAbiertoRegresar] = useState(false)
  const [abiertoCargar, setAbiertoCargar] = useState(false)
  const [publicar, setPublicar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function alRegresar(formData: FormData) {
    setError(null)
    const comentario = String(formData.get('comentario') ?? '').trim()
    iniciarTransicion(async () => {
      const resultado = await regresarCaptacion(captacionId, comentario)
      if ('error' in resultado) {
        setError(resultado.error)
        return
      }
      toast.success(`Regresada a ${asesorNombre} con tus comentarios`)
      setAbiertoRegresar(false)
      router.refresh()
    })
  }

  function alCargar() {
    setError(null)
    iniciarTransicion(async () => {
      const resultado = await cargarCaptacionEB(captacionId, publicar)
      if ('error' in resultado) {
        setError(resultado.error)
        return
      }
      toast.success(
        publicar
          ? '¡Cargada y publicada! EasyBroker la está sindicando a los portales.'
          : 'Cargada a EasyBroker (apagada). Publícala desde EasyBroker cuando toque.'
      )
      setAbiertoCargar(false)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-2">
      <Dialog open={abiertoCargar} onOpenChange={(abrir) => { setAbiertoCargar(abrir); if (!abrir) setError(null) }}>
        <DialogTrigger
          render={
            <Button disabled={!publicable} title={publicable ? undefined : 'Faltan requisitos del checklist'}>
              <CloudUpload data-icon="inline-start" />
              Aprobar y cargar a EasyBroker
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar a EasyBroker</DialogTitle>
            <DialogDescription>
              «{titulo || 'Sin título'}» se creará en la cuenta de Montana con las iniciales de{' '}
              {asesorNombre} al final de la descripción.
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-slate-900"
              checked={publicar}
              onChange={(e) => setPublicar(e.target.checked)}
              disabled={pendiente}
            />
            <span>
              <span className="font-medium text-slate-900">Publicar de inmediato</span>
              <span className="block text-slate-500">
                Se sindica a los portales activos de EasyBroker (Inmuebles24, etc.). Si lo apagas,
                llega a EasyBroker como no publicada.
              </span>
            </span>
          </label>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Esta acción crea la propiedad REAL en EasyBroker
              {publicar ? ' y quedará visible al público en los portales' : ''}. La API no permite
              borrarla desde aquí: cualquier corrección posterior se hace en EasyBroker.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button onClick={alCargar} disabled={pendiente}>
              {pendiente ? 'Cargando a EasyBroker…' : publicar ? 'Cargar y publicar' : 'Cargar apagada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abiertoRegresar} onOpenChange={(abrir) => { setAbiertoRegresar(abrir); if (!abrir) setError(null) }}>
        <DialogTrigger
          render={
            <Button variant="outline">
              <Undo2 data-icon="inline-start" />
              Regresar con comentarios
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regresar al asesor</DialogTitle>
            <DialogDescription>
              {asesorNombre} recibe la notificación con tus comentarios y puede corregir y reenviar.
            </DialogDescription>
          </DialogHeader>

          <form action={alRegresar} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="comentario">¿Qué debe corregir?</Label>
              <Textarea
                id="comentario"
                name="comentario"
                rows={4}
                required
                placeholder="Ej. Faltan fotos de la cocina y el título debe incluir la zona…"
                disabled={pendiente}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" variant="outline" disabled={pendiente}>
                {pendiente ? 'Regresando…' : 'Regresar al asesor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
