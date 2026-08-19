'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, Copy, MoreHorizontal, Trash2 } from 'lucide-react'

import { archivarLead, eliminarLeadDefinitivo } from '@/lib/leads/acciones'
import { formatearTelefono, nombreConfirmaAlLead } from '@/lib/leads/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type Props = {
  leadId: string
  nombre: string
  telefono: string | null
  email: string | null
}

/**
 * Menú ⋯ de la hoja del lead (admin), arriba junto al nombre — que es donde
 * la gente busca las acciones de una ficha.
 *
 * Dos verbos honestos, en vez del «Eliminar» de antes que en realidad
 * archivaba:
 *   - **Archivar**: sale de la bandeja, del pipeline, de las alertas y de
 *     los números, pero sigue existiendo y se restaura desde la papelera.
 *     Es lo que se le hace a un cliente real que ya no va.
 *   - **Eliminar**: lo borra de la base con todo su rastro. Es para leads de
 *     prueba y basura, y por eso pide escribir el nombre — la misma fricción
 *     que se usa para lo irreversible. El servidor la vuelve a exigir: este
 *     diálogo no es la frontera de seguridad.
 */
export function MenuAccionesLead({ leadId, nombre, telefono, email }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [archivarAbierto, setArchivarAbierto] = useState(false)
  const [eliminarAbierto, setEliminarAbierto] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')

  function alArchivar() {
    iniciarTransicion(async () => {
      const resultado = await archivarLead(leadId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} se archivó`, {
        description: 'Lo puedes restaurar desde la papelera.',
      })
      setArchivarAbierto(false)
      router.push('/admin/leads')
      router.refresh()
    })
  }

  function alEliminar() {
    iniciarTransicion(async () => {
      const resultado = await eliminarLeadDefinitivo(leadId, { confirmacionNombre: confirmacion })
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} se borró para siempre`)
      setEliminarAbierto(false)
      router.push('/admin/leads')
      router.refresh()
    })
  }

  async function alCopiar() {
    const datos = [nombre, telefono ? formatearTelefono(telefono) : null, email]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(datos)
      toast.success('Datos del lead copiados')
    } catch {
      toast.error('El navegador no dejó copiar')
    }
  }

  // El servidor valida lo mismo; esto solo evita habilitar el botón en balde.
  const puedeEliminar = nombreConfirmaAlLead(confirmacion, nombre)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${nombre}`}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={alCopiar}>
            <Copy />
            Copiar datos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setArchivarAbierto(true)}>
            <Archive />
            Archivar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setConfirmacion('')
              setEliminarAbierto(true)
            }}
          >
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={archivarAbierto} onOpenChange={setArchivarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Archivar a {nombre}?</DialogTitle>
            <DialogDescription>
              Sale de la bandeja, del pipeline del asesor, de sus alertas y de los números del
              mes. No se pierde nada: queda en la papelera y desde ahí lo puedes restaurar tal
              como estaba.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => setArchivarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button disabled={pendiente} onClick={alArchivar}>
              {pendiente ? 'Archivando…' : 'Sí, archivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eliminarAbierto} onOpenChange={setEliminarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar a {nombre} para siempre</DialogTitle>
            <DialogDescription>
              Se borran de la base el lead y todo su rastro: notas, llamadas y WhatsApps,
              visitas, recordatorios, notificaciones y su línea de tiempo. Esto no se puede
              deshacer. Si solo quieres quitarlo de en medio, archívalo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmacion-eliminar">
              Escribe <span className="font-semibold text-slate-900">{nombre}</span> para
              confirmar
            </Label>
            <Input
              id="confirmacion-eliminar"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="off"
              placeholder={nombre}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => setEliminarAbierto(false)}
            >
              Mejor no
            </Button>
            <Button
              variant="destructive"
              disabled={pendiente || !puedeEliminar}
              onClick={alEliminar}
            >
              {pendiente ? 'Borrando…' : 'Borrar para siempre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
