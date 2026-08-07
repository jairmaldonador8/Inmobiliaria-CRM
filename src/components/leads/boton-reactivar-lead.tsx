'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'

import { reactivarLead } from '@/lib/leads/acciones-asesor'
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
 * Revive un lead perdido y lo regresa al tablero (en «Contactado», ver
 * `reactivarLead`).
 *
 * Es a propósito una acción DISCRETA y con confirmación: el dueño del
 * producto la pidió como algo raro pero posible — «que exista la opción de
 * revivir a un muerto». Un lead perdido guarda información de un cliente
 * real, y perderla porque no hay botón sería peor que el riesgo de que
 * alguien reactive por error. La confirmación evita justamente ese error.
 *
 * Solo se pinta sobre leads en `cerrado_perdido`; los ganados no se
 * reactivan (la action lo vuelve a validar del lado del servidor — este
 * componente no es la frontera de seguridad).
 */
export function BotonReactivarLead({ leadId, nombre }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [abierto, setAbierto] = useState(false)

  function alConfirmar() {
    iniciarTransicion(async () => {
      const resultado = await reactivarLead(leadId)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(`${nombre} volvió a tu pipeline`)
      setAbierto(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setAbierto(true)}
      >
        <Undo2 aria-hidden className="size-3.5" />
        Reactivar
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivar a {nombre}</DialogTitle>
            <DialogDescription>
              El lead vuelve a tu tablero en «Contactado», con todo su historial
              intacto. Úsalo cuando un cliente que dabas por perdido regresa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pendiente} onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button disabled={pendiente} onClick={alConfirmar}>
              {pendiente ? 'Reactivando…' : 'Sí, reactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
